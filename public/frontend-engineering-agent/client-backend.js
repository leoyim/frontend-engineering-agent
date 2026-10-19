/*
 * 静态模式的后端 —— 把原来 server.js 干的六件事搬进浏览器。
 *
 * 只在「没有服务端」时启用：部署到 GitHub Pages 之类只能托管静态文件的地方，
 * 页面加载后探测 /api/bootstrap 会拿到 404，app.js 就切到这里来。
 * 有 node server.js 在跑时，这个文件根本不会被调用。
 *
 * 与 service 端的分工是刻意对齐的：
 *   服务端把状态写进 data/*.json，这里写进 localStorage；
 *   服务端从磁盘读 knowledge/，这里读构建生成的 knowledge.json。
 * 除了存储介质，其余逻辑（检索、提示词、补丁应用）全部来自 core.js，两边同一份。
 *
 * 代价说清楚：这个形态下 API Key 必须由使用者自己填、存在自己的浏览器里，
 * 并且由浏览器直接请求模型服务 —— 站点本身不持有任何密钥。
 */
(function () {
  'use strict';

  const core = window.FBCore;

  const KEYS = {
    state: 'fb-tutor:state',
    history: 'fb-tutor:history',
    config: 'fb-tutor:config',
  };

  function readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch {
      // 存的东西坏了就当没有 —— 比让整个应用起不来好
      return fallback;
    }
  }

  function writeLS(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // 无痕模式 / 配额满时会走到这里。必须让调用方知道没存上，
      // 否则界面会显示「已保存」而实际上是空的。
      return false;
    }
  }

  /* ── 状态 ────────────────────────────────────────────────────────────── */

  function loadState() {
    const s = readLS(KEYS.state, null);
    const base = core.defaultState();
    if (!s || !s.progress) return base;
    return { ...base, ...s, progress: { ...base.progress, ...s.progress } };
  }

  function saveState(state) {
    return writeLS(KEYS.state, state);
  }

  function loadHistory() {
    const list = readLS(KEYS.history, []);
    if (!Array.isArray(list)) return [];
    return list
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-core.MAX_HISTORY);
  }

  function saveHistory(list) {
    return writeLS(KEYS.history, list.slice(-core.MAX_HISTORY));
  }

  /* ── 配置 ────────────────────────────────────────────────────────────── */

  function loadConfig() {
    return { ...core.defaultConfig(), ...readLS(KEYS.config, {}) };
  }

  function saveConfig(patch) {
    const errs = core.validateConfig(patch);
    if (errs.length) {
      return { ok: false, code: 'CONFIG_INVALID', message: errs.join('；'), details: errs };
    }
    const merged = core.normalizeConfig({ ...loadConfig(), ...patch });
    // 界面留空表示「不修改」，所以空 key 不覆盖已有的
    if (!patch.apiKey) merged.apiKey = loadConfig().apiKey;
    const stored = writeLS(KEYS.config, merged);
    if (!stored) {
      return {
        ok: false,
        message: '这个浏览器不允许本地存储（可能是无痕模式或存储已满），密钥无法保存。',
      };
    }
    return {
      ok: true,
      config: core.publicConfig(merged, merged.apiKey ? 'local' : 'none'),
      llmReady: core.configReady(merged),
    };
  }

  /* ── 知识库 ──────────────────────────────────────────────────────────── */

  let INDEX = null;
  let INDEX_PROMISE = null;

  function loadKnowledge() {
    if (INDEX) return Promise.resolve(INDEX);
    if (!INDEX_PROMISE) {
      INDEX_PROMISE = fetch('knowledge.json')
        .then((r) => {
          if (!r.ok) throw new Error('knowledge.json 加载失败（HTTP ' + r.status + '）');
          return r.json();
        })
        .then((chunks) => {
          INDEX = core.buildIndex(chunks);
          return INDEX;
        })
        .catch((e) => {
          INDEX_PROMISE = null;   // 允许下次重试
          throw e;
        });
    }
    return INDEX_PROMISE;
  }

  /* ── 对外接口：形状与 server.js 的 /api/* 逐一对应 ──────────────────── */

  async function bootstrap() {
    const index = await loadKnowledge().catch(() => null);
    const state = loadState();
    const config = loadConfig();
    return {
      ok: true,
      state: core.publicState(state),
      history: loadHistory(),
      config: core.publicConfig(config, config.apiKey ? 'local' : 'none'),
      llmReady: core.configReady(config),
      // 加载失败时给 0，让界面上的「知识库 N 片段」如实显示没接上
      knowledgeChunks: index ? index.chunks.length : 0,
    };
  }

  async function chat(message) {
    const state = loadState();
    const config = loadConfig();
    const base = loadHistory();
    const history = base.slice(-12);

    let hits = [];
    try {
      hits = core.retrieve(await loadKnowledge(), message, 4);
    } catch { /* 语料没加载上就退化成「没有资料」，与检索不到走同一条路 */ }

    const messages = [
      { role: 'system', content: core.buildSystemPrompt(state, hits) },
      ...history.map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 6000) })),
      { role: 'user', content: message },
    ];

    let raw;
    try {
      raw = await core.callLLM(config, messages);
    } catch (e) {
      return {
        ok: false,
        code: e.code || 'LLM_ERROR',
        message: e.message,
        hint: e.code === 'LLM_NOT_CONFIGURED'
          ? '请先在右上角「模型设置」里填写 API 地址与模型名。'
          : undefined,
      };
    }

    const { clean, patch, raw: patchRaw } = core.extractStatePatch(raw);
    const notes = core.applyPatch(state, patch);
    if (patchRaw === null) notes.push('本轮回复未包含状态块，进度未变动');
    else if (!patch) notes.push('状态块存在但 JSON 解析失败，进度未变动');

    // 两次都要尝试，不能短路：存储写失败时必须让使用者知道，
    // 否则他关掉页面才会发现进度和对话都没了。
    const okState = saveState(state);
    const okHistory = saveHistory([
      ...base,
      { role: 'user', content: message },
      { role: 'assistant', content: clean },
    ]);
    if (!okState || !okHistory) notes.push('本地存储写入失败，本次进度与对话不会被保存');

    return {
      ok: true,
      reply: clean,
      patchApplied: Boolean(patch),
      patchRaw,
      notes,
      state: core.publicState(state),
      historyLength: Math.min(base.length + 2, core.MAX_HISTORY),
      sources: hits.map((h) => ({ file: h.file, heading: h.heading })),
    };
  }

  async function testConfig() {
    try {
      const out = await core.callLLM(
        loadConfig(),
        [{ role: 'user', content: '只回复两个字：可用' }],
        30000
      );
      return { ok: true, reply: out.slice(0, 60) };
    } catch (e) {
      return { ok: false, code: e.code || 'ERROR', message: e.message };
    }
  }

  function reset() {
    saveState(core.defaultState());
    saveHistory([]);
    return { ok: true, state: core.publicState(loadState()), historyLength: 0 };
  }

  /* ── 组课：与 server.js 的 /api/nodes、/api/plan 对应 ──────────────────
     静态形态也要能用组课，否则「本地能生成路径、部署到 Pages 就没了」——
     这个项目已经在这类分叉上吃过一次亏（分块规则两端各写一遍）。 */

  let NODES = null;
  let NODES_PROMISE = null;

  function loadNodes() {
    if (NODES) return Promise.resolve(NODES);
    if (NODES_PROMISE) return NODES_PROMISE;
    NODES_PROMISE = fetch('nodes.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('nodes.json 拉取失败（HTTP ' + r.status + '）');
        return r.json();
      })
      .then((d) => {
        NODES = d;
        return d;
      })
      .catch((e) => {
        NODES_PROMISE = null;
        throw e;
      });
    return NODES_PROMISE;
  }

  async function nodes() {
    const d = await loadNodes();
    return {
      ok: true,
      total: d.total || d.nodes.length,
      domains: d.domains || {},
      levels: d.levels || {},
      nodes: (d.nodes || []).map((n) => ({
        id: n.id, name: n.name, domain: n.domain, level: n.level, prereq: n.prereq,
      })),
    };
  }

  async function plan(opts) {
    const d = await loadNodes();
    return { ok: true, ...core.assemblePlan(d, opts || {}) };
  }

  /** 与 server.js 的 POST /api/mode 对应。 */
  async function mode(opts) {
    const state = loadState();
    const notes = [];
    if (opts && opts.plan) {
      const r = core.assemblePlan(await loadNodes(), opts.plan);
      notes.push(core.applyPlan(state, opts.plan, r));
    } else {
      notes.push(core.setCourseMode(state, (opts && opts.mode) || 'chapter'));
    }
    saveState(state);
    return { ok: true, notes, state: core.publicState(state) };
  }

  window.FBLocalBackend = {
    isLocal: true,
    bootstrap: bootstrap,
    chat: chat,
    saveConfig: saveConfig,
    testConfig: testConfig,
    reset: reset,
    nodes: nodes,
    plan: plan,
    mode: mode,
  };
})();

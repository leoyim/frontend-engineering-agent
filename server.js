/**
 * 前端工程化学习助手 —— 本地优先的服务端
 *
 * 设计要点：
 *  1. 零第三方依赖，只用 Node 内置模块。避免装包失败导致应用跑不起来。
 *  2. 「状态外置」：学习进度、待作答题目、学习者画像全部落在 data/state.json，
 *     不寄生在对话历史里。进程重启不丢状态。
 *  3. 「进度单一口径、单调不减」：由服务端强制校验，模型改不回去。
 *  4. 知识库检索：从 knowledge/ 下的 Markdown 按标题分块检索，只把命中的片段送进模型，
 *     不把整本书塞进上下文。语料作为数据元随应用一起分发，应用自包含；
 *     也可用环境变量 KNOWLEDGE_DIR 指向别处。
 *  5. 大模型走可配置的 OpenAI 兼容端点：填自己的 key，或指向本地 Ollama。
 *     密钥可写进 data/config.json，也可由环境变量提供（部署到服务器时用后者，
 *     免得密钥以文件形式躺在仓库里）。无论哪种，密钥都永不下发给浏览器。
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

/**
 * 应用在 public/ 下的子目录。
 *
 * 静态托管（GitHub Pages）配上自定义域名后，URL 里的仓库名那一段会消失，
 * 站点整体平移到域名根 —— 没法既用自定义域名、又靠 Pages 自动拿到
 * /frontend-build-agent/ 这条路径。所以路径改成真实的目录结构：
 * 应用住在 public/frontend-build-agent/，站点根只放一个跳转页。
 *
 * 本地服务保持同一形态（下面会把 /frontend-build-agent/api/* 也挂上），
 * 这样「子路径下相对探测后端」这类只在线上才暴露的问题，本地就能碰到。
 */
const APP_DIR = 'frontend-build-agent';
const APP_BASE = '/' + APP_DIR;

/**
 * Node 与浏览器共用的内核：课程结构、状态补丁、BM25 检索、系统提示词、模型调用。
 * 之所以抽出去，是因为应用现在有两个交付形态：
 *   · node server.js —— 服务端持有密钥与数据文件
 *   · 纯静态托管      —— 同一份 public/ 直接交给 GitHub Pages，全部逻辑在浏览器里跑
 * 逻辑只能有一份，否则改一处忘一处。
 */
const core = require(path.join(ROOT, 'public', APP_DIR, 'core.js'));
const {
  MAX_HISTORY,
  defaultState, applyPatch, extractStatePatch,
  validateConfig, normalizeConfig, configReady,
  buildIndex, retrieve, assemblePlan, prereqClosure,
  applyPlan, setCourseMode, courseSections, courseProgress,
  buildSystemPrompt, callLLM, publicConfig, publicState,
} = core;

const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

/**
 * 知识库来源 —— 就是项目内的 knowledge/。
 *
 * 早先这里是「就地读取同级的 frontend-build-learning-book/」，理由是不复制、
 * 避免双份真相。但那个方案有个前提：应用必须和电子书并排放着。
 * 一旦要部署到服务器、只带走应用本身，这个前提就不成立了。
 * 所以现在把语料作为数据元放进 knowledge/，应用自包含 —— 这是为可部署性付的代价，
 * 也是值得的：复制带来的版本漂移，用「这份拷贝只在应用仓库里维护」来抵。
 *
 * 优先级：显式环境变量 > 项目内 knowledge/。同级目录的回退已移除，
 * 因为留着它就等于允许出现「应用指向的书和仓库里的书不是同一份」这种状态。
 */
function resolveKnowledgeDir() {
  const candidates = [
    process.env.KNOWLEDGE_DIR,
    path.join(ROOT, 'knowledge'),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return path.resolve(c);
    } catch { /* 忽略不可读候选，继续找下一个 */ }
  }
  return path.join(ROOT, 'knowledge');
}
const KNOWLEDGE_DIR = resolveKnowledgeDir();

const PORT = Number(process.env.PORT || 7310);

/* ────────────────────────────── 课程结构 ────────────────────────────── */

/**
 * 总规划节数在开篇一次冻结 —— 这是「进度可判定」的前提。
 * 要改必须明说，并且会记进 changelog。
 */

/* ────────────────────────────── 状态台账 ────────────────────────────── */

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadState() {
  const s = readJson(STATE_FILE, null);
  if (!s || !s.progress) {
    const fresh = defaultState();
    // 首次落盘：让「状态外置」这件事在文件系统上看得见，而不是只存在于内存里。
    try { saveState(fresh); } catch { /* 只读文件系统下退化为内存态，不阻断启动 */ }
    return fresh;
  }
  // 老文件可能缺字段，补齐但不覆盖
  const base = defaultState();
  return { ...base, ...s, progress: { ...base.progress, ...s.progress } };
}

function saveState(state) {
  writeJson(STATE_FILE, state);
}

/* ────────────────────────────── 对话历史 ────────────────────────────── */

/**
 * 对话历史也落盘。
 *
 * 原设计是「对话记录刻意不保存 —— 它是过程，不是状态」，理由是状态与过程分工。
 * 但实际使用里这条分工站不住：刷新页面后想回看上一轮讲过的原文、想想自己错在哪，
 * 全都拿不回来，而学习恰恰依赖回看。所以改成和进度一样持久化。
 *
 * 由服务端持有，而不是浏览器 localStorage：这个应用本来就是单用户、
 * 状态全在服务端，历史放浏览器会让「换浏览器就断片」，
 * 与「刷新或重启不丢」的承诺不一致。
 */

function loadHistory() {
  const list = readJson(HISTORY_FILE, null);
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY);
}

function saveHistory(list) {
  writeJson(HISTORY_FILE, list.slice(-MAX_HISTORY));
}

/* ────────────────────────────── 配置 ────────────────────────────── */

/**
 * 环境变量覆盖 —— 部署到服务器时用这个，别把密钥写成仓库里的文件。
 * 没设的变量不参与覆盖，所以「只给密钥、地址仍从界面配」这种半配置也成立。
 */
function envOverrides() {
  const map = {
    LLM_BASE_URL: 'baseUrl',
    LLM_API_KEY: 'apiKey',
    LLM_MODEL: 'model',
    LLM_TEMPERATURE: 'temperature',
    LLM_MAX_TOKENS: 'maxTokens',
  };
  const out = {};
  for (const [env, key] of Object.entries(map)) {
    const v = process.env[env];
    if (v !== undefined && v !== '') out[key] = v;
  }
  return out;
}

function loadConfig() {
  // defaultConfig 只在 core 里，没有解构进来 —— 这里必须走命名空间
  return { ...core.defaultConfig(), ...readJson(CONFIG_FILE, {}), ...envOverrides() };
}

/** 密钥是环境变量提供的？决定要不要把它写回文件，也决定界面怎么提示。 */
function apiKeyFromEnv() {
  return Boolean(process.env.LLM_API_KEY);
}

/** 校验与归一化都在内核里（core.validateConfig / core.normalizeConfig），两端同一套。 */
function saveConfig(patch) {
  const errs = validateConfig(patch);
  if (errs.length) {
    const err = new Error(errs.join('；'));
    err.code = 'CONFIG_INVALID';
    err.details = errs;
    throw err;
  }
  // 合并基准必须是「文件里的配置」，不能是 loadConfig()：
  // loadConfig() 含环境变量覆盖，拿它当基准会把环境里的密钥原样写进磁盘。
  const toFile = normalizeConfig({ ...core.defaultConfig(), ...readJson(CONFIG_FILE, {}), ...patch });
  // 密钥由环境变量提供时，磁盘上不留任何副本：环境才是唯一来源，
  // 免得同一把密钥散落在两处、其中一处还是明文躺在仓库工作区里。
  if (apiKeyFromEnv()) delete toFile.apiKey;
  writeJson(CONFIG_FILE, toFile);
  // 返回「生效的」配置（环境变量优先），调用方拿它去渲染界面
  return loadConfig();
}

function llmReady() {
  return configReady(loadConfig());
}

/* ────────────────────────────── 知识库 ────────────────────────────── */

/** 项目内的绝对路径 -> 展示用的相对路径。提示语里不再手写字面量 */
const displayPath = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const KNOWLEDGE_FILE = path.join(PUBLIC_DIR, APP_DIR, 'knowledge.json');

/**
 * 语料的唯一来源是 public/frontend-build-agent/knowledge.json
 * —— 由 tools/build-knowledge.js
 * 从 knowledge/ 的 Markdown 生成，服务端与浏览器读的是同一份。
 *
 * 早先服务端是自己遍历 knowledge/ 的。改成读生成物，是为了杜绝
 * 「两端分块规则分叉」：一旦分叉，同一个问题在本地跑和在 Pages 上跑会
 * 检索到不同资料，而且两边都不会报错。分块只做一次的代价是引入一个构建步骤，
 * 换来的是「两个形态的检索行为按构造相同」。
 *
 * 索引建一次就缓存：350+ 个片段每次查询重新分词太浪费。
 */
let INDEX = null;

function loadKnowledge() {
  if (INDEX) return INDEX;
  INDEX = buildIndex(readJson(KNOWLEDGE_FILE, []));
  return INDEX;
}

/**
 * 结构化节点数据（179 个知识点 + 前置依赖），由 tools/build-nodes.js 生成。
 * 它不进检索索引 —— 地图的用途是**给组课读结构**，不是让模型检索表格。
 */
const NODES_FILE = path.join(PUBLIC_DIR, APP_DIR, 'nodes.json');
let NODES = null;

function loadNodes() {
  if (!NODES) NODES = readJson(NODES_FILE, { nodes: [], order: [], domains: {} });
  return NODES;
}

/**
 * 生成物新鲜度检查：knowledge/ 里的 Markdown 比 knowledge.json 新，
 * 就说明改了语料却没重新生成 —— 此时应用会静默地用旧语料作答。
 * 不做成硬错误：改了语料但还没生成，也不该拦着人启动。
 */
function knowledgeWarning() {
  try {
    if (!fs.existsSync(KNOWLEDGE_FILE)) {
      return displayPath(KNOWLEDGE_FILE) + ' 不存在 —— 请先运行 npm run build:knowledge';
    }
    if (!loadKnowledge().chunks.length) {
      return displayPath(KNOWLEDGE_FILE) + ' 里没有任何片段 —— 检索会永远返回空';
    }
    const generated = fs.statSync(KNOWLEDGE_FILE).mtimeMs;
    let newest = 0;
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
          if (name !== 'tools' && name !== 'assets') walk(full);
          continue;
        }
        if (name.endsWith('.md')) newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    };
    walk(KNOWLEDGE_DIR);
    if (newest > generated) {
      return 'knowledge/ 里有文件比 ' + displayPath(KNOWLEDGE_FILE)
        + ' 新 —— 请重新运行 npm run build:knowledge';
    }
  } catch { /* 检查本身失败不该影响启动 */ }
  return null;
}

/* ────────────────────────────── HTTP ────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  // 目录以 index.html 收尾：站点根 / 与应用目录 /frontend-build-agent/
  // 各自落到自己的首页，不必为每个目录单独写一条路由。
  let rel = urlPath.replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';

  const full = path.join(PUBLIC_DIR, rel);

  // 防目录穿越。用 path.relative 判断，而不是 startsWith 前缀比较：
  // 前缀比较会把 public-x/ 这种「同前缀的兄弟目录」一起放行。
  const back = path.relative(PUBLIC_DIR, full);
  if (back.startsWith('..') || path.isAbsolute(back)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

/** 脱敏后的配置：密钥永不下发，只回一个"有没有"的布尔。 */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // 应用挂在 /frontend-build-agent/ 下，而前端用相对路径探测后端
  // （fetch('api/bootstrap')），落到这里就是 /frontend-build-agent/api/bootstrap。
  // 所以只对 API 去掉这层前缀 —— 静态文件本身就是按该目录结构摆放的，不改写。
  // 不做成「去掉前缀后再统一路由」：那样 /frontend-build-agent/ 会被归一成 /，
  // 而 / 要服务的是站点根的跳转页，不是应用本身。
  let p = url.pathname;
  if (p.startsWith(APP_BASE + '/api/')) p = p.slice(APP_BASE.length);

  try {
    // 部署用的健康检查：负载均衡 / 容器编排都要一个不依赖模型的探针。
    // 刻意不查模型连通性 —— 模型抖动不该让整个实例被判为 unhealthy。
    if (p === '/api/health' && req.method === 'GET') {
      const chunks = loadKnowledge().chunks.length;
      return sendJson(res, 200, {
        ok: true,
        uptime: Math.round(process.uptime()),
        knowledgeChunks: chunks,
        llmReady: llmReady(),
      });
    }

    if (p === '/api/bootstrap' && req.method === 'GET') {
      const state = loadState();
      return sendJson(res, 200, {
        ok: true,
        state: publicState(state),
        // 历史随首屏一起下发，前端据此把上一次的对话恢复出来
        history: loadHistory(),
        config: publicConfig(loadConfig(), apiKeyFromEnv() ? 'env' : undefined),
        llmReady: llmReady(),
        knowledgeChunks: loadKnowledge().chunks.length,
      });
    }

    if (p === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      const patch = {};
      for (const k of ['baseUrl', 'model', 'temperature', 'maxTokens']) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      // 密钥只在非空时覆盖，避免误清空
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
        patch.apiKey = body.apiKey.trim();
      }
      let cfg;
      try {
        cfg = saveConfig(patch);
      } catch (e) {
        if (e.code === 'CONFIG_INVALID') {
          return sendJson(res, 400, { ok: false, code: e.code, message: e.message, details: e.details });
        }
        throw e;
      }
      return sendJson(res, 200, {
        ok: true, config: publicConfig(cfg, apiKeyFromEnv() ? 'env' : undefined), llmReady: llmReady(),
      });
    }

    if (p === '/api/config/test' && req.method === 'POST') {
      try {
        const out = await callLLM(loadConfig(), [
          { role: 'user', content: '只回复两个字：可用' },
        ]);
        return sendJson(res, 200, { ok: true, reply: out.slice(0, 60) });
      } catch (e) {
        return sendJson(res, 200, { ok: false, code: e.code || 'ERROR', message: e.message });
      }
    }

    if (p === '/api/knowledge/search' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const hits = retrieve(loadKnowledge(), q, 6);
      return sendJson(res, 200, {
        ok: true,
        query: q,
        hits: hits.map((h) => ({
          file: h.file, heading: h.heading,
          score: Number(h.score.toFixed(4)),
          preview: h.text.slice(0, 200),
        })),
      });
    }

    /**
     * 组课：把「学哪些节点」交给调用方（模型或界面），
     * 「前置闭包 + 拓扑排序」由内核保证 —— 见 core.js 的 assemblePlan 注释。
     */
    if (p === '/api/plan' && req.method === 'GET') {
      const list = (k) => (url.searchParams.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
      const plan = assemblePlan(loadNodes(), {
        targets: list('targets'),
        domains: list('domains'),
        levels: list('levels'),
        maxNodes: Number(url.searchParams.get('max')) || 0,
      });
      return sendJson(res, 200, { ok: true, ...plan });
    }

    /** 节点清单：给界面做选择器，也便于排查"某个节点为什么没进计划"。 */
    if (p === '/api/nodes' && req.method === 'GET') {
      const d = loadNodes();
      return sendJson(res, 200, {
        ok: true,
        total: d.total || d.nodes.length,
        domains: d.domains || {},
        levels: d.levels || {},
        nodes: (d.nodes || []).map((n) => ({
          id: n.id, name: n.name, domain: n.domain, level: n.level, prereq: n.prereq,
        })),
      });
    }

    /**
     * 切换课程模式（界面的开关走这里，模型走状态补丁）。
     * body:
     *   { mode: 'chapter' }                       —— 切回固定章表
     *   { plan: {...} }  / { plan: {...}, mode:'plan' } —— 组一条新路径并切过去
     *   { mode: 'plan' }                          —— 已有路径时直接切
     */
    if (p === '/api/mode' && req.method === 'POST') {
      const body = await readBody(req);
      const state = loadState();
      const notes = [];
      if (body.plan && typeof body.plan === 'object') {
        const r = assemblePlan(loadNodes(), body.plan);
        notes.push(applyPlan(state, body.plan, r));
      } else {
        notes.push(setCourseMode(state, String(body.mode || 'chapter')));
      }
      saveState(state);
      return sendJson(res, 200, { ok: true, notes, state: publicState(state) });
    }

    if (p === '/api/chat' && req.method === 'POST') {
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (!message) return sendJson(res, 400, { ok: false, message: '消息不能为空' });

      const state = loadState();
      // 上下文以服务端落盘的那份为准。只在它为空时回退到请求体，
      // 免得旧客户端（还没重新加载）突然接不上上下文。
      const stored = loadHistory();
      const fallback = (Array.isArray(body.history) ? body.history : [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
      const base = stored.length ? stored : fallback;
      const history = base.slice(-12);
      const hits = retrieve(loadKnowledge(), message, 4);

      const messages = [
        { role: 'system', content: buildSystemPrompt(state, hits) },
        ...history.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || '').slice(0, 6000),
        })),
        { role: 'user', content: message },
      ];

      let raw;
      try {
        raw = await callLLM(loadConfig(), messages);
      } catch (e) {
        return sendJson(res, 200, {
          ok: false,
          code: e.code || 'LLM_ERROR',
          message: e.message,
          hint: e.code === 'LLM_NOT_CONFIGURED'
            ? '请先在右上角「模型设置」里填写 API 地址与模型名。'
            : undefined,
        });
      }

      const { clean, patch, raw: patchRaw } = extractStatePatch(raw);
      const notes = applyPatch(state, patch);
      // 组课请求由**程序**执行：模型只说"学哪些"，闭包与排序在这里算
      if (patch && patch.plan) {
        const r = assemblePlan(loadNodes(), patch.plan);
        notes.push(core.applyPlan(state, patch.plan, r));
      } else if (patch && patch.course_mode) {
        notes.push(core.setCourseMode(state, patch.course_mode));
      }
      // 区分「模型压根没吐状态块」与「吐了但格式坏了」—— 两者表现都是进度不动，
      // 但排查方向完全不同，必须在返回值里能分辨。
      if (patchRaw === null) {
        notes.push('本轮回复未包含状态块，进度未变动');
      } else if (!patch) {
        notes.push('状态块存在但 JSON 解析失败，进度未变动');
      }
      saveState(state);

      // 只在这一轮真的走完时落盘。调用失败时若把用户那句也存下来，
      // 下次打开会看到一条没有回复的提问，比丢掉更让人困惑。
      // 存的是 clean（已剥掉 ```state 协议块），回放时不该出现内部协议。
      const nextHistory = [
        ...base,
        { role: 'user', content: message },
        { role: 'assistant', content: clean },
      ];
      saveHistory(nextHistory);

      return sendJson(res, 200, {
        ok: true,
        reply: clean,
        patchApplied: Boolean(patch),
        patchRaw,
        notes,
        state: publicState(state),
        historyLength: Math.min(nextHistory.length, MAX_HISTORY),
        sources: hits.map((h) => ({ file: h.file, heading: h.heading })),
      });
    }

    if (p === '/api/reset' && req.method === 'POST') {
      const state = defaultState();
      state.changelog.push({
        date: new Date().toISOString().slice(0, 10),
        change: '学习者手动重置学习状态（含对话历史）',
        reason: '用户操作',
      });
      saveState(state);
      // 重置要连对话历史一起清掉：学习者点这个按钮的语义是「从头开始」，
      // 留着旧对话会让进度和上下文对不上（重新从第 1 节讲，但模型仍看得见后面的内容）。
      saveHistory([]);
      return sendJson(res, 200, { ok: true, state: publicState(state), historyLength: 0 });
    }

    if (p.startsWith('/api/')) {
      return sendJson(res, 404, { ok: false, message: 'Not Found' });
    }

    return serveStatic(req, res, p);
  } catch (e) {
    return sendJson(res, 500, { ok: false, message: e.message });
  }
});

server.listen(PORT, () => {
  const chunks = loadKnowledge().chunks.length;
  console.log('');
  console.log('  前端工程化学习助手  已启动');
  console.log('  ──────────────────────────────────────');
  // 打印的是应用的完整地址（含子路径）—— 直接复制就能打开。
  // 站点根会跳转到这里，但没必要让人先看一次跳转。
  console.log(`  地址      http://localhost:${PORT}${APP_BASE}/`);
  console.log(`  知识库    ${chunks} 个片段（来自 knowledge/，经 ${displayPath(KNOWLEDGE_FILE)}）`);
  const warn = knowledgeWarning();
  if (warn) console.log(`  ⚠ 语料      ${warn}`);
  console.log(`  状态文件  data/state.json（进度）+ data/history.json（对话，${loadHistory().length} 条）`);
  console.log(`  模型      ${llmReady() ? loadConfig().model : '未配置 —— 请在页面右上角「模型设置」里填写'}`);
  console.log('');
});

/*
 * 前端工程化学习助手 · 共享内核
 *
 * Node 与浏览器共用同一份：课程结构、状态补丁、BM25 检索、系统提示词、模型调用。
 * 抽出它是因为应用现在有两个部署形态：
 *   · node server.js  —— 服务端持有密钥与数据文件
 *   · 纯静态托管       —— 同一份 public/ 直接丢给 GitHub Pages，全部逻辑在浏览器里跑
 * 两个形态各写一份逻辑的话，改一处忘一处是迟早的事。
 *
 * 本文件不碰 fs / process / DOM，只做纯计算与 fetch，两边都能跑。
 * 唯一的例外是 readFile/require，都已经被 UMD 包装处理掉了。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FBCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── 课程结构 ──────────────────────────────────────────────────────────
     总规划节数在开篇一次冻结 —— 这是「进度可判定」的前提。 */

  /* <COURSE:BEGIN> 由 tools/build-course.js 生成，勿手改 */
  const COURSE = [
    { id: 'D0.1', module: 'D0 入门基础', title: '写出第一个页面', minutes: 15 },
    { id: 'D0.2', module: 'D0 入门基础', title: '让页面好看', minutes: 16 },
    { id: 'D0.3', module: 'D0 入门基础', title: '让页面有逻辑', minutes: 14 },
    { id: 'D0.4', module: 'D0 入门基础', title: '语言的深水区', minutes: 14 },
    { id: 'D0.5', module: 'D0 入门基础', title: '看懂浏览器与渲染', minutes: 9 },
    { id: 'D0.6', module: 'D0 入门基础', title: '网络与 HTTP 缓存', minutes: 13 },
    { id: 'D0.7', module: 'D0 入门基础', title: '走进工程世界', minutes: 22 },
    { id: 'D0.8', module: 'D0 入门基础', title: '无障碍与国际化', minutes: 8 },
    { id: 'D1.1', module: 'D1 规范与协作', title: '统一写法并让它自动生效', minutes: 26 },
    { id: 'D1.2', module: 'D1 规范与协作', title: '统一提交与协作流程', minutes: 24 },
    { id: 'D1.3', module: 'D1 规范与协作', title: '规模化与治理', minutes: 19 },
    { id: 'D2.1', module: 'D2 语言与模块化', title: '模块体系：从脚本到标准', minutes: 12 },
    { id: 'D2.2', module: 'D2 语言与模块化', title: '包管理与仓库架构', minutes: 14 },
    { id: 'D2.3', module: 'D2 语言与模块化', title: 'TypeScript 与类型工程化', minutes: 15 },
    { id: 'D3.1', module: 'D3 构建与打包', title: '从源码到产物：构建在做什么', minutes: 13 },
    { id: 'D3.2', module: 'D3 构建与打包', title: '配置与环境：把默认值改对', minutes: 17 },
    { id: 'D3.3', module: 'D3 构建与打包', title: '产物是怎么被算出来的', minutes: 26 },
    { id: 'D3.4', module: 'D3 构建与打包', title: '依赖图、产物与扩展点', minutes: 22 },
    { id: 'D3.5', module: 'D3 构建与打包', title: '开发体验：快是从哪来的', minutes: 19 },
    { id: 'D3.6', module: 'D3 构建与打包', title: '新一代工具：原生化', minutes: 23 },
    { id: 'D3.7', module: 'D3 构建与打包', title: '构建性能：先有指标，再谈优化', minutes: 9 },
    { id: 'D3.8', module: 'D3 构建与打包', title: '缓存、产物与 Hash 稳定性', minutes: 10 },
    { id: 'D3.9', module: 'D3 构建与打包', title: '深度定制、选型与迁移', minutes: 11 },
    { id: 'D4.1', module: 'D4 样式工程', title: '样式方案选型与组织', minutes: 19 },
    { id: 'D4.2', module: 'D4 样式工程', title: '样式工程化', minutes: 16 },
    { id: 'D4.3', module: 'D4 样式工程', title: '设计系统与主题', minutes: 14 },
    { id: 'D5.1', module: 'D5 质量与测试', title: '静态质量门：三类检查怎么分工', minutes: 16 },
    { id: 'D5.2', module: 'D5 质量与测试', title: '测试层级与基础设施', minutes: 18 },
    { id: 'D5.3', module: 'D5 质量与测试', title: '效率与门禁', minutes: 14 },
    { id: 'D5.4', module: 'D5 质量与测试', title: '体系与度量', minutes: 10 },
    { id: 'D6.1', module: 'D6 交付与运维', title: '一次发布：从产物到线上', minutes: 12 },
    { id: 'D6.2', module: 'D6 交付与运维', title: '流水线：从提交到成套制品', minutes: 13 },
    { id: 'D6.3', module: 'D6 交付与运维', title: '分发与上线：CDN、缓存与发布策略', minutes: 13 },
    { id: 'D6.4', module: 'D6 交付与运维', title: '上线之后：可观测与性能', minutes: 15 },
    { id: 'D6.5', module: 'D6 交付与运维', title: '构建性能的长期度量', minutes: 10 },
    { id: 'X1.1', module: 'X1 工程化与脚手架', title: '脚手架与代码生成', minutes: 15 },
    { id: 'X2.1', module: 'X2 架构模式', title: '渲染形态与数据获取', minutes: 13 },
    { id: 'X2.2', module: 'X2 架构模式', title: 'SSR 的工程实现与同构边界', minutes: 11 },
    { id: 'X2.3', module: 'X2 架构模式', title: '服务端形态', minutes: 13 },
    { id: 'X2.4', module: 'X2 架构模式', title: '微前端', minutes: 15 },
    { id: 'X3.1', module: 'X3 AI 与工程化', title: '视角与边界', minutes: 14 },
    { id: 'X3.2', module: 'X3 AI 与工程化', title: 'AI 在流程中的位置', minutes: 10 },
  ];
  /* <COURSE:END> */

  const TOTAL_SECTIONS = COURSE.length;

  /** 对话历史上限。不设限的话上下文和存储都会无限膨胀。 */
  const MAX_HISTORY = 400;

  /**
   * 两种课程模式并存（2026-10-19 用户决定）。
   *
   *   chapter —— 固定 42 章课表，分母 = 42。
   *   plan    —— 按需组装的一条路径（节点级），分母 = 该路径的节数。
   *
   * 为什么两种模式**各有独立的 completed 与 current**：
   * 一份进度里如果混着"章的 id"和"节点的 id"，分母就说不清了 ——
   * 切回章模式时进度会突然从 3/24 变成 3/42，用户会以为数据坏了。
   * 分开存之后，来回切换是**无损的**：各自的进度原地保留。
   */
  function defaultState() {
    return {
      course: '前端工程化（十领域 · 42 章）',
      course_mode: 'chapter',
      plan: null,
      established: new Date().toISOString().slice(0, 10),
      progress: {
        total_sections: TOTAL_SECTIONS,
        progress_formula: '已完成节数 ÷ 总规划节数（三条齐才算完成：作答 + 批改 + 确认）',
        completed: [],
        current: null,
        completed_plan: [],
        current_plan: null,
        pending_answer: [],
        pending_confirm: [],
      },
      learner_profile: [],
      changelog: [],
      session: 'ASKING',
    };
  }

  /* ── 课程组装：从前置依赖图排出可执行的学习路径 ──────────────────────
     分工是刻意的：**模型决定「学哪些」（判断），这里保证「顺序与闭包」（正确性）**。
     把闭包与排序留给模型的后果是偶发的「跳前置 / 顺序反了」，而这类错误在
     对话里看起来很正常 —— 学习者要到卡住时才发现，很难归因。
     所以这两件事必须由代码做，且可重复：同一份输入永远排出同一个序列。 */

  /**
   * 取前置闭包（只往「前置」方向扩，绝不拉后继）。
   * @param {Map<string, object>} byId
   * @param {string[]} ids 目标节点
   * @returns {Set<string>} 含目标的完整前置集
   */
  function prereqClosure(byId, ids) {
    const out = new Set();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id) || !byId.has(id)) continue;
      out.add(id);
      for (const p of byId.get(id).prereq) stack.push(p);
    }
    return out;
  }

  /**
   * 组装学习计划。
   *
   * @param {object} data nodes.json（{ nodes, order, domains }）
   * @param {object} opts
   *   - targets: string[]  指定节点（模型选出来的）；给了就只用它
   *   - domains: string[]  没给 targets 时，按领域筛（如 ['D5']）
   *   - levels:  string[]  按层级筛（如 ['L1','L2']）
   *   - maxNodes: number   上限；超了优先砍高层节点，保住前置
   *   - minutesPerNode: number 每节点预估分钟（纯展示）
   * @returns {{sections:object[], nodeIds:string[], truncated:boolean, stats:object}}
   */
  function assemblePlan(data, opts) {
    const o = opts || {};
    const nodes = (data && data.nodes) || [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const order = (data && data.order) || nodes.map((n) => n.id);
    const minutesPerNode = o.minutesPerNode || 8;

    // ① 选目标集：优先 targets；否则按领域/层级筛
    let picked;
    if (Array.isArray(o.targets) && o.targets.length) {
      picked = o.targets.filter((id) => byId.has(id));
    } else {
      picked = nodes
        .filter((n) => (!o.domains || !o.domains.length || o.domains.includes(n.domain)))
        .filter((n) => (!o.levels || !o.levels.length || o.levels.includes(n.level)))
        .map((n) => n.id);
    }

    // ② 前置闭包 —— 缺前置的路径不成立
    let set = prereqClosure(byId, picked);

    /* ③ 上限怎么守 —— 这里必须区分两种输入，否则会给出一条缺前置的路径。
       判据只有一句：**闭包是不可分割的**。要学 X 就必须连同 X 的全部前置一起给，
       少一个就不成立；所以能砍的从来不是"闭包里的某个节点"，而是"要不要这个目标"。

       · 给了 targets（模型点名要学的）→ 目标不砍。上限变成**提示**：
         装不下就照实返回全量，并回报 needed，让上层说"这需要 N 节，你给的是 M"。
       · 只给 domains / levels（一片范围）→ 目标本身就是可伸缩的：
         逐个去掉范围里"最难的那个"，直到闭包装得下。 */
    let truncated = false;
    let needed = set.size;
    const droppedTargets = [];
    const max = Number(o.maxNodes) || 0;
    const hasExplicitTargets = Array.isArray(o.targets) && o.targets.length > 0;
    const rank = { L1: 1, L2: 2, L3: 3, L4: 4 };

    if (max > 0 && set.size > max && !hasExplicitTargets) {
      truncated = true;
      // 可伸缩：反复去掉范围里层级最高（最靠后）的那个节点，再重算闭包
      const scope = [...picked].sort((a, b) => {
        const lv = rank[byId.get(b).level] - rank[byId.get(a).level];
        return lv !== 0 ? lv : (a < b ? 1 : -1);
      });
      while (set.size > max && scope.length) {
        const victim = scope.shift();
        droppedTargets.push(victim);
        set = prereqClosure(byId, scope);
      }
      needed = set.size;
    } else if (max > 0 && set.size > max) {
      // 明确目标：不动它，把"装不下"作为事实回报
      truncated = true;
      needed = set.size;
    }

    // ④ 按全局拓扑序输出（稳定、且与「零基础完整路径」一致）
    const nodeIds = order.filter((id) => set.has(id));

    // ⑤ 转成课程节：领域名做分组标题，节点名做节标题
    const domainLabel = (data && data.domains) || {};
    const sections = nodeIds.map((id) => {
      const n = byId.get(id);
      return {
        id,
        module: (domainLabel[n.domain] ? n.domain + ' ' + domainLabel[n.domain] : n.domain),
        title: n.name,
        minutes: minutesPerNode,
        level: n.level,
      };
    });

    const byDomain = {};
    for (const id of nodeIds) {
      const d = byId.get(id).domain;
      byDomain[d] = (byDomain[d] || 0) + 1;
    }

    return {
      sections,
      nodeIds,
      truncated,
      stats: {
        requested: picked.length,
        withPrereq: set.size,
        total: nodeIds.length,
        byDomain,
        // 上限装不下时照实回报需要的节数，上层据此提示，而不是默默少学
        needed,
        droppedTargets,
      },
    };
  }

  /** 当前模式下的课表：章模式是固定 42 章，计划模式是组装出来的那条路径。 */
  function courseSections(state) {
    if (state && state.course_mode === 'plan' && state.plan && Array.isArray(state.plan.sections)) {
      return state.plan.sections;
    }
    return COURSE;
  }

  /** 当前模式下的已完成列表与当前节 —— 两个模式各存各的，切换无损。 */
  function courseProgress(state) {
    const isPlan = state && state.course_mode === 'plan';
    const p = (state && state.progress) || {};
    return {
      isPlan,
      completed: (isPlan ? p.completed_plan : p.completed) || [],
      current: isPlan ? p.current_plan : p.current,
    };
  }

  /** 进度 = 已完成节数 ÷ 总规划节数。单一口径，但分母随模式变。 */
  function computeProgress(state) {
    const { isPlan, completed } = courseProgress(state);
    const done = completed.length;
    // 计划模式下分母是该路径的节数；没有计划时是 0，界面据此提示"先组课"
    const total = isPlan
      ? ((state.plan && state.plan.sections ? state.plan.sections.length : 0) || 0)
      : (state.progress.total_sections || TOTAL_SECTIONS);
    return {
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
      formula: isPlan
        ? '计划模式：已完成节数 ÷ 本条路径的节数（三条齐才算完成：作答 + 批改 + 确认）'
        : state.progress.progress_formula,
      mode: isPlan ? 'plan' : 'chapter',
    };
  }

  /**
   * 切换课程模式。**只切指针，不动任何进度数据** —— 这也是"无损"的实现处。
   * @returns {string} 给使用者看的一句提示
   */
  function setCourseMode(state, mode) {
    const next = mode === 'plan' ? 'plan' : 'chapter';
    const prev = state.course_mode === 'plan' ? 'plan' : 'chapter';
    if (prev === next) return '已经是' + (next === 'plan' ? '计划' : '章') + '模式，未变';

    if (next === 'plan' && !(state.plan && state.plan.sections && state.plan.sections.length)) {
      return '还没有生成学习路径 —— 计划模式需要先组课';
    }
    state.course_mode = next;
    const p = computeProgress(state);
    return '已切换到' + (next === 'plan' ? '计划' : '章') + '模式：'
      + (next === 'plan' ? '当前路径 ' + p.total + ' 节' : '固定 ' + p.total + ' 章')
      + '，已完成 ' + p.done + ' / ' + p.total
      + '（两种模式的进度各自保存，切回去不会丢）';
  }

  /**
   * 写入一条组装好的计划并切到计划模式。
   * planResult 来自 assemblePlan；spec 是原始的组课条件（用于展示与重新生成）。
   * @returns {string} 提示
   */
  function applyPlan(state, spec, planResult) {
    const sections = (planResult && planResult.sections) || [];
    if (!sections.length) return '组课结果为空，未切换模式';

    state.plan = {
      spec: spec || {},
      sections,
      generated_at: new Date().toISOString().slice(0, 10),
      stats: (planResult && planResult.stats) || {},
      truncated: Boolean(planResult && planResult.truncated),
    };
    state.course_mode = 'plan';
    // 注意：**不要**改 progress.total_sections —— 那是章模式的分母（42）。
    // 计划模式的分母直接取 plan.sections.length，两个分母互不影响。
    // 计划换了，旧的"当前节"很可能不在新路径里 —— 留着会让界面显示一个幽灵节
    const ids = new Set(sections.map((s) => s.id));
    if (state.progress.current_plan && !ids.has(state.progress.current_plan)) {
      state.progress.current_plan = null;
    }
    // 已完成里不在新路径上的条目保留（它们是历史），但不再计入本条路径的分母，
    // 所以这里只提示，不静默删除。
    const stale = (state.progress.completed_plan || []).filter((c) => !ids.has(c.id)).length;
    return '已生成学习路径：' + sections.length + ' 节（'
      + Object.keys((planResult.stats && planResult.stats.byDomain) || {}).length + ' 个领域），已切到计划模式'
      + (stale ? '；' + stale + ' 条旧的完成记录不在新路径上，不计入本条分母' : '');
  }

  /* ── 知识库：分块与 BM25 检索 ──────────────────────────────────────────
     检索的实现放在这里，是因为它现在有两个调用方：
     服务端读服务器磁盘上的 knowledge/，浏览器读构建时生成的 knowledge-data.js。
     两边的分块规则、打分公式必须是同一套，否则同一个问题在两个形态下会检索到不同资料。 */

  /**
   * 书籍的元文件不是知识，进索引只会稀释检索 —— 直接排除。
   *
   * 判据：**只保留"读者会引用"的内容**（章节正文、术语、配置参考、习题、选型）。
   * 剔除的是**书稿自身的管理痕迹** —— 编纂日志、迁移计划、进度、勘误记录、
   * 问答日志、知识地图（它的正确用法是给课程组装读结构，不是让模型检索表格）。
   *
   * 2026-10-17 扩写后这条界线变得重要：全书 66 个 md 里管理文件一度占了
   * 近 300 个片段（`compilation-log.md` 一个文件就有 46 个，和一章正文相当），
   * 它们含大量"节点编号 / 待回链 / 误区计数"字样，最容易抢走技术问题的命中。
   */
  const KB_EXCLUDE_FILES = new Set([
    'README.md', 'SUMMARY.md', 'METADATA.md', 'CHANGELOG.md', 'BUILD_PROGRESS.md',
    'KNOWLEDGE_MAP.md', 'MIGRATION_PLAN.md', 'legacy-residue.md',
    'compilation-log.md', 'learning-progress.md', 'conversation-highlights.md',
    'correction-log.md', 'question-log.md', 'open-questions.md',
  ]);

  /** 把一份 Markdown 按二/三级标题切成片段。分块规则只此一处。 */
  function chunkMarkdown(file, raw) {
    const out = [];
    const parts = String(raw).split(/\n(?=#{2,3}\s)/);
    for (const p of parts) {
      const text = p.trim();
      if (text.length < 60) continue;
      const heading = (text.split('\n')[0] || '').replace(/^#+\s*/, '').trim();
      out.push({ file, heading, text });
    }
    return out;
  }

  /**
   * 中文虚词二元组停用词。
   *
   * 为什么必须手工列：二元字组切词不认词性，「为什」「什么」「怎么」会被当成
   * 独立的技术词。而有些偶然组合（比如「会变」）在语料里恰好很罕见，
   * 按 IDF 算下来权重竟高于真正的技术词（比如 contenthash），
   * 结果就是「为什么 X 会变」这类问句被虚词带偏。
   */
  const STOP_BIGRAMS = new Set([
    '为什', '什么', '怎么', '怎样', '如何', '哪些', '哪个', '多少',
    '这个', '那个', '这些', '那些', '这里', '那里', '这样', '那样',
    '我们', '你们', '他们', '它们', '自己', '大家',
    '是不', '不是', '可以', '能够', '应该', '需要', '必须', '可能',
    '如果', '因为', '所以', '但是', '而且', '就是', '还是', '或者',
    '一下', '一个', '一样', '一直', '没有', '不能', '不会',
    '已经', '正在', '开始', '然后', '最后', '其实', '到底', '究竟',
    '有点', '一点', '时候', '东西', '事情', '问题',
  ]);

  /**
   * 中文按二元字组切，英文按单词切 —— 够用且无需分词库。
   * 返回 Map<词, 出现次数>，保留词频供 BM25 使用。
   */
  function tokenize(str) {
    const s = String(str || '').toLowerCase();
    const tf = new Map();
    const bump = (t) => tf.set(t, (tf.get(t) || 0) + 1);
    for (const w of s.match(/[a-z0-9_.-]{2,}/g) || []) bump(w);
    const cjk = s.replace(/[^\u4e00-\u9fa5]/g, '');
    for (let i = 0; i < cjk.length - 1; i++) {
      const bg = cjk.slice(i, i + 2);
      if (STOP_BIGRAMS.has(bg)) continue;
      bump(bg);
    }
    return tf;
  }

  /**
   * 建索引：词频、文档频率、片段长度、平均长度。全部算一次，之后查询不再分词。
   * 标题词计三倍：标题是人工写的摘要，信噪比明显高于正文。
   */
  function buildIndex(chunks) {
    const df = new Map();
    let totalLen = 0;
    for (const c of chunks) {
      c.tf = tokenize(c.text);
      for (const [t, n] of tokenize(c.heading)) c.tf.set(t, (c.tf.get(t) || 0) + n * 3);
      c.len = 0;
      for (const n of c.tf.values()) c.len += n;
      totalLen += c.len;
      for (const t of c.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    }
    return { chunks, df, avgdl: chunks.length ? totalLen / chunks.length : 1 };
  }

  /**
   * BM25 检索。
   *
   * 为什么不用「余弦相似度」或「命中词数 ÷ 片段长度」：
   * 本语料片段长度相差上百倍（60 字到 5000 字），硬除长度会把内容最全的
   * 长片段压到近乎零分 —— 正好和我们要找的东西相反。BM25 用饱和式长度
   * 归一化（k1 控制饱和、b 控制长度影响），短片段占不到便宜、长片段不被埋没。
   * IDF 则让「为什么」「怎么」这类满书都是的虚词自动退场。
   */
  function retrieve(index, query, k = 4) {
    const chunks = (index && index.chunks) || [];
    if (!chunks.length) return [];
    const q = tokenize(query);
    if (!q.size) return [];

    const N = chunks.length;
    const DF = index.df;
    const AVGDL = index.avgdl || 1;
    const K1 = 1.2;
    const B = 0.75;

    const idf = (t) => {
      const df = DF.get(t) || 0;
      if (!df) return 0;
      // 加 1 保证恒为正：避免常见词拿到负分，反而把无关片段顶上来
      return Math.log(1 + (N - df + 0.5) / (df + 0.5));
    };

    const scored = chunks.map((c) => {
      let score = 0;
      for (const t of q.keys()) {
        const f = c.tf.get(t);
        if (!f) continue;
        const w = idf(t);
        if (w <= 0) continue;
        score += w * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (c.len / AVGDL)));
      }
      return { file: c.file, heading: c.heading, text: c.text, score };
    });

    const ranked = scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
    // 只保留与最佳命中同量级的结果。宁可返回空、让提示词如实说「没检索到」，
    // 也不要把一堆弱相关片段喂给模型 —— 那比不给更糟。
    const top = ranked[0] ? ranked[0].score : 0;
    return ranked.filter((c) => c.score >= top * 0.45).slice(0, k);
  }

  /* ── 状态补丁 ────────────────────────────────────────────────────────── */

  const STATE_BLOCK_RE = /```state\s*([\s\S]*?)```/i;

  function extractStatePatch(reply) {
    const m = reply.match(STATE_BLOCK_RE);
    if (!m) return { clean: reply.trim(), patch: null, raw: null };
    const clean = reply.replace(STATE_BLOCK_RE, '').trim();
    let patch = null;
    try {
      patch = JSON.parse(m[1].trim());
    } catch {
      patch = null;
    }
    return { clean, patch, raw: m[1].trim() };
  }

  /**
   * 应用状态补丁 —— 这里是「进度单调不减」的强制点。
   * 模型可以提出推进，但改不回退。
   */
  function applyPatch(state, patch) {
    const notes = [];
    if (!patch) return notes;

    // 合法 id 只在**当前模式**的课表里找：计划模式的节点 id 不能写进章模式，
    // 反之亦然 —— 否则分母会被别处的 id 污染。
    const sections = courseSections(state);
    const validIds = new Set(sections.map((s) => s.id));
    const isPlan = state.course_mode === 'plan';
    const bucket = isPlan ? 'completed_plan' : 'completed';
    const currentKey = isPlan ? 'current_plan' : 'current';
    const today = new Date().toISOString().slice(0, 10);

    if (patch.current !== undefined && patch.current !== null) {
      if (validIds.has(patch.current)) {
        state.progress[currentKey] = patch.current;
      } else {
        notes.push('忽略非法的 current: ' + patch.current + '（不在当前' + (isPlan ? '计划' : '章表') + '里）');
      }
    }

    if (Array.isArray(patch.complete)) {
      const list = state.progress[bucket] || (state.progress[bucket] = []);
      const before = list.length;
      for (const id of patch.complete) {
        if (!validIds.has(id)) { notes.push('忽略非法的节 id: ' + id); continue; }
        if (list.some((c) => c.id === id)) continue;
        const meta = sections.find((s) => s.id === id);
        list.push({ id, title: meta.title, date: today });
      }
      const after = list.length;
      if (after > before) notes.push('新增完成节 ' + (after - before) + ' 个');
      // 断言：绝不允许回退
      if (after < before) {
        notes.push('检测到进度回退，已拒绝');
        list.length = before;
      }
    }

    if (Array.isArray(patch.pending_answer)) {
      state.progress.pending_answer = patch.pending_answer
        .filter((q) => q && q.section)
        .slice(0, 5);
    }

    if (Array.isArray(patch.pending_confirm)) {
      state.progress.pending_confirm = patch.pending_confirm
        .filter((q) => q && q.section)
        .slice(0, 5);
    }

    if (Array.isArray(patch.profile)) {
      for (const item of patch.profile) {
        if (!item || !item.phenomenon) continue;
        if (state.learner_profile.some((x) => x.phenomenon === item.phenomenon)) continue;
        state.learner_profile.push({
          phenomenon: String(item.phenomenon).slice(0, 120),
          category: String(item.category || '').slice(0, 60),
          action: String(item.action || '').slice(0, 160),
        });
      }
      state.learner_profile = state.learner_profile.slice(-40);
    }

    return notes;
  }

  /* ── 配置 ────────────────────────────────────────────────────────────── */

  function defaultConfig() {
    return {
      baseUrl: '',            // 例如 https://api.deepseek.com/v1
      apiKey: '',
      model: '',
      temperature: 0.4,
      maxTokens: 2000,
    };
  }

  /**
   * 校验配置。宁可在这里明确报错，也不要让一个错地址活到调用时才炸 ——
   * 那时候的错误信息（fetch failed）对使用者毫无指向性。
   * 只校验「本次提交里出现的字段」，这样分段保存（先填地址再填 key）不会被误拦。
   */
  function validateConfig(cfg) {
    const errs = [];
    if (cfg.baseUrl) {
      let u = null;
      try { u = new URL(cfg.baseUrl); } catch { errs.push('API 地址不是合法的 URL'); }
      if (u && u.protocol !== 'http:' && u.protocol !== 'https:') {
        errs.push('API 地址必须以 http:// 或 https:// 开头');
      }
    }
    if (cfg.model !== undefined && typeof cfg.model !== 'string') errs.push('模型名必须是字符串');
    if (cfg.temperature !== undefined && cfg.temperature !== '') {
      const t = Number(cfg.temperature);
      if (!Number.isFinite(t) || t < 0 || t > 2) errs.push('temperature 需在 0 ~ 2 之间');
    }
    if (cfg.maxTokens !== undefined && cfg.maxTokens !== '') {
      const m = Number(cfg.maxTokens);
      if (!Number.isInteger(m) || m < 1 || m > 32000) errs.push('maxTokens 需是 1 ~ 32000 之间的整数');
    }
    return errs;
  }

  /** 归一化：地址去尾斜杠，模型名去空白，数值转数字。 */
  function normalizeConfig(cfg) {
    const c = { ...cfg };
    if (typeof c.baseUrl === 'string') c.baseUrl = c.baseUrl.trim().replace(/\/+$/, '');
    if (typeof c.model === 'string') c.model = c.model.trim();
    if (c.temperature !== undefined) c.temperature = Number(c.temperature);
    if (c.maxTokens !== undefined) c.maxTokens = Number(c.maxTokens);
    return c;
  }

  function configReady(cfg) {
    return Boolean(cfg && cfg.baseUrl && cfg.model);
  }

  /* ── 大模型调用 ──────────────────────────────────────────────────────── */

  /**
   * 走 OpenAI 兼容端点。Node 与浏览器共用同一份实现，
   * 区别只在「配置从哪来」：服务端从文件/环境变量，静态版从 localStorage。
   */
  async function callLLM(cfg, messages, timeoutMs = 120000) {
    if (!configReady(cfg)) {
      const err = new Error('尚未配置大模型');
      err.code = 'LLM_NOT_CONFIGURED';
      throw err;
    }

    const url = String(cfg.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
        }),
        signal: controller ? controller.signal : undefined,
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      const aborted = e && e.name === 'AbortError';
      const err = new Error(aborted
        ? '模型请求超时。可能是模型太慢或网络不通。'
        : '连接模型服务失败：' + e.message
          + '。请检查 API 地址与网络。'
          // 静态部署时这是最常见的原因，直接把排查方向写进错误里
          + '（若这是 GitHub Pages 之类的静态部署，另一常见原因是该模型服务不允许浏览器直连，即未开放 CORS。）');
      err.code = 'LLM_UNREACHABLE';
      throw err;
    }
    if (timer) clearTimeout(timer);

    const bodyText = await res.text();
    if (!res.ok) {
      const err = new Error('模型服务返回 ' + res.status + '：' + bodyText.slice(0, 300));
      err.code = 'LLM_HTTP_ERROR';
      throw err;
    }

    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      const err = new Error('模型返回的不是合法 JSON：' + bodyText.slice(0, 200));
      err.code = 'LLM_BAD_RESPONSE';
      throw err;
    }

    const content =
      (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      (data && data.choices && data.choices[0] && data.choices[0].text) ||
      '';
    if (!content) {
      const err = new Error('模型返回内容为空。');
      err.code = 'LLM_EMPTY';
      throw err;
    }
    return content;
  }

  /* ── 对外视图 ────────────────────────────────────────────────────────── */

  /** 脱敏后的配置：密钥永不下发，只回一个「有没有」的布尔。 */
  function publicConfig(cfg, apiKeySource) {
    return {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      hasApiKey: Boolean(cfg.apiKey),
      // 界面上那句「已保存，留空不修改」对部署者来说是误导 ——
      // 密钥其实在环境变量里，改界面根本改不动。明确告诉他来源。
      apiKeySource: apiKeySource || (cfg.apiKey ? 'file' : 'none'),
    };
  }

  function publicState(state) {
    const prog = courseProgress(state);
    const sections = courseSections(state);
    return {
      progress: {
        ...state.progress,
        // 界面只认这四个"当前模式"的字段，不必自己判断模式
        completed: prog.completed,
        current: prog.current,
        total_sections: sections.length,
        percent: computeProgress(state).percent,
        formula: computeProgress(state).formula,
      },
      course_mode: state.course_mode === 'plan' ? 'plan' : 'chapter',
      plan: state.plan
        ? {
            spec: state.plan.spec,
            stats: state.plan.stats,
            generated_at: state.plan.generated_at,
            truncated: state.plan.truncated,
            length: sections.length,
          }
        : null,
      learner_profile: state.learner_profile,
      changelog: state.changelog,
      session: state.session,
      // 界面渲染用：当前模式真正生效的那份课表
      course: sections,
    };
  }

  /* 下面这个函数是从 server.js 原样搬过来的，所以缩进与附近代码不一致。
     刻意不重新缩进：函数体里有跨行模板字符串，动缩进就等于动提示词内容。 */
function buildSystemPrompt(state, hits) {
  const p = computeProgress(state);
  const isPlan = state.course_mode === 'plan';
  const sections = courseSections(state);
  const prog = courseProgress(state);
  const done = prog.completed.map((c) => c.id);
  const currentId = prog.current;
  const current = sections.find((s) => s.id === currentId);

  const roster = sections
    .map((s) => `${s.id} ${s.title}${done.includes(s.id) ? ' ✅' : ''}`)
    .join('\n');

  const modeBlock = isPlan
    ? `# 课程模式：计划模式（当前生效）
学习者当前走的是一条**按需组装**的路径，共 ${sections.length} 节，由知识点（如 \`D5.L3.06\`）组成，
不是固定课表的 42 章。这条路径的**前置依赖已经排好**，你只需按序讲，不要自行调整顺序或跳节。
路径条件：${JSON.stringify((state.plan && state.plan.spec) || {})}

**何时该重新组课**：学习者说"我想学 X 领域""换个方向""这条太长了/太短了"时，
不要自己编造课程顺序，改为在状态块里提出组课请求（见下方补丁协议），由程序重新组装。`
    : `# 课程模式：章模式（当前生效）
固定 42 章课表。学习者想按主题定制路径时，可以提议切到计划模式（见补丁协议）。`;

  const kb = hits.length
    ? hits
        .map((h, i) => `【资料 ${i + 1}｜${h.file} › ${h.heading}】\n${h.text.slice(0, 1600)}`)
        .join('\n\n---\n\n')
    : '（本轮未检索到相关资料，请基于你自己的知识回答；不确定的内容必须标注"待核实"）';

  return `你是「前端工程化学习助手」——一位耐心的前端工程化老师，用互动式对话带学习者系统走完从「写出第一个页面」到「AI 在工程流程里的位置」。

# 课程的范围（10 个领域，共 ${TOTAL_SECTIONS} 章）
课程不是只讲打包构建：D0 入门（HTML/CSS/JS/浏览器/网络）→ D1 规范与协作 → D2 语言与模块化 → D3 构建与打包 → D4 样式工程 → D5 质量与测试 → D6 交付与运维 → X1 脚手架 → X2 架构模式 → X3 AI 与工程化。**按学习者所在的那一章讲那一章的内容**，不要把所有问题都拉回打包。

# 讲解风格（面向初学者）
- 先给直觉，再给术语：每个概念先用一句生活化的类比说清「它解决什么问题」，再上正式名词。
- 不假设对方记得上一节：需要用到前置概念时，用半句话点一下「我们前面说过 X」。
- 允许并鼓励「不懂就打断」：学习者说听不懂时，换一个更小的例子重讲，不要原样复述。
- 语气平等、鼓励，但不灌鸡汤：把「你答对了」换成「你说到了 X，这正是关键」。
- 不堆术语、不炫技；能用一句话说清就不写三句。

# 学习者前提
已掌握 HTML / CSS / JS 与 npm 基本使用。目标：能独立完成工程规范、构建与产物优化、质量体系、交付运维等工程化决策。

${modeBlock}

# 课程结构（当前模式共 ${sections.length} 节，已冻结，不得增删）
${roster}

# 当前状态
- 进度：${p.done}/${p.total}（${p.percent}%），口径：${p.formula}
- 当前节：${current ? current.id + ' ' + current.title + '（预计 ' + current.minutes + ' 分钟）' : '尚未开始'}
- 待作答：${state.progress.pending_answer.length ? JSON.stringify(state.progress.pending_answer) : '无'}
- 待确认：${state.progress.pending_confirm.length ? JSON.stringify(state.progress.pending_confirm) : '无'}
- 学习者画像：${state.learner_profile.length ? JSON.stringify(state.learner_profile) : '尚未累积'}

# 最高优先：进度以学习者为准
- 讲解进度 ≠ 学习进度。一节只有「学习者作答 + 你批改 + 学习者确认」三件齐了才算完成。
- 学习者停在哪一节，就停在哪一节。一次只开一节。
- 未经确认绝不投递下一节内容，连"顺手带一句""先预览一下"都不行。
- 提问后只等作答：不主动推进、不预告下一节。
- 「下一节」「继续」是推进指令，不等于确认。只有明确的「无疑问 / 无 / 没有 / 无疑」才算确认。
- 不替学习者判断是否作答；不假设他读过什么。

# 每节输出格式（固定顺序，缺项不合格）
1. 进度百分比 + 预计用时
2. 引子（一到两句，接住上一节；不要上来就甩表格）
3. 正文，精炼讲解 ≤300 字
4. 概念图：抽象机制必配，用 \`\`\`mermaid 代码块输出（flowchart / sequenceDiagram / mindmap 均可，节点文字用中文，避免特殊符号）
5. 对比表格：关键差异一律表格化
6. 常见坑：涉及配置时补关键配置项说明 + 踩坑点
7. 1–2 个理解确认题，或一个可动手验证的小任务
8. 出题自查：这题的答案是不是就写在我上面那段话里？是则重出

# 交互节奏（四拍 + 一道闸门）
① 讲解（按上面 8 项）② 提问 ③ 等作答 ④ 批改（本轮不掺任何新内容）⑤ 停下问「有没有疑问」⑥ 确认无疑问 → 才开下一节。
闸门不可合并、不可跳过。

# 批改规则
- 先指出对在哪、错在哪，再给正确答案；答错必须讲清根因，归因落到机制层。
- 答对也要追一层「为什么」。判据：这句话能推出反例吗？推不出算没答。
- 学习者复用一个场景的答案回答新场景时，直接点出并追问「这两个场景哪里不一样」。
- 给出数字或结论时，先问它绑定什么指标、什么前提。
- 错误归类：结论错 / 机制链条断裂 / 场景错配 / 跳过分解步骤 / 举例不可查证 / 数字脱离定义。
- 把有复用价值的错误累积进 learner_profile（现象 → 归类 → 改进动作）。

# 禁止
- 不生成培训网页；不一次性输出长篇文档。
- 不跨节、不跨模块推进。
- 不编造事实。涉及版本号、成熟度、兼容性、性能倍数时，若资料区没有支撑，必须标注「待核实」并提示以官方文档为准。

# 可用资料（从本地知识库检索，仅供你参考；不要整段照抄）
${kb}

# 状态回写（重要）
每次回复的最后，必须追加一个状态补丁代码块，用 \`\`\`state 围栏包裹，内容是一段 JSON：

\`\`\`state
{"current":"D0.2","complete":["D0.1"],"pending_answer":[{"section":"D0.2","question":"..."}],"pending_confirm":[],"profile":[{"phenomenon":"...","category":"...","action":"..."}],"plan":{"domains":["D3"],"levels":["L2"],"max":20}}
\`\`\`

字段含义：
- current：下一轮该讲哪一节（不确定就填原值或 null）
- complete：本轮新确认完成的节 id 数组（只填"作答+批改+确认"三件齐的节；没有就填空数组）
- pending_answer：当前布置出去、还没作答的题目
- pending_confirm：已批改但还没等到"无疑问"的节
- profile：本轮新观察到的学习者画像条目（没有就留空数组）
- plan：**可选**。需要重新组装学习路径时填，形如 \`{"targets":["D5.L3.06"]}\` 或 \`{"domains":["D5"],"levels":["L2","L3"],"max":20}\`
  —— **你只负责"学哪些"，顺序由程序按前置依赖算**，不要自己排顺序、不要在回复里伪造课表。
  不加 plan 就不要带这个字段。

规则：complete 只增不减；**只能填当前课程结构里的 id**（计划模式下是节点 id，如 \`D5.L3.06\`；
章模式下是章 id，如 \`D3.2\`）；宁可不推进，也不要凭猜测推进。
状态块之外不要出现 JSON 状态说明。`;
}


  return {
    COURSE: COURSE,
    TOTAL_SECTIONS: TOTAL_SECTIONS,
    MAX_HISTORY: MAX_HISTORY,
    KB_EXCLUDE_FILES: KB_EXCLUDE_FILES,

    defaultState: defaultState,
    prereqClosure: prereqClosure,
    assemblePlan: assemblePlan,
    courseSections: courseSections,
    courseProgress: courseProgress,
    setCourseMode: setCourseMode,
    applyPlan: applyPlan,

    computeProgress: computeProgress,
    applyPatch: applyPatch,
    extractStatePatch: extractStatePatch,

    defaultConfig: defaultConfig,
    validateConfig: validateConfig,
    normalizeConfig: normalizeConfig,
    configReady: configReady,

    chunkMarkdown: chunkMarkdown,
    buildIndex: buildIndex,
    retrieve: retrieve,
    tokenize: tokenize,

    buildSystemPrompt: buildSystemPrompt,
    callLLM: callLLM,
    publicConfig: publicConfig,
    publicState: publicState,
  };
});

#!/usr/bin/env node
/**
 * 从 knowledge/chapters/*.md 生成课程表，写回 core.js 的 COURSE 常量。
 *
 * 为什么要生成而不是手写：
 * 课程表原来是一份手写的 22 节常量（原书四模块）。书扩到 10 个领域、42 章之后，
 * 手写意味着**每加一章要改三处**（core.js 的数组、总节数、前端文案），
 * 而漏改的症状很隐蔽 —— 新章在左侧目录里根本不出现，或进度分母不对。
 *
 * 唯一事实来源 = 章节文件的 H1：`# D3 第 2 章 · 配置与环境：把默认值改对`
 * 由此得到 id / module / title，minutes 由正文体量估算（不是精确值，只用于展示）。
 *
 * 用法：node tools/build-course.js   （幂等，可反复跑）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CH_DIR = path.join(ROOT, 'knowledge', 'chapters');
const CORE = path.join(ROOT, 'public', 'frontend-engineering-agent', 'core.js');

const BEGIN = '/* <COURSE:BEGIN> 由 tools/build-course.js 生成，勿手改 */';
const END = '/* <COURSE:END> */';

/** 领域代号 → 展示名。与 knowledge/SUMMARY.md 的二级标题一致。 */
const DOMAINS = {
  D0: 'D0 入门基础',
  D1: 'D1 规范与协作',
  D2: 'D2 语言与模块化',
  D3: 'D3 构建与打包',
  D4: 'D4 样式工程',
  D5: 'D5 质量与测试',
  D6: 'D6 交付与运维',
  X1: 'X1 工程化与脚手架',
  X2: 'X2 架构模式',
  X3: 'X3 AI 与工程化',
};

function readCourses() {
  const out = [];
  for (const name of fs.readdirSync(CH_DIR).sort()) {
    const m = /^([dx]\d)-(\d+)-(.*)\.md$/.exec(name);
    if (!m) continue; // 只要正文章节，跳过 legacy-residue 之类
    const dom = m[1].toUpperCase();
    const no = Number(m[2]);
    if (!DOMAINS[dom]) continue;

    const raw = fs.readFileSync(path.join(CH_DIR, name), 'utf8');
    const h1 = (raw.split('\n')[0] || '').replace(/^#\s*/, '').trim();
    // `# D3 第 2 章 · 标题` → 标题；取不到就退回文件名
    const t = /第\s*\d+\s*章\s*·\s*(.+)$/.exec(h1);
    const title = (t ? t[1] : m[3]).trim();

    // 阅读时长估算：技术中文约 1200 字符/分钟，夹在 8–45 分钟之间。
    // 它只用于界面提示，不参与任何判定 —— 所以允许是粗的。
    const minutes = Math.max(8, Math.min(45, Math.round(raw.length / 1200)));

    out.push({ id: `${dom}.${no}`, module: DOMAINS[dom], title, minutes, dom, no });
  }
  // 按领域代号、再按章序排 —— 学习顺序与编号顺序一致
  out.sort((a, b) => (a.dom < b.dom ? -1 : a.dom > b.dom ? 1 : a.no - b.no));
  return out;
}

const course = readCourses();
if (course.length < 10) {
  console.error('只解析到 ' + course.length + ' 章 —— 章节文件没接上，生成中止');
  process.exit(1);
}

const lines = course.map(
  (s) =>
    `    { id: '${s.id}', module: '${s.module}', title: ${JSON.stringify(s.title).replace(/"/g, "'")}, minutes: ${s.minutes} },`
);

const block = [BEGIN, '  const COURSE = [', ...lines, '  ];', '  ' + END].join('\n');

let core = fs.readFileSync(CORE, 'utf8');
const i = core.indexOf(BEGIN);
const j = core.indexOf(END);
if (i < 0 || j < 0) {
  console.error('core.js 里找不到 COURSE 生成标记，生成中止（先加标记再跑）');
  process.exit(1);
}
core = core.slice(0, i) + block + core.slice(j + END.length);
fs.writeFileSync(CORE, core, 'utf8');

const byDom = {};
for (const s of course) byDom[s.dom] = (byDom[s.dom] || 0) + 1;
console.log('已生成课程表：' + course.length + ' 章 / ' + Object.keys(byDom).length + ' 个领域');
console.log('  ' + Object.entries(byDom).map(([k, v]) => k + ':' + v).join('  '));

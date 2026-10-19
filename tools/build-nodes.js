#!/usr/bin/env node
/**
 * 把 knowledge/KNOWLEDGE_MAP.md 解析成结构化节点数据 nodes.json。
 *
 * 为什么要单独产出一份 JSON，而不是让模型去读地图的 Markdown：
 * 地图是一张 180 行的表格，模型读它只能"看懂大意"，做不了两件真正需要精确的事 ——
 *   ① **前置闭包**：要学 X，得先把 X 的前置、前置的前置都取出来；
 *   ② **拓扑排序**：在满足依赖的前提下给出一个可执行的顺序。
 * 这两件事一旦交给模型即兴发挥，就会偶发地"跳前置""顺序反了"，而且难以发现。
 *
 * 所以分工是：**模型决定"学哪些"（判断），代码保证"顺序与闭包"（正确性）**。
 * 本脚本负责把表格变成这对代码友好的结构，并在生成时校验三条不变量。
 *
 * 用法：node tools/build-nodes.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MAP = path.join(ROOT, 'knowledge', 'KNOWLEDGE_MAP.md');
const OUT = path.join(ROOT, 'public', 'frontend-build-agent', 'nodes.json');

const DOMAIN_NAMES = {
  D0: '入门基础',
  D1: '规范与协作',
  D2: '语言与模块化',
  D3: '构建与打包',
  D4: '样式工程',
  D5: '质量与测试',
  D6: '交付与运维',
  X1: '脚手架与模板',
  X2: '架构模式',
  X3: 'AI 辅助工程',
};

const LEVEL_NAMES = { L1: '入门', L2: '进阶', L3: '深入', L4: '精通' };

const RE_NODE = /^\|\s*((?:D[0-6]|X[1-3])\.L[1-4]\.\d{2})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/;

function parse(mapText) {
  const nodes = [];
  const seen = new Set();
  for (const line of mapText.split('\n')) {
    const m = RE_NODE.exec(line.replace(/\r$/, ''));
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue; // 表格里可能重复引用，节点只认第一次
    seen.add(id);

    const name = m[2].trim();
    const rawPrereq = m[3].trim();
    const source = m[4].trim();

    // `—` / `-` / 空 表示入口节点
    const prereq = /^[—-]$/.test(rawPrereq) || !rawPrereq
      ? []
      : rawPrereq.split(/[,，]/).map((s) => s.trim()).filter(Boolean);

    const [, domain, level] = /^([^.]*)\.(L\d)\./.exec(id);
    nodes.push({ id, name, domain, level, prereq, source });
  }
  return nodes;
}

/** 拓扑排序：同层按 id 升序，保证生成结果稳定（同一份地图永远排出同一个顺序）。 */
function topoSort(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const next = new Map(nodes.map((n) => [n.id, []]));

  for (const n of nodes) {
    for (const p of n.prereq) {
      if (!byId.has(p)) continue; // 悬空前置单独报告，排序时忽略
      next.get(p).push(n.id);
      indeg.set(n.id, indeg.get(n.id) + 1);
    }
  }
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id).sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const nx of next.get(id)) {
      indeg.set(nx, indeg.get(nx) - 1);
      if (indeg.get(nx) === 0) {
        ready.push(nx);
        ready.sort();
      }
    }
  }
  return { order, cyclic: order.length !== nodes.length };
}

const nodes = parse(fs.readFileSync(MAP, 'utf8'));
if (nodes.length < 100) {
  console.error('只解析到 ' + nodes.length + ' 个节点 —— 地图表格没接上，生成中止');
  process.exit(1);
}

const ids = new Set(nodes.map((n) => n.id));
const dangling = [];
for (const n of nodes) for (const p of n.prereq) if (!ids.has(p)) dangling.push(n.id + ' → ' + p);

const { order, cyclic } = topoSort(nodes);

// 层级倒挂：低层节点依赖高层节点，会让"按层推进"失效
const rank = { L1: 1, L2: 2, L3: 3, L4: 4 };
const inverted = [];
for (const n of nodes) {
  for (const p of n.prereq) {
    const pn = nodes.find((x) => x.id === p);
    if (pn && rank[pn.level] > rank[n.level]) inverted.push(n.id + '(' + n.level + ') ← ' + p + '(' + pn.level + ')');
  }
}

const domains = {};
const levels = {};
const byDomain = {};
for (const n of nodes) {
  byDomain[n.domain] = (byDomain[n.domain] || 0) + 1;
  domains[n.domain] = DOMAIN_NAMES[n.domain] || n.domain;
  levels[n.level] = LEVEL_NAMES[n.level] || n.level;
}

const out = {
  version: 1,
  generatedFrom: 'knowledge/KNOWLEDGE_MAP.md',
  // 刻意**不写生成时间**：生成物进版本库，CI 会重跑并比对 diff，
  // 带上时间戳等于每次构建都"有改动"，检查就永远失败。
  total: nodes.length,
  domains,
  levels,
  order, // 全局拓扑序：可作为"零基础完整路径"
  nodes,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 0), 'utf8');

const kb = (JSON.stringify(out).length / 1024).toFixed(0);
console.log('已生成 ' + path.relative(ROOT, OUT).replace(/\\/g, '/') + '（' + kb + ' KB）');
console.log('  节点   ' + nodes.length + '（' + Object.entries(byDomain).map(([k, v]) => k + ':' + v).join(' ') + '）');
console.log('  入口   ' + nodes.filter((n) => !n.prereq.length).length + ' 个');
console.log('  校验   悬空前置 ' + dangling.length + ' · 依赖环 ' + (cyclic ? '有' : '0') + ' · 层级倒挂 ' + inverted.length);
if (dangling.length) console.log('  ⚠ 悬空：' + dangling.slice(0, 5).join('; '));
if (inverted.length) console.log('  ⚠ 倒挂：' + inverted.slice(0, 5).join('; '));
if (cyclic) process.exitCode = 2;

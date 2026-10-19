#!/usr/bin/env node
/**
 * 把 knowledge/ 下的 Markdown 预处理成
 * public/frontend-engineering-agent/knowledge.json。
 *
 * 为什么要有这一步，而不是让两端各自读 Markdown：
 * 服务端有 fs，浏览器没有 —— 浏览器只能读一份提前准备好的数据。
 * 如果两边各写一遍「遍历目录 + 过滤文件 + 按标题分块」，规则迟早会分叉，
 * 同一个问题在本地跑和部署到 Pages 上会检索到不同资料。
 * 所以分块只在这里做一次，产物由两端共用。
 *
 * 分块规则本身来自共用内核 public/frontend-engineering-agent/core.js，
 * 不是这个脚本自定义的。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 应用在 public/ 下的子目录。线上与本地共用这一层：应用地址是
// /frontend-engineering-agent/，站点根只放一个跳转页。
const APP_DIR = path.join('public', 'frontend-engineering-agent');
const KB_DIR = process.env.KNOWLEDGE_DIR || path.join(ROOT, 'knowledge');
const OUT = path.join(ROOT, APP_DIR, 'knowledge.json');

// 内核路径跟着应用目录走，免得同一个目录名在文件里出现两遍
const core = require(path.join(ROOT, APP_DIR, 'core.js'));

const chunks = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      // 与服务端同一套排除规则：tools/ 是书稿脚本，assets/ 是配图
      if (name === 'tools' || name === 'assets') continue;
      walk(full);
      continue;
    }
    if (!name.endsWith('.md')) continue;
    if (core.KB_EXCLUDE_FILES.has(name)) continue;
    for (const c of core.chunkMarkdown(name, fs.readFileSync(full, 'utf8'))) chunks.push(c);
  }
}

walk(KB_DIR);

if (!chunks.length) {
  console.error('没有从 ' + KB_DIR + ' 分到任何片段 —— 语料没接上，生成中止');
  process.exit(1);
}

const json = JSON.stringify(chunks);
fs.writeFileSync(OUT, json, 'utf8');

// 用相对路径回显，脚本改了目录也不用跟着改字面量
console.log('已生成 ' + path.relative(ROOT, OUT).replace(/\\/g, '/'));
console.log('  来源   ' + KB_DIR);
console.log('  片段   ' + chunks.length + ' 个');
console.log('  体积   ' + (json.length / 1024).toFixed(0) + ' KB');

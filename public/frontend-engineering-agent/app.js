/* ══════════════════════════════════════════════════════════════
   前端工程化学习助手 · 前端逻辑
   ────────────────────────────────────────────────────────────
   设计原则（与后端一致）：
   · 状态不寄生在对话历史：进度、待办、画像全部来自服务端 state，
     刷新页面后由 /api/bootstrap 重新拉取渲染。
   · 会话历史易失，状态持久。
   · 庆祝动效（礼花 / 烟花）由「本轮新增的完成节」触发，而不是由
     渲染触发 —— 见 celebrate()。
   ══════════════════════════════════════════════════════════════ */

'use strict';

const $ = (id) => document.getElementById(id);

/**
 * 领域代号 → 侧栏色带。10 个领域各一个颜色，和书稿的 10 个领域一一对应。
 * 放在这里而不是从后端取：它纯属展示，取不到也不该让界面空着。
 */
const DOMAIN_BAND = {
  D0: 'm1', D1: 'm2', D2: 'm3', D3: 'm4', D4: 'm5',
  D5: 'm6', D6: 'm7', X1: 'm8', X2: 'm9', X3: 'm10',
};

/**
 * 把可以点击的 div/span 补成键盘可达控件。
 * 课程行、快捷短语、预设都是 div，鼠标能点但 Tab 走不到、回车按不动，这是真实的可达性缺口。
 */
function activate(el, onActivate, label) {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', label);
  el.addEventListener('click', onActivate);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
}


let STATE = null;
let CONFIG = null;
let LLM_READY = false;
let busy = false;
// 服务端落盘的对话历史，首屏恢复后只用于重放一次。
// 客户端不再自己维护一份「当前会话」—— 那会和服务端那份变成两个真相。
let RESTORED = [];

/* ─────────────────── Markdown 渲染（轻量自研，够用即可） ─────────────────── */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  let t = text;
  // 行内代码先抽出来，避免里面的 ** 被当成加粗
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return '\u0000C' + (codes.length - 1) + '\u0000';
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\u0000C(\d+)\u0000/g, (_, i) => '<code>' + codes[+i] + '</code>');
  return t;
}

function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function renderMarkdown(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // 跳过收尾围栏
      const code = buf.join('\n');
      if (lang === 'mermaid') {
        out.push(
          '<div class="mermaid-box"><div class="mermaid">' +
          escapeHtml(code) +
          '</div></div>'
        );
      } else {
        out.push('<pre><code>' + escapeHtml(code) + '</code></pre>');
      }
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lv = Math.min(h[1].length + 1, 5); // 气泡内标题整体降一级
      out.push(`<h${lv}>${inline(escapeHtml(h[2]))}</h${lv}>`);
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.trim().length >= 3) {
      out.push('<hr />');
      i++;
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = splitRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      let html = '<table><thead><tr>' +
        head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join('') +
        '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>' + r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join('') + '</tr>';
      }
      html += '</tbody></table>';
      out.push(html);
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + inline(escapeHtml(buf.join(' '))) + '</blockquote>');
      continue;
    }

    // 列表
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(escapeHtml(t))}</li>`).join('') + `</${tag}>`);
      continue;
    }

    // 空行
    if (!line.trim()) { i++; continue; }

    // 段落
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
    ) buf.push(lines[i++]);
    out.push('<p>' + inline(escapeHtml(buf.join(' '))) + '</p>');
  }

  return out.join('\n');
}

/* ─────────────────── Mermaid ─────────────────── */

let mermaidReady = false;

function initMermaid() {
  if (typeof window.mermaid === 'undefined') return false;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  window.mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: 'inherit',
    fontSize: 13,
    // 把图表的强调色对齐到界面配色。否则 Mermaid 自带调色板会跟界面不是一套，
    // 一眼就能看出「图」和「壳」来自两个产品。
    themeVariables: dark ? {
      primaryColor: '#12304f',
      primaryTextColor: '#e8f2ff',
      primaryBorderColor: '#0a84ff',
      lineColor: '#7a7a80',
      secondaryColor: '#1c1c1e',
      tertiaryColor: '#2c2c2e',
      textColor: '#e8e8ed',
    } : {
      primaryColor: '#e6f1fd',
      primaryTextColor: '#0d2b4d',
      primaryBorderColor: '#0071e3',
      lineColor: '#8e8e93',
      secondaryColor: '#f5f5f7',
      tertiaryColor: '#ececf0',
      textColor: '#1d1d1f',
    },
  });
  mermaidReady = true;
  return true;
}

let mermaidSeq = 0;

async function renderMermaid(scope) {
  const nodes = scope.querySelectorAll('.mermaid:not([data-processed])');
  for (const el of nodes) {
    const src = el.textContent;
    el.setAttribute('data-processed', '1');
    if (!mermaidReady && !initMermaid()) {
      el.outerHTML = '<div class="mermaid-fallback">Mermaid 渲染库未加载（离线环境），以下为源码：</div>' +
        '<pre><code>' + escapeHtml(src) + '</code></pre>';
      continue;
    }
    try {
      const { svg } = await window.mermaid.render('mmd-' + (++mermaidSeq), src);
      el.innerHTML = svg;
    } catch (e) {
      el.outerHTML = '<div class="mermaid-fallback">该图无法渲染，以下为源码：</div>' +
        '<pre><code>' + escapeHtml(src) + '</code></pre>';
    }
  }
}

/* ─────────────────── 庆祝动效：礼花棒 / 烟花 ───────────────────
   一个 canvas 粒子引擎，两种用法：
     · FX.confetti()  —— 学完一节：屏幕两侧「礼花棒」向内上方喷射彩带纸屑
     · FX.fireworks() —— 学完全部：连续放烟花，持续数秒

   为什么是 canvas 而不是 DOM 元素：一次礼花有 150+ 个粒子，
   每个都在动 transform/rotation，用 DOM 会拉起上百个合成层。
   canvas 只有一个层，且完全不参与布局与命中测试。

   动效只在「真的发生了一件事」时出现（完成一节 / 完成全部），
   不是背景装饰 —— 这也是它能被 prefers-reduced-motion 直接关掉的前提。
   ──────────────────────────────────────────────────────────── */

const FX = (() => {
  const canvas = document.getElementById('fx');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const PALETTE = ['#ff5c8a', '#ffd23f', '#3ddc97', '#4dabf7', '#a78bfa', '#ff9f1c', '#ff6b6b'];
  const MAX_PARTS = 900;
  // roundRect 是较新的 API，探测一次即可，不必每帧每个粒子都问一遍
  const HAS_ROUND_RECT = Boolean(ctx && typeof ctx.roundRect === 'function');

  let W = 0;
  let H = 0;
  let parts = [];
  let raf = null;
  let timers = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // 用 setTransform 而不是 scale 累积：重复 resize 不会把比例越乘越大
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function push(p) {
    if (parts.length < MAX_PARTS) parts.push(p);
  }

  function schedule(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function resetTimers() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  function step(p) {
    p.px = p.x;
    p.py = p.y;
    p.vy += p.gravity;
    p.vx *= p.dragX;
    p.vy *= p.dragY;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.wob += 0.22;
  }

  function explode(x, y, color) {
    const n = 40 + Math.floor(Math.random() * 24);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.6, 5.6);
      push({
        kind: 'spark',
        x, y, px: x, py: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity: 0.055,
        dragX: 0.963, dragY: 0.963,
        size: rand(1.3, 2.6),
        color: Math.random() < 0.75 ? color : pick(PALETTE),
        life: 1, decay: rand(0.008, 0.017),
        rot: 0, vr: 0, wob: 0,
      });
    }
  }

  function launchRocket() {
    const x = rand(W * 0.12, W * 0.88);
    const topY = rand(H * 0.12, H * 0.46);
    // 反推初速度：让它恰好升到 topY 附近时速度归零（也就是该炸开的位置）。
    // 写死速度的话，屏幕高度一变就会在屏幕外炸。
    const gravity = 0.32;
    const v0 = -Math.sqrt(2 * gravity * (H - topY));
    push({
      kind: 'rocket',
      x, y: H + 8, px: x, py: H + 8,
      vx: rand(-0.5, 0.5), vy: v0,
      gravity, dragX: 1, dragY: 1,
      size: 2.2,
      color: pick(PALETTE),
      life: 1, decay: 0,
      rot: 0, vr: 0, wob: 0,
    });
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      step(p);

      if (p.kind === 'rocket') {
        // 升到顶点（速度由负转正）就地炸开
        if (p.vy >= -1.2) {
          explode(p.x, p.y, p.color);
          parts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        continue;
      }

      p.life -= p.decay;
      if (p.life <= 0 || p.y > H + 80) {
        parts.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = Math.min(1, p.life);

      if (p.kind === 'spark') {
        // 画成一小段拖尾而不是一个点：烟花才有「划过去」的感觉
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        // 礼花纸屑：绕自身中心旋转，同时按 cos 压扁纵向宽度模拟翻面
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.wob)) * 0.75 + 0.25);
        ctx.fillStyle = p.color;
        const w = p.size;
        const h = p.size * 0.62;
        if (HAS_ROUND_RECT) {
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, 1.5);
          ctx.fill();
        } else {
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;

    if (!parts.length) {
      ctx.clearRect(0, 0, W, H);
      raf = null;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (raf === null) raf = requestAnimationFrame(frame);
  }

  /** 一节学完：左右两支礼花棒朝屏幕内上方喷射 */
  function confetti() {
    if (!ctx || reduced.matches) return;
    resize();
    resetTimers();
    parts = [];

    const cannon = (fromLeft) => {
      const base = fromLeft ? -0.95 : -Math.PI + 0.95;
      for (let i = 0; i < 78; i++) {
        const a = base + rand(-0.44, 0.44);
        const sp = rand(9, 19);
        push({
          kind: 'confetti',
          x: fromLeft ? -8 : W + 8,
          y: H * 0.99,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          gravity: 0.26,
          dragX: 0.982, dragY: 0.995,
          size: rand(5, 9.5),
          color: pick(PALETTE),
          life: 1, decay: rand(0.004, 0.008),
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.3, 0.3),
          wob: rand(0, Math.PI * 2),
        });
      }
    };

    cannon(true);
    schedule(() => cannon(false), 110);
    run();
  }

  /** 全部学完：连放一段烟花 */
  function fireworks(duration = 6500) {
    if (!ctx || reduced.matches) return;
    resize();
    resetTimers();
    parts = [];

    const until = Date.now() + duration;
    const shoot = () => {
      if (Date.now() > until) return;
      launchRocket();
      schedule(shoot, rand(280, 640));
    };
    shoot();
    // 开场先来一支礼花棒，避免第一颗烟花升空的 1 秒里屏幕是空的
    confettiBurst();
    run();
  }

  /** 单点向上的一次性礼花，供 fireworks 开场用 */
  function confettiBurst() {
    const cx = W / 2;
    for (let i = 0; i < 60; i++) {
      const a = -Math.PI / 2 + rand(-1.1, 1.1);
      const sp = rand(8, 17);
      push({
        kind: 'confetti',
        x: cx, y: H * 0.98,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity: 0.26,
        dragX: 0.982, dragY: 0.995,
        size: rand(5, 9.5),
        color: pick(PALETTE),
        life: 1, decay: rand(0.004, 0.008),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.3, 0.3),
        wob: rand(0, Math.PI * 2),
      });
    }
  }

  if (ctx) window.addEventListener('resize', resize);

  return { confetti, fireworks };
})();

/* ─────────────────── 消息渲染 ─────────────────── */

const messagesEl = $('messages');

function addMessage(role, content, meta) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;

  const roleNames = { user: '我', assistant: '学习助手', system: '系统', error: '出错了' };
  const roleEl = document.createElement('div');
  roleEl.className = 'msg-role';
  roleEl.textContent = roleNames[role] || role;
  wrap.appendChild(roleEl);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const md = document.createElement('div');
  md.className = 'md';
  md.innerHTML = renderMarkdown(content);
  bubble.appendChild(md);
  wrap.appendChild(bubble);

  if (meta && meta.length) {
    const m = document.createElement('div');
    m.className = 'msg-meta';
    m.innerHTML = meta.map((x) =>
      `<span class="chip${x.ok ? ' ok' : ''}${x.win ? ' win' : ''}">${escapeHtml(x.text)}</span>`
    ).join('');
    wrap.appendChild(m);
  }

  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  renderMermaid(bubble);
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  wrap.innerHTML =
    '<div class="msg-role">学习助手</div>' +
    '<div class="bubble"><span class="typing" role="status" aria-label="正在生成回复">' +
    '<i></i><i></i><i></i></span></div>';
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

/* ─────────────────── 侧栏渲染 ─────────────────── */

/**
 * 进度面板底部的鼓励语。
 * 面向初学者：进度条只回答「走了多远」，回答不了「现在该干嘛」，
 * 所以这里按进度分段给一句具体的下一步，而不是一句通用的「加油」。
 */
function cheerFor(done, total, percent) {
  if (done >= total) return '<b>全部完成 🎉</b>换一门课练手，或者回左侧挑几节复习。';
  if (done === 0) return '<b>还没开始。</b>输入「开始第 1 节」，我会一步步带你走。';
  if (percent < 25) return `<b>好的开始。</b>已学完 ${done} 节，接着来第 ${done + 1} 节。`;
  if (percent < 50) return `<b>渐入佳境。</b>原理部分正在成型，遇到不懂的随时打断我。`;
  if (percent < 75) return '<b>过半了。</b>后面转向 Webpack / Vite 的对比，比原理更好记。';
  return `<b>快到终点了。</b>还剩 ${total - done} 节，一鼓作气。`;
}

function renderSidebar() {
  if (!STATE) return;
  const p = STATE.progress;

  $('progress-fraction').textContent = `${p.completed.length} / ${p.total_sections}`;
  // 侧栏「课程结构」表头的计数，和进度/画像表头保持一致（原本这个 span 从未被赋值）
  $('course-count').textContent = String(STATE.course.length);
  $('progress-percent').textContent = p.percent + '%';
  // 用 scaleX 而不是 width：width 会触发布局重排，transform 走合成层
  $('progress-bar').style.transform = `scaleX(${p.percent / 100})`;
  $('progress-track').setAttribute('aria-valuenow', String(p.percent));
  // 完整口径塞进 title：原样铺在这行小字里会折成三行，把卡片撑得又高又碎。
  // 这行要回答的只是「怎样才算学完一节」，其余细节留给悬浮提示。
  const formulaEl = $('progress-formula');
  formulaEl.textContent = '一节 = 作答 + 批改 + 确认';
  formulaEl.title = p.progress_formula;
  $('progress-cheer').innerHTML = cheerFor(p.completed.length, p.total_sections, p.percent);

  // 课程清单
  const doneIds = new Set(p.completed.map((c) => c.id));
  const list = $('course-list');
  list.innerHTML = '';
  let lastMod = null;
  for (const s of STATE.course) {
    if (s.module !== lastMod) {
      lastMod = s.module;
      const lbl = document.createElement('div');
      // 领域色带：10 个领域固定配色，长列表里才不会糊成一片。
      // 早先按 M1~M4 取色（原书四模块），扩到 10 领域后改为按领域代号映射。
      lbl.className = 'mod-label' + (DOMAIN_BAND[(s.id.match(/^(D\d|X\d)/) || [])[1]] ? ' ' + DOMAIN_BAND[(s.id.match(/^(D\d|X\d)/) || [])[1]] : '');
      lbl.textContent = s.module;
      list.appendChild(lbl);
    }
    const row = document.createElement('div');
    const isCurrent = p.current === s.id;
    const isDone = doneIds.has(s.id);
    row.className = 'sec' + (isDone ? ' done' : '') + (isCurrent ? ' current' : '');
    // 「进行中」以前写在 CSS 伪元素里，读屏软件读不到，也无法随语言切换，改成正经的 DOM
    row.innerHTML =
      `<span class="sid">${s.id}</span>` +
      `<span class="sec-title">${escapeHtml(s.title)}</span>` +
      (isCurrent ? '<span class="sec-flag">进行中</span>' : '');
    row.title = `预计 ${s.minutes} 分钟，点击可让助手直接讲这一节`;
    if (isCurrent) row.setAttribute('aria-current', 'true');
    activate(row, () => {
      $('input').value = `请讲 ${s.id}（${s.title}）`;
      autoGrow();
      $('input').focus();
    }, `${s.id} ${s.title}${isDone ? '，已完成' : ''}${isCurrent ? '，进行中' : ''}`);
    list.appendChild(row);
  }

  // 待办
  const pa = p.pending_answer || [];
  const pc = p.pending_confirm || [];
  const body = $('pending-body');
  if (!pa.length && !pc.length) {
    body.className = 'pending-body dim';
    body.textContent = '暂无';
  } else {
    body.className = 'pending-body';
    let html = '';
    for (const q of pa) {
      html += `<div class="item"><span class="sec-tag">待作答</span>${escapeHtml(q.section)}</div>`;
    }
    for (const c of pc) {
      html += `<div class="item"><span class="sec-tag badge-warn">待确认</span>${escapeHtml(c.section)}</div>`;
    }
    body.innerHTML = html;
  }

  // 画像
  const pf = $('profile-body');
  $('profile-count').textContent = String(STATE.learner_profile.length);
  if (!STATE.learner_profile.length) {
    pf.className = 'profile-body dim';
    pf.textContent = '由使用过程累积，不预置。';
  } else {
    pf.className = 'profile-body';
    pf.innerHTML = STATE.learner_profile.slice(-12).map((x) =>
      `<div class="item"><span class="cat">${escapeHtml(x.category || '未分类')}</span>${escapeHtml(x.phenomenon)}</div>`
    ).join('');
  }
}

function setStatus(ready, text) {
  const dot = $('status-dot');
  dot.className = 'dot ' + (ready ? 'on' : 'off');
  $('status-text').textContent = text;
}

/* ─────────────────── 网络 ─────────────────── */

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
}

/**
 * 后端选择。
 *
 * 应用有两个交付形态，前端只认这一个接口：
 *   · 有服务端（node server.js）—— 走 HTTP /api/*
 *   · 没有服务端（GitHub Pages 等静态托管）—— 走浏览器内的 client-backend.js
 *
 * 探测方式：请求一次 api/bootstrap。静态托管上它会落到 404 页面，
 * 状态码不是 2xx、内容类型也不是 JSON，据此判定为静态形态。
 * 用相对路径而不是绝对路径，这样部署在子路径（user.github.io/repo/）下也能工作。
 */
const serverBackend = {
  isLocal: false,
  bootstrap: () => api('/api/bootstrap'),
  chat: (message) => api('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  saveConfig: (patch) => api('/api/config', { method: 'POST', body: JSON.stringify(patch) }),
  testConfig: () => api('/api/config/test', { method: 'POST' }),
  reset: () => api('/api/reset', { method: 'POST' }),
  // 组课：形状与 client-backend.js 的两个同名方法一致
  nodes: () => api('/api/nodes'),
  plan: (opts) => {
    const q = new URLSearchParams();
    if (opts.targets && opts.targets.length) q.set('targets', opts.targets.join(','));
    if (opts.domains && opts.domains.length) q.set('domains', opts.domains.join(','));
    if (opts.levels && opts.levels.length) q.set('levels', opts.levels.join(','));
    if (opts.maxNodes) q.set('max', String(opts.maxNodes));
    return api('/api/plan?' + q.toString());
  },
};

let Backend = serverBackend;

async function pickBackend() {
  try {
    const res = await fetch('api/bootstrap', { headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('json')) return;   // 有服务端，用默认的
  } catch { /* 网络层就失败了，往下走按静态处理 */ }
  if (window.FBLocalBackend) Backend = window.FBLocalBackend;
}

async function bootstrap() {
  const data = await Backend.bootstrap();
  STATE = data.state;
  CONFIG = data.config;
  LLM_READY = data.llmReady;
  // 历史由后端落盘，首屏拿回来重放。之前它只活在内存数组里，刷新即丢。
  RESTORED = Array.isArray(data.history) ? data.history : [];

  renderSidebar();
  $('kb-info').textContent = `知识库 ${data.knowledgeChunks} 片段`;
  if (LLM_READY) {
    // 静态形态下必须说清楚，否则使用者会以为密钥存在某个服务器上
    setStatus(true, `${Backend.isLocal ? '静态模式' : '已连接'} · ${CONFIG.model}`);
  } else {
    setStatus(false, Backend.isLocal
      ? '未配置模型，点「模型设置」填入你自己的 API Key'
      : '未配置模型，点右上角「模型设置」');
  }
  // 静态形态下设置弹窗里那段「密钥只存在服务端」的说法是不成立的，两条互换
  $('settings-local-note').hidden = !Backend.isLocal;
  $('settings-server-note').hidden = Backend.isLocal;
}

/** 把服务端存下来的对话重新画出来。只回放角色与正文，不重放当时的徽章。 */
function replayHistory() {
  for (const m of RESTORED) {
    addMessage(m.role, m.content);
  }
}

async function send(text) {
  if (busy) return;
  const message = String(text || '').trim();
  if (!message) return;

  busy = true;
  $('btn-send').disabled = true;
  $('input').value = '';
  autoGrow();

  addMessage('user', message);

  const typing = addTyping();

  // 记下这一轮之前已完成哪些节：庆祝动效必须由「本轮新增」触发，
  // 否则每说一句话都会重放一次礼花。
  const doneBefore = new Set(STATE.progress.completed.map((c) => c.id));

  try {
    // 不再把 history 传上去：后端自己持有落盘的那份，浏览器传的只是镜像，
    // 两边都传迟早会不一致（比如刚清空过历史但页面还没刷新）。
    const data = await Backend.chat(message);

    typing.remove();

    if (!data.ok) {
      addMessage('error', (data.message || '调用失败') + (data.hint ? '\n\n' + data.hint : ''));
    } else {
      STATE = data.state;
      const newlyDone = STATE.progress.completed.filter((c) => !doneBefore.has(c.id));
      const allDone = newlyDone.length > 0
        && STATE.progress.completed.length >= STATE.progress.total_sections;

      addMessage('assistant', data.reply, buildMeta(data, newlyDone, allDone));
      renderSidebar();
      celebrate(newlyDone, allDone);
    }
  } catch (e) {
    typing.remove();
    addMessage('error', '请求失败：' + e.message);
  } finally {
    busy = false;
    $('btn-send').disabled = false;
    $('input').focus();
  }
}

/**
 * 庆祝：完成一节放礼花棒，完成全部放烟花。
 *
 * 放在 send() 里而不是 renderSidebar() 里 —— renderSidebar 在 bootstrap、
 * 重置、每次刷新时都会跑，挂在它上面会导致「一开页面就放礼花」。
 */
function celebrate(newlyDone, allDone) {
  if (!newlyDone.length) return;
  if (allDone) {
    FX.fireworks();
    addMessage('system',
      `**全部 ${STATE.progress.total_sections} 节完成！** 你已经走完「核心原理 → 工具对比 → 新趋势 → 学习路径」这条主线。\n\n` +
      '建议回左侧挑 2~3 节重讲一遍做巩固。第二遍听的时候，注意力会落在第一遍没接上的那几处链条上。');
    return;
  }
  FX.confetti();
}

function buildMeta(data, newlyDone = [], allDone = false) {
  const meta = [];
  const p = data.state.progress;
  meta.push({ text: `进度 ${p.completed.length}/${p.total_sections} · ${p.percent}%`, ok: false });
  if (newlyDone.length) {
    meta.push({
      text: allDone ? '全部章节完成' : `本节完成 · ${newlyDone.map((c) => c.id).join('、')}`,
      win: true,
    });
  }
  if (data.patchApplied) {
    meta.push({ text: '状态已更新', ok: true });
    for (const n of data.notes || []) meta.push({ text: n, ok: false });
  } else {
    meta.push({ text: '未收到状态补丁', ok: false });
  }
  if (data.sources && data.sources.length) {
    meta.push({ text: `检索 ${data.sources.map((s) => s.heading).join('、').slice(0, 60)}`, ok: false });
  }
  return meta;
}

/* ─────────────────── 输入框 ─────────────────── */

function autoGrow() {
  const el = $('input');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

/* ─────────────────── 设置弹窗 ─────────────────── */

const PRESETS = [
  { label: '本地 Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
];

function renderPresets() {
  const row = $('presets');
  row.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('span');
    b.className = 'preset';
    b.textContent = p.label;
    b.title = `${p.baseUrl} · ${p.model}`;
    activate(b, () => {
      $('cfg-baseUrl').value = p.baseUrl;
      $('cfg-model').value = p.model;
      $('settings-msg').textContent = '';
    }, `填入 ${p.label} 的默认地址与模型名`);
    row.appendChild(b);
  }
}

/**
 * 密钥来源提示。
 * 部署在服务器上时，密钥来自环境变量，界面上填什么都没用 ——
 * 这时必须说清楚，否则用户会反复尝试保存并以为自己配错了。
 */
function keyStateText() {
  if (CONFIG.apiKeySource === 'env') return '（由服务器环境变量提供，界面上改不动）';
  return CONFIG.hasApiKey ? '（已保存，留空不修改）' : '（尚未设置）';
}

function openSettings() {
  $('cfg-baseUrl').value = CONFIG.baseUrl || '';
  $('cfg-model').value = CONFIG.model || '';
  $('cfg-apiKey').value = '';
  $('cfg-temperature').value = CONFIG.temperature ?? 0.4;
  $('cfg-maxTokens').value = CONFIG.maxTokens ?? 2000;
  const fromEnv = CONFIG.apiKeySource === 'env';
  $('cfg-apiKey').disabled = fromEnv;
  $('cfg-apiKey').placeholder = fromEnv ? '密钥由服务器环境变量提供' : '留空表示不修改';
  $('key-state').textContent = keyStateText();
  $('settings-msg').textContent = '';
  $('settings').showModal();
}

/**
 * 从表单读配置并保存。返回是否成功。
 * 服务端会做真正的校验（URL 合法性、数值区间），这里负责把失败原因显示出来，
 * 不能默默吞掉 400，否则弹窗会关掉、状态栏却还是旧的，用户无从判断到底存没存上。
 */
async function saveConfigFromForm(msgEl, opts = {}) {
  let data;
  try {
    data = await Backend.saveConfig({
      baseUrl: $('cfg-baseUrl').value.trim(),
      model: $('cfg-model').value.trim(),
      apiKey: $('cfg-apiKey').value,
      temperature: Number($('cfg-temperature').value),
      maxTokens: Number($('cfg-maxTokens').value),
    });
  } catch (e) {
    msgEl.className = 'settings-msg err';
    msgEl.textContent = '保存失败：' + e.message;
    return false;
  }

  if (!data.ok) {
    msgEl.className = 'settings-msg err';
    msgEl.textContent = '保存失败：' + (data.message || '未知错误');
    return false;
  }

  CONFIG = data.config;
  LLM_READY = data.llmReady;
  $('key-state').textContent = keyStateText();
  // 状态栏在这里统一刷新：任何调用方都不该自己记得补这一步
  setStatus(LLM_READY, LLM_READY ? `已连接 · ${CONFIG.model}` : '未配置模型');
  if (!opts.silent) {
    msgEl.className = 'settings-msg ok';
    msgEl.textContent = LLM_READY ? '已保存' : '已保存（地址或模型名还不完整）';
  }
  return true;
}

/* ─────────────────── 绑定 ─────────────────── */

// 「下一节」与「没有疑问」刻意分成两个按钮：
// 前者是推进指令，后者是确认通过，合成一句话会让那道闸门失效。
const QUICK = ['开始第 1 节', '我学到哪了？', '下一节', '没有疑问'];

function renderQuick() {
  const box = $('quick-prompts');
  box.innerHTML = '';
  for (const q of QUICK) {
    const b = document.createElement('span');
    b.className = 'qp';
    b.textContent = q;
    activate(b, () => send(q), `发送：${q}`);
    box.appendChild(b);
  }
}

/**
 * 窄屏侧栏抽屉。
 *
 * 改版前窄屏是直接 display:none：进度、课程结构、待办、学习者画像在手机上
 * 全部消失，等于看不到「学了什么」。改成抽屉后内容都还在，只是按需展开。
 */
function setupNavDrawer() {
  const sidebar = $('sidebar');
  const backdrop = $('nav-backdrop');
  const toggle = $('btn-nav');

  const setOpen = (open) => {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  // 回到宽屏要清掉抽屉状态，否则样式会残留在侧栏上
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

/**
 * 输入区浮在消息之上，所以消息区必须空出与它等高的下边距。
 * 输入框会随内容长高，这个高度只能实测，写死迟早会压住最后一条消息。
 */
function setupComposerHeight() {
  const wrap = $('composer-wrap');
  const root = document.documentElement;
  const sync = () => root.style.setProperty('--composer-h', wrap.offsetHeight + 'px');
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(sync).observe(wrap);
  } else {
    window.addEventListener('resize', sync);
  }
  // 首次同步要等样式应用完，否则量到的是未渲染的高度
  requestAnimationFrame(sync);
}

/**
 * 新手引导弹窗。
 *
 * 「先看看」与「知道了，开始学」的区别是：后者顺手把第一句问话填进输入框，
 * 让初学者从「读完说明」到「真的开始」之间没有一步需要自己猜。
 */
function setupGuide() {
  const dlg = $('guide');
  const close = () => { dlg.close(); $('input').focus(); };

  $('btn-guide').onclick = () => dlg.showModal();
  $('btn-guide-close').onclick = close;      // 「先看看」：关掉就好
  $('btn-guide-start').onclick = () => {     // 「知道了，开始学」：顺手把第一步填好
    close();
    if (STATE && !STATE.progress.completed.length) {
      $('input').value = '开始第 1 节';
      autoGrow();
    }
  };
}

/**
 * 切换课程模式 / 写入新计划。
 *
 * **切换时必须明确提示**（用户 2026-10-19 的要求）：两种模式的**分母不同**，
 * 不提示的话使用者会以为进度丢了或坏了。所以这里：
 *   ① 用后端返回的 notes 原样播报（它由 core 生成，含"已完成 N/M"，单一来源）；
 *   ② 立刻重渲染侧栏，进度条、分母、课表同步换。
 */
async function switchMode(opts) {
  let r;
  try {
    r = await Backend.mode(opts);
  } catch (e) {
    addMessage('error', '切换失败：' + e.message);
    return null;
  }
  if (!r || !r.ok) {
    addMessage('error', '切换失败：' + ((r && r.message) || '未知原因'));
    return null;
  }
  STATE = r.state;
  renderSidebar();
  const notes = (r.notes || []).filter(Boolean);
  if (notes.length) addMessage('system', notes.map((n) => '· ' + n).join('\n'));
  return r;
}

/* ── 按需组课 ──────────────────────────────────────────────────────────
   界面只负责「选范围」，剩下的交给内核的 assemblePlan：
   前置闭包与拓扑排序必须由代码做，模型/用户只决定学哪一片。
   这里刻意**不写回 STATE** —— 它是一条预览路径，进度口径仍以课程表为准，
   否则「计划里的节点」和「课程表的章」会混成两套分母。 */
async function setupPlan() {
  const dlg = $('plan');
  const domBox = $('plan-domains');
  const lvBox = $('plan-levels');
  const note = $('plan-note');
  let meta = null;

  async function fill() {
    if (meta) return meta;
    meta = await Backend.nodes();
    domBox.innerHTML = '';
    for (const [code, name] of Object.entries(meta.domains || {})) {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" value="${code}"> ${code} ${escapeHtml(name)}`;
      domBox.appendChild(l);
    }
    lvBox.innerHTML = '';
    for (const [code, name] of Object.entries(meta.levels || {})) {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" value="${code}"> ${code} ${escapeHtml(name)}`;
      lvBox.appendChild(l);
    }
    return meta;
  }

  $('btn-plan').onclick = async () => {
    note.textContent = '';
    try {
      await fill();
    } catch (e) {
      note.textContent = '节点数据没接上：' + e.message + '（先运行 npm run build:nodes）';
    }
    dlg.showModal();
  };

  $('btn-plan-close').onclick = () => dlg.close();

  // 两个模式按钮：切章表是直接切；切计划时若还没有路径，直接把组课弹窗打开，
  // 而不是先切过去留一个 0 节的空面板。
  $('mode-chapter').onclick = () => switchMode({ mode: 'chapter' });
  $('mode-plan').onclick = () => {
    if (STATE && STATE.plan && STATE.plan.length) switchMode({ mode: 'plan' });
    else { note.textContent = '还没有学习路径，先选个范围生成一条。'; dlg.showModal(); }
  };

  $('btn-plan-go').onclick = async () => {
    const picked = (box) => [...box.querySelectorAll('input:checked')].map((i) => i.value);
    const spec = {
      domains: picked(domBox),
      levels: picked(lvBox),
      maxNodes: Number($('plan-max').value) || 0,
    };
    note.textContent = '生成中…';
    const r = await switchMode({ plan: spec });
    if (!r) { note.textContent = '生成失败，见对话里的提示'; return; }
    dlg.close();

    const secs = (r.state.course || []);
    const head = `**已切换到计划模式**：${spec.domains.length ? spec.domains.join(' / ') : '全部领域'}`
      + ` · ${spec.levels.length ? spec.levels.join(' / ') : '全部层级'}`
      + ` · 上限 ${spec.maxNodes || '不限'}`;
    const lines = secs.map((x, i) => `${i + 1}. \`${x.id}\` ${x.title}${x.level ? '（' + x.level + '）' : ''}`);
    let tail = `\n\n共 **${secs.length} 节**。**进度条的分母已随之改变** —— `
      + '计划模式的完成记录是独立的，切回章表时原来的进度还在。';
    const st = r.state.plan && r.state.plan.stats;
    if (r.state.plan && r.state.plan.truncated) {
      tail += st && st.needed > st.total
        ? `\n\n⚠️ 这条路径完整需要 **${st.needed} 节**，超过你设的 ${spec.maxNodes}：前置不能删，所以照实给全。`
        : `\n\n上限 ${spec.maxNodes} 已生效：裁掉了较靠后的目标，前置完整。`;
    }
    addMessage('system', head + '\n\n' + lines.join('\n') + tail);
    $('messages').scrollTop = $('messages').scrollHeight;
  };
}

function init() {
  renderPresets();
  renderQuick();
  setupNavDrawer();
  setupGuide();
  setupPlan();
  setupComposerHeight();
  renderMermaid(document.body);

  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send($('input').value);
  });

  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send($('input').value);
    }
  });

  $('btn-settings').onclick = openSettings;
  $('btn-cancel').onclick = () => $('settings').close();

  $('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('settings-msg');
    msg.className = 'settings-msg';
    msg.textContent = '保存中…';
    const ok = await saveConfigFromForm(msg);
    if (!ok) return;          // 校验失败：留在弹窗里，把原因显示出来
    $('settings').close();
    addMessage('system', LLM_READY
      ? `模型设置已保存：**${CONFIG.model}**\n\n地址：\`${CONFIG.baseUrl}\`\n\n可以开始了，试试输入「开始第 1 节」。`
      : '设置已保存，但 API 地址或模型名还不完整，仍无法调用。');
  });

  // HTML 约束校验失败时，浏览器会**直接吞掉** submit 事件，
  // 用户看到的现象是「点了保存没反应」，没有任何解释。必须在这里把原因说出来。
  // invalid 事件不冒泡，只能用捕获阶段监听。
  $('settings-form').addEventListener('invalid', (e) => {
    const el = e.target;
    const name = el.closest('label')?.querySelector('span')?.textContent?.trim() || el.id;
    const msg = $('settings-msg');
    msg.className = 'settings-msg err';
    msg.textContent = `「${name}」取值不合法，允许范围 ${el.min} ~ ${el.max}`;
  }, true);

  $('btn-test').onclick = async () => {
    const msg = $('settings-msg');
    msg.className = 'settings-msg';
    msg.textContent = '先保存再测试…';
    const saved = await saveConfigFromForm(msg, { silent: true });
    if (!saved) return;
    msg.className = 'settings-msg';
    msg.textContent = '正在测试…';
    const r = await Backend.testConfig();
    if (r.ok) {
      msg.className = 'settings-msg ok';
      msg.textContent = `连通正常，模型回复：${r.reply}`;
      CONFIG = (await Backend.bootstrap()).config;
      LLM_READY = true;
      setStatus(true, `已连接 · ${CONFIG.model}`);
    } else {
      msg.className = 'settings-msg err';
      msg.textContent = '失败：' + r.message;
    }
  };

  $('btn-reset').onclick = async () => {
    if (!confirm('确定重置？已完成节、待办、学习者画像、以及全部对话记录都会被清空，且无法恢复。')) return;
    const data = await Backend.reset();
    STATE = data.state;
    renderSidebar();
    messagesEl.innerHTML = '';
    RESTORED = [];
    greet();
  };

  // 先定后端（能连上服务端就用服务端，否则退回浏览器内实现），再拉状态。
  pickBackend()
    .then(bootstrap)
    .then(() => {
      // 先把存下的对话画出来，再补一句状态 —— 顺序反了会看起来像是
      // 「助手刚说了这句话」，而它其实是上次会话的残留。
      replayHistory();
      greet();
    })
    .catch((e) => {
      setStatus(false, '初始化失败');
      addMessage('error', '初始化失败：' + e.message);
    });
}

function greet() {
  const p = STATE.progress;
  const cur = p.current ? STATE.course.find((s) => s.id === p.current) : null;

  // 恢复过历史时不能再贴一遍欢迎语：它会排在旧对话的最后，
  // 看起来像助手刚刚开口自我介绍，而实际上上下文早就进行到一半了。
  if (RESTORED.length) {
    let tip = `已恢复上次的对话，共 **${RESTORED.length} 条**。`
      + `当前进度 **${p.completed.length}/${p.total_sections}（${p.percent}%）**。`;
    if (cur) tip += `\n\n停在这一节：**${cur.id} ${cur.title}**。`;
    if (p.pending_answer.length) tip += `\n\n还有 **${p.pending_answer.length} 道待作答**的题目。`;
    if (p.pending_confirm.length) tip += `\n\n**${p.pending_confirm.length} 节**已批改、等你确认有无疑问。`;
    if (!LLM_READY) {
      tip += '\n\n> ⚠️ 还没有配置大模型，点右上角**「模型设置」**填 API 地址和模型名之后才能对话。';
    }
    addMessage('system', tip);
    return;
  }

  let text = '我是**前端工程化学习助手**。按 10 个领域、42 章组织：从写第一个页面到 AI 在工程流程里的位置，一章一讲，讲完必问，批改后等你确认才往下走。\n\n';

  if (!p.completed.length && !cur) {
    // 首访者需要的不是「进度 0%」，而是「我现在该做哪一步」。
    text += '三步就能开始：\n\n'
      + '1. 点右上角 **「模型设置」**，选一个预设（比如 DeepSeek）填好密钥并保存。没配好之前，我收不到你说的话。\n'
      + '2. 输入 **「开始第 1 节」**，我会讲解，并配上流程图和对比表格。\n'
      + '3. 用自己的话回答我的问题；没有疑问就回 **「没有疑问」**，再说 **「下一节」** 继续。\n\n'
      + '左侧「课程结构」里点任意一节，可以直接跳到那一节开始。';
  } else {
    text += `当前进度 **${p.completed.length}/${p.total_sections}（${p.percent}%）**。`;
    if (cur) text += `\n\n停在这一节：**${cur.id} ${cur.title}**（预计 ${cur.minutes} 分钟）。`;
    if (p.pending_answer.length) {
      text += `\n\n还有 **${p.pending_answer.length} 道待作答**的题目，直接作答即可，或者说「把题目重贴一下」。`;
    }
    if (p.pending_confirm.length) {
      text += `\n\n**${p.pending_confirm.length} 节**已批改、等你确认有无疑问。`;
    }
    text += '\n\n说「下一节」可以推进；说「没有疑问」表示本节确认通过。';
  }

  if (!LLM_READY) {
    text += '\n\n> ⚠️ 还没有配置大模型，点右上角**「模型设置」**填 API 地址和模型名之后才能对话。';
  }

  addMessage('system', text);
}

init();

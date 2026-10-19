# 术语表

全书关键术语的统一定义。**凡正文与该表冲突，以本表为准。**

---

## Web 基础与语义化

**a11y tree（可访问性树 / accessibility tree）**
浏览器在 DOM 之外**并行维护的第二棵树**，供辅助技术消费。节点是「角色 + 名字 + 状态」，**不是标签**。
**来源**：标签经 HTML-AAM 映射为 role；可访问名按 W3C《Accessible Name and Description Computation》计算（关联 `label` 在该计算里优先级很高）。

**可聚焦性（focusable area）**
能被脚本或用户聚焦的元素集合。三个来源：原生可聚焦元素、`tabindex`、可编程聚焦。
**与 tab 序的区别**：进入 **sequential focus navigation order**（tab 序列）是可聚焦性的**子集**，不是等价概念。

**约束校验（Constraint Validation）**
HTML Standard 定义的原生表单校验机制。
**关键时机**：校验发生在 `submit` 事件**之前** —— 所以不能靠 JS 监听 `submit` 去"补校验"。
`novalidate` 可整体关闭，因此**服务端必须重做校验**。

**CLS（Cumulative Layout Shift，累积布局偏移）**
布局稳定性指标。**计算公式**：影响面积比（impact fraction） × 移动距离比（distance fraction）。
**为什么 `<img>` 的 `width` / `height` 是硬要求**：给了宽高比，浏览器才能在图片到达前预留正确空间。

---

## CSS 计算规则

**层叠排序（Cascade Sorting Order）**
决定「同一元素的多条冲突声明谁生效」的算法，四步：**来源 → 层 → 特异性 → 出现顺序**。

**特异性（specificity）**
**三元组（ID / class / type）按位比较**，不是「100 / 10 / 1 的分数」。
**常见错误**：当成分数相加后，会得出「11 个 class 赢过 1 个 ID」——实际按位比较下 **ID 位一旦领先就不可追**。

**层叠层（`@layer`）**
在**特异性之前**生效的排序维度。低特异性的声明只要落在高优先级的层里，也能赢过高特异性的非分层声明。

**层叠上下文（Stacking Context）**
`z-index` 的**比较范围**。形成条件：根元素、`position` 非 `static` 且有 `z-index`、`opacity < 1`、`transform` / `filter` / `will-change`、`isolation: isolate` 等。
**推论**：子元素的 `z-index` **无法穿越父级上下文** —— 这是「`z-index` 失效」的头号原因。
**与合成层不等价**：层叠上下文是**绘制顺序**概念，合成层是**渲染性能**概念，两者不互相蕴含。

**`min-width: auto`**
flex / grid 子项的默认最小尺寸，**取内容尺寸**，与 `width` 无关。
**推论**：它是 flex 布局下**内容溢出的头号来源**；修复是显式写 `min-width: 0`。

**`1fr` 的真实含义**
等价于 `minmax(auto, 1fr)`，因此**会被内容撑破**。要真正等分需写 `minmax(0, 1fr)`。

**margin 折叠（Collapsing Margins）**
相邻垂直外边距合并为较大者。**四种不折叠的例外**：建立了 BFC、flex / grid 子项、`float` 或绝对定位、中间有 `border` / `padding` 隔开。

---

## 语言机制

**TDZ（Temporal Dead Zone，暂时性死区）**
`let` / `const` 绑定从**进入作用域**到**初始化完成**之间的区间，此区间内访问抛 `ReferenceError`。
**准确说法**：绑定**已存在但未初始化**，不是「不存在」。

**词法环境（Lexical Environment）**
标识符 → 绑定的映射记录，由外层引用串成链。
**为什么需要**：它解释了「每次迭代环境」—— 循环体内 `let` 每轮迭代创建新的环境记录，`var` 不会。

**抽象操作（Abstract Operation）**
ECMA-262 中定义转换与语义的内部算法（如 `ToPrimitive` / `ToNumber`）。
**它们不写在代码里，但决定一切隐式转换的结果。**

**微任务（Microtask）**
优先级高于任务的队列。**时机**：每个任务执行完后、浏览器取下一个任务前，**清空整个微任务队列**。
**推论**：微任务里无限 `queueMicrotask` 会让页面无法渲染（活锁）。

**实时绑定（Live Binding）**
ESM 的导入是**对导出的绑定**，不是值的拷贝 —— 导出方后续改动对导入方可见。
**对照**：CJS 的 `require` 拿到的是**值拷贝**，因此循环依赖下表现为 `undefined`。

**渲染机会（Rendering Opportunity）**
HTML Standard《Event loops》中 `update the rendering` 这一步。微任务清空后浏览器**按需**决定是否走它，走了才真正绘制。
**推论**：主线程长任务里改样式**不会立刻上屏**。

**强制同步布局（Forced Synchronous Layout）**
在一次脚本执行中交替「读几何属性」与「写样式」，迫使渲染引擎反复提前计算布局。
**代价**：每次读都触发一次同步重排，是循环里的性能杀手。

---

## 模块与包管理

**ESM / CJS 的机制分野**
ESM 的 `import` / `export` 是**语法层的静态声明**，可在解析期分析 → 能摇树；CJS 的 `require` 是**运行期的函数调用** → 只能保守处理整个模块。

**双包危害（Dual Package Hazard）**
同一个包被 ESM 与 CJS **各加载一份**，导致模块状态不共享。
**成因**：`exports` 条件导出按环境分发不同文件；`type` 字段与文件扩展名共同决定「这个文件算哪种格式」。

**幽灵依赖（Phantom Dependency）**
代码里 `import lodash` 能跑，但 `package.json` 从未声明过它 —— 搭的是依赖提升的顺风车。
**为什么危险**：一旦提升结构变化（换包管理器、改依赖层级）就崩。

**内容寻址（Content-addressable Storage）**
以内容哈希作为存储键。pnpm 的硬链接布局与 **Git 的对象模型**是同一个思路。
**推论**：Git 里「改一行 → hash 变 → 快照变」，所以 `rebase` 会**改写历史**。

**条件导出（Conditional Exports）**
`package.json` 的 `exports` 按 `import` / `require` / `browser` / `node` / `types` 等条件分发不同文件。
**注意**：`types` 条件的**顺序有语义** —— 排在 `require` / `import` 之后会被跳过。

**SemVer 的「最左侧非零位」规则**
`1.0.0` 起：主版本号变化 = 破坏性变更；`0.x.y` 阶段主版本号恒为 0，**次版本号才代表破坏性**。
**推论**：`^0.2.3` 与 `^1.2.3` 的可接受区间语义不同。

**lockfile 的边界**
保证**同一包管理器**下的可复现安装。**形状由包管理器自己定义，不可跨包管理器互换**。

**SemVer 与 lockfile 的分工**
`package.json` 声明的是**可接受区间**，lockfile 记录的是**上次解析结果**。二者都不是"当前最新版本"。

---

## 类型工程化

**检查与产出分离**
类型检查（`tsc --noEmit`）与转译（SWC / esbuild）分成两条流水线。
**为什么必须**：转译器**不做类型检查**，只跑构建会漏掉纯类型错误。

**结构化类型（Structural Typing）**
TS 按**结构**判断兼容，不按名义。
**推论**：「类型只在编译期存在」—— 运行时没有任何痕迹，这是"类型过了但运行时报错"的根源。

**Project References / `.tsbuildinfo`**
大仓库的类型增量编译机制：把仓库切成互相引用的小项目，用 `.tsbuildinfo` 记录上次结果，`tsc --build` 只重编受影响的。

---

## 构建基础

**模块（Module）**
构建器处理的最小单位，通常对应一个文件。在依赖图中是一个节点，节点存「绝对路径 + 转换后代码 + 依赖列表」。

**依赖图（Dependency Graph）**
以模块为节点、`import` / `require` / 动态 `import()` 为边的**有向图**，根是入口。构建器从入口出发，循环执行 `resolve → load+transform → parse` 直到队列为空。
**性质**：共享模块在图里只有 **1 个节点**（去重），因此模块代码只执行一次。**图 ≠ 树。**

**resolve**
把 `./utils` 这类相对路径补成**绝对路径**的过程。受 `resolve.extensions`、`resolve.alias`、`package.json` 的 `exports` 影响。
**为什么需要**：路径归一化是去重的前提。

**转换（Transform）**
把浏览器不认的源码变成浏览器认的 JS。执行者是 Loader 链 / 转译器（Babel、SWC、esbuild、Oxc）。

**转译（Transpile）**
狭义的转换：保留语义的前提下改变语法（TS → JS、JSX → JS、新语法降级到旧语法）。
**与「编译」的区别**：转译不改语言层级（都在 JS 家族内）；编译通常指更彻底的翻译。

---

## 产物

**chunk**
module 的**打包容器**。1 个 chunk ≈ 产物里 1 个 `.js` 文件。
**三个来源**：① `entry`（入口 chunk）② 动态 `import()`（懒加载 chunk）③ `splitChunks`（公共 chunk）。
**读产物的第一步**：判断一个 chunk 属于哪一类来源。

**入口（Entry）**
依赖图的起点。对象写法时，key 即产物名模板里的 `[name]`。

**产物（Bundle / Asset）**
构建输出的、将被部署的文件集合（通常在 `dist/`）。

**hash（内容指纹）**
产物文件名里的一段十六进制字符串，用于缓存控制。三种：
- `[hash]` —— 整个构建 → **禁用**
- `[chunkhash]` —— 单个 chunk → 易被运行时胶水污染
- `[contenthash]` —— **该文件的最终内容** → 生产首选

**运行时胶水（Runtime Glue）**
打包器注入到产物里的模块注册表与 `require` 实现（Webpack 的 `__webpack_require__` 等）。
**为什么要单独抽出来**：否则它存在于每个 chunk 里，任何一处变化会污染其他 chunk 的 `chunkhash` → 缓存白白失效。

**缓存三件套**
`contenthash` + `runtimeChunk: 'single'` + `moduleIds: 'deterministic'`。缺一个 hash 就不稳。

**hash 稳定性**
内容不变时文件名不变的属性。它是**长效 HTTP 缓存成立的前提**。
**判据**：改一行代码能预测哪些产物 hash 会变。

---

## 扩展点

**Loader**
**单模块级**的转换管道。配置在 `module.rules`，数组化。
**执行顺序：从右到左、从下到上**（等价于函数组合 `f(g(h(x)))`）。
**本质**：类型转换管道 —— 每一步的输出必须匹配下一步的输入。

**Plugin**
**全流程级**的干预装置。通过 `apply(compiler)` + `compiler.hooks.xxx.tap()` 注册。
**能介入四阶段**：初始化 / 编译 / 生成 / 输出。**能生成、修改、删除最终产物**。

**判别口诀**
处理**单个源文件内容** → Loader；涉及**构建阶段、跨文件、产物编排** → Plugin。
**判据是「它处理的是谁」，不是「它看起来在干什么」。**

**Tapable**
Webpack 的钩子体系。**与 Rollup 插件接口不通用** —— 这是 Webpack 插件无法迁移到 Vite 的根本原因。

---

## 产物优化

**Tree Shaking**
移除未被使用的导出。**两个执行者两阶段**：
① **标记**（打包器 `usedExports` / Rollup）—— 打标记，代码**仍保留**
② **删除**（压缩器 Terser / SWC minify）—— 读标记，**物理删除**
**两个前提**：必须是 ESM；生产模式才启用。

**`usedExports`**
打包器自动生成的标记，粒度是**导出的成员**。

**`sideEffects`**
`package.json` 字段，粒度是**整个模块能否跳过**。
**它由库作者提供，消费方改不了。**
**语义**：`false` 表示未被引用的模块可整体跳过；有引用则照常执行。CSS / polyfill 需写数组例外。

**代码分割（Code Splitting）**
把产物拆成多个 chunk。**三种触发方式**：多入口 / 动态 `import()` / `splitChunks`。
**核心分界线**：**只有动态 `import()` 能改变「运行时什么时候下载」**。

**动态 import**
`import()` 表达式。构建期分包，**运行时按需下载**。
**效果**：减小**首屏体积**；**不减小总产物体积**。

**`splitChunks`**
Webpack 的抽公共包配置。
**注意**：Webpack 5 默认 `chunks: 'async'` —— 只对动态 import 产生的 chunk 生效，**同步入口之间的共享模块不会自动抽**。
**`minChunks`** 数的是「引用它的 **chunk 数量**」，不是模块数量。

**`manualChunks`**
Rollup / Vite 侧的自定义分组配置（`build.rollupOptions.output.manualChunks`）。

**Scope Hoisting / `concatenateModules`**
把多个模块的作用域合并，减少运行时胶水，便于压缩器做跨模块死代码消除。`mode: 'production'` 下默认开启。

---

## 开发体验

**HMR（Hot Module Replacement）**
运行时替换变更的模块，**保留应用状态**。
**链路**：改文件 → Watcher → Dev Server 重新编译 → WebSocket 推送 → 浏览器 HMR Runtime 替换。
**accept 边界**：从改动模块沿引用链**向上冒泡**，找到最近声明 `accept` 的模块作为替换落点；**找不到就上溯到 entry → 退化为整页刷新**。
**边界由框架插件提供**（`vue-loader` / `@vitejs/plugin-vue` / `react-refresh`）。

**Watcher**
监听文件系统变化的组件。

**Source Map**
产物位置 ↔ 源码位置的反向映射（`.map` 文件 + 产物末行的 `//# sourceMappingURL=` 注释）。
**性质**：**不改变运行结果**，只是给调试器看的旁路信息。

**devtool（Webpack）/ `build.sourcemap`（Vite）**
Source Map 的生成策略。核心取舍：**速度 ↔ 精度 ↔ 是否泄露源码**。
生产禁用 `source-map`（注释留在产物里 → 可下载 `.map` 还原源码）；用 `hidden-source-map`（生成但不写注释）。

---

## 模式与环境

**`mode`**
Webpack 的预设默认值开关（`development` / `production`）。**不是全能开关** —— 只管"默认值有没有被设定"，不管"你的项目需不需要"。

**`NODE_ENV`**
**构建期字面量替换**的产物，**不是运行时环境变量**。
**两个执行者**：① 打包器（`DefinePlugin` / Vite `define`）整体替换成字符串字面量；② 压缩器发现条件恒假 → 判死代码 → 物理删除。

**构建期字面量替换（Compile-time Text Substitution）**
在编译期把一段源代码文本替换成另一个字面量。
**重要推论**：只能替换**完整字面量表达式**。`import.meta.env[key]` 这类动态取值拿不到。

**`VITE_` 前缀**
Vite 中**默认暴露给前端代码**的环境变量前缀。**安全设计** —— 防止服务端密钥进前端产物。

---

## Webpack 与 Vite

**依赖预构建（Dependency Pre-Bundling）**
Vite dev 启动时对 `node_modules` 依赖做的预处理。**两个目的（顺序不能反）**：
① **CJS/UMD → ESM 兼容** —— 不做则浏览器不认 `require`，**直接跑不起来**
② **性能** —— 把内部模块极多的 ESM 依赖合并（`lodash-es` 600+ 模块 → 1）
**缓存位置**：`node_modules/.vite`。**执行者**：当前为 Rolldown（早期 esbuild）。

**原生 ESM 开发服务器**
不打包，直接以原生 ESM 提供源码，按 import 请求逐个转换的开发服务器模型。Vite dev 采用此模型。

**请求瀑布（Request Waterfall）**
**串行的依赖链** —— A 加载完才知道要加载 B。与"并发太多导致的网络拥塞"是**两个不同问题**。

**网络拥塞**
大量请求并发导致的问题（如 600+ 个模块请求同时发出）。**不要把它叫请求瀑布。**

---

## 新一代工具

**打包层 / 转译层 / 压缩层 / 一体化层**
构建管线的分层。
**分层替换**：转译层 Babel·tsc → SWC·esbuild；压缩层 Terser → SWC minify；打包层 Webpack·Rollup → Rspack·Rolldown·Farm；一体化层 → Turbopack。

**并行度决定难度**
**打包层最难，因为依赖图是串行约束** —— 必须先知道谁依赖谁，才能决定怎么打包。

**双边网络效应**
插件作者没有动力为"没有用户的新工具"写插件，而他们的用户都在既有生态上 → **另造生态不是"成本高"，是"冷启动根本起不来"**。

**默认即权力**
**强制 ≠ 禁止。强制 = 默认 + 高摩擦回退。**
敢不兼容的三个条件：① 有分发渠道（打包器被包在框架里）② 回退高摩擦（逆默认值）③ 有资格（用户基数 + 不可替代性）。

**dev / prod parity（一致性）**
开发与生产使用**同一个引擎**，消除"本地能跑、生产挂"这一整类 bug。
**Rolldown 最值钱的收益不是速度，是 parity** —— 速度有替代方案，一致性没有。

**Partial bundling**
Farm 的独有策略。介于"全打包"与"不打包 ESM"之间，同时避开请求瀑布与巨型产物。

**Oxc / Lightning CSS**
Rolldown 的技术底座：Oxc 负责转换，Lightning CSS 负责 CSS 压缩。

**折旧率**
知识的过时速度。判断该学什么的依据之一。
**判据**：① 层越低折旧越慢 ② 是否已在默认路径上 ③ 是否兼容存量生态。
**结论**：原理层最慢、打包层最快 —— 因此第 2 章折旧最慢、回报最高。

---

## AI 与构建

**agents as users**
AI agent 成为构建工具（dev server / bundler / linter / CLI）的**直接用户**，而不只是人类的助手。
**推论**：对人类是体验问题，对 agent 是**可靠性要求**（迭代频率高几百倍）。

**结构化诊断（Structured Diagnostics）**
把构建日志预处理成固定字段（`file` / `line` / `column` / `severity` / `message` / `code`），**原始日志不进上下文窗口**。

**两步式（Two-step Retrieval）**
先返回摘要，需要时才取详情 —— 用于在信息量与 token 成本之间取平衡。

**运行时感知工具**
以 dev server 中间件 / 浏览器代理的形式，把 DOM、组件树、computed style、模块图、路由、服务日志通过 MCP 暴露给 agent。

---

## 学习方法

**判据（Criterion）**
"怎么算过关"的可判定标准。**先写判据，再动手。**
**反例**："能跑起来"不是判据；"改一行代码能预测哪些 hash 会变"才是。

**可自证**
项目做完后，**不靠感觉**就能判断自己是否掌握。配动手项目的两条标准之一。

**五台阶**
按能力而非工具组织的学习顺序：① 建立图 ② 会用默认值 ③ **会读产物**（分水岭）④ 会算账 ⑤ 会迁移选型。

**六步测量法**
①拆指标 ②固定变量 ③清三层缓存 ④各跑 5 次取中位数 ⑤记录元数据 ⑥出带前提的结论。

**三层缓存**
① 构建工具缓存（`node_modules/.cache`、`node_modules/.vite`）② 浏览器强缓存（无痕验证）③ 系统层。

**带前提**
结论中同时给出机器、代码规模、依赖数、缓存状态、测量次数等条件。**缺前提的倍数不可复现。**

**以例代概念**
用实例或短语指代原则，导致答案无法复用、无法证伪。
**修正动作**：回答抽象问题**先命名概念再举例**；回答分类问题**先给类别名再列实例**。

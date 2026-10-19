# D3 第 3 章 · 产物是怎么被算出来的

> **本章定位**：D3 领域第 3 章。第 1 章讲了"构建做什么"，第 2 章讲了"配置改什么"，本章讲**"最后那个文件是怎么被算成这个样子的"**。它由五个决策点串联而成，而且**顺序不可交换**：转译（语法）→ 摇树（导出）→ 分割（chunk 边界）→ 压缩（字面量）→ 命名（hash）。整章为【补充背景】。
>
> **对应地图节点**：`D3.L2.06`（编译与转译：Babel / SWC / esbuild + browserslist + 按需 Polyfill）· `D3.L2.07`（**差异化产物**，地图新增节点）· `D3.L2.08`（Tree Shaking）· `D3.L2.09`（代码分割）· `D3.L2.10`（压缩混淆 / Sourcemap / 文件名 Hash / 资源内联阈值）
>
> **前置**：`D3.L2.02`（开发/生产两套目标）· `D3.L1.01`（构建的三段：转译 / 打包 / 优化）· `D2.L2.04`（ESM 静态结构 —— 摇树的前提）。
>
> **规范引用约定**：**构建工具与转译器都没有标准化组织规范**。本章按**官方文档页名**引用，并标注核验日期当日抓到的版本（核验日期 2026-10-17：**Vite v8.3.4** · **Webpack v5** · **Babel 文档（含 Babel 8 迁移说明）** · **Browserslist 官网 `browsersl.ist`**）。凡官方页面**未给出**的结论，明确标注为"页面未覆盖"或"本书的补充"。
>
> **读完能做到**：说清"语法"与"API"的分界，以及为什么转译器不管 polyfill；用 `not` 的组合陷阱解释一条不生效的 browserslist 查询；说清 `sideEffects` 与 `usedExports` 为什么是两件事；判断一段代码为什么摇不掉；说出 `cheap-*` 类 Sourcemap 为什么不能与压缩共存。

---

## 3.1 五个决策点，顺序不可交换

先给全章的地图。一份产物要经过下面五道加工，**每一道的输入是上一道的输出**：

| # | 决策点 | 回答的问题 | 主要执行者 | 对应节点 |
|---|---|---|---|---|
| 1 | **转译** | 这段语法，目标浏览器认识吗？ | Babel / SWC / esbuild / Oxc | `L2.06` |
| 2 | **摇树** | 这个导出，有人用吗？ | 打包器 + 压缩器 | `L2.08` |
| 3 | **分割** | 哪些模块该被打进同一个文件？ | 打包器 | `L2.09` |
| 4 | **压缩** | 这份代码能不能更短？ | Terser / Oxc / esbuild | `L2.10` |
| 5 | **命名** | 文件名该叫什么？ | 打包器 | `L2.10` |

**顺序为什么不可交换**，举一个例子就够了：摇树的第二步依赖"导出是否被使用"，而压缩会在第四步**改变标识符**。如果先压缩再摇树，那"谁引用了谁"已经无从判断。同理，hash 必须在压缩之后算 —— 否则内容变了而 hash 不变。

**这条约束解释了一个常见困惑**：为什么"给压缩器加个选项"不能解决摇树问题。因为它们是流水线上不同位置的旋钮。

---

## 3.2 转译：只管语法，不管 API

### 目标环境：一份配置，多个工具共享

转译的第一步不是"怎么转"，而是"**转到哪**"——这由目标环境决定。

Babel 官方的做法说明很清楚：

> 对于面向浏览器或 Electron 的项目，我们推荐用 `.browserslistrc` 文件来指定目标。你可能已经有这个配置文件了，因为它被生态里很多工具使用，比如 autoprefixer、stylelint、eslint-plugin-compat 以及很多其他工具。

而 `@babel/preset-env` 与它的关系是一条**默认生效的隐式行为**：

> **默认情况下，`@babel/preset-env` 会使用 browserslist 配置源，除非设置了 `targets` 或 `ignoreBrowserslistConfig` 选项。**

两句话合起来给出一条工程纪律：**目标环境只写一份**。写两份（一份给 Babel、一份给 autoprefixer）就会漂移，而漂移的症状是"CSS 降级到了 IE，JS 却没有"。

### `defaults` 到底是什么

Browserslist 官网（`browsersl.ist`）给出的定义：

> `defaults` 是 **`> 0.5%, last 2 versions, Firefox ESR, not dead`** 的简写。

四项的语义：

| 组成项 | 含义 |
|---|---|
| `> 0.5%` | 全球受众份额 > 0.5% 的版本 |
| `last 2 versions` | 每个浏览器的最近 2 个版本 |
| `Firefox ESR` | 最新 Firefox 延长支持版 |
| `not dead` | 排除已死浏览器 |

`not dead` 的定义（官网原文）：

> `not dead` 用于排除已死浏览器，即**超过 24 个月没有官方支持或更新**的浏览器。

**官网明确列出的当前 dead 清单**：IE 11 · IE Mobile 11 · BlackBerry 10 · BlackBerry 7 · Samsung 4 · Opera Mobile 12.1 · **所有版本的百度浏览器**。

**这张清单值得记，因为它是"为什么现在很多项目敢不降级"的量化依据。** 只要你的用户里没有这七个，`defaults` 就会把 IE 排除掉。

### 组合语义：一个真实存在的陷阱

官网给出的三种运算符：

| 语法 | 语义 |
|---|---|
| `,` 或 `or` | **并集** |
| `and` | **交集** |
| `not` | 取反 |

然后是一条官方用 **BEWARE** 标出来的陷阱，值得逐字读：

> ① **带 `not` 的查询不能放在列表的第一位。**
>
> ② **带 `not` 的查询永远与其左侧项按 `and` 结合**，即使你写的是 `or` 或逗号。

所以下面三者**结果完全相同**：

```text
> 0.5% and not last 2 versions
> 0.5% or  not last 2 versions      ← 你以为是"并集"，实际还是交集
> 0.5%,    not last 2 versions      ← 同上
```

**这条陷阱的实践意义**：你无法用 `,` 表达"（A）∪（B 的补集）"。想要那个语义，得把它拆成两条查询分别求值再合并 —— 而多数构建工具只接受一条字符串。**所以写 browserslist 时，"排除某类浏览器"必须写成"从一个大集合里减去它"，而不是"加一个补集进来"。**

### 必须分清的一件事：语法 vs API

这是本节的核心，也是"降级不生效"类问题最常见的根因。

| | 语法（Syntax） | API（内建对象与方法） |
|---|---|---|
| 例子 | 可选链 `?.`、空值合并 `??`、`class` 字段、async/await | `Promise`、`Map`、`Array.prototype.flat`、`Object.entries`、`fetch` |
| 谁来处理 | **转译器** | **Polyfill**（运行时补上实现） |
| 产物形态 | 改写成旧语法，**代码还在** | **注入一段实现代码**，或整体引入一个包 |
| 能否用 Babel 解决 | 能 | **不能** —— Babel 只做语法转换 |

**这条分界的推论很硬**：`Promise` 在老浏览器里不存在，这不是"语法不认识"，而是"**全局对象上没有这个属性**"。转译器把 `async/await` 改写成 `Promise` 链之后，`Promise` 本身依然不存在 —— 于是代码**语法正确但运行时崩**。

**这就是 `@babel/preset-env` 里 `useBuiltIns` 存在的原因**：它负责第二件事。

### `useBuiltIns` 的三档，与一个必须知道的事实

官方对三个取值的原文：

| 取值 | 官方原文 | 语义 |
|---|---|---|
| `false` | "不要按文件自动添加 polyfill，也不要把 `import "core-js"` 或 `import "@babel/polyfill"` 改写成单个 polyfill 导入。" | 完全不处理 |
| `"entry"` | "启用一个插件，把 `import "core-js/stable";` 与 `require("core-js");` 语句替换为按环境决定的、指向不同 core-js 入口的单独导入。" | 在入口处展开成一组具体 polyfill |
| `"usage"` | "在每个文件里，当用到某个 polyfill 时为其添加具体导入。我们利用了打包器只会加载同一 polyfill 一次这一点。" | 按实际使用注入 |

**但这里有一个 2026 年的关键事实，很多资料还没更新：**

> ⚠️ **此选项（`useBuiltIns`）已在 Babel 8 中被移除。要注入 polyfill，可以直接使用 `babel-plugin-polyfill-corejs3`。**

同一页面里，`corejs` 选项、`bugfixes` 选项、`loose` / `spec` 也都被标注为在 Babel 8 移除。

**所以"`useBuiltIns: 'usage'` 是最佳实践"这句话本身已经过期了** —— 它是 **Babel 7** 的写法。用 Babel 8 时要按新方式接 `babel-plugin-polyfill-corejs3`。**引用这条配置前，先确认 Babel 主版本。**

`corejs` 选项的两个细节（Babel 7 语境）：

- **默认值是 `"3.0"`**，官方要求版本号必须带 minor（如 `"3.33"`）；
- 它只在配合 `useBuiltIns: usage | entry` 时生效，作用是"确保 `@babel/preset-env` 注入**你这个 core-js 版本所支持**的 polyfill"。

**这两条合起来解释了一个坑**：默认的 `"3.0"` 是个很低的版本，它只会注入 core-js 3.0 就有的 polyfill。你装了 core-js 3.33、却忘了写 `corejs`，结果就是**较新的 API 补不上**，而且**不报错**。

`entry` 还有一条官方用 **tip** 标出的告诫：

> 整个应用里**只 `import "core-js"` 一次**。多次导入这些包可能造成全局冲突和难以追踪的问题。我们建议创建一个只包含导入语句的单一入口文件。

**"全局冲突"这个词点出了 polyfill 的本质**：它**污染全局作用域**。这一条会直接决定 §3.4 里 `sideEffects` 该怎么标。

### 一处必须如实说明的缺口

网上流传一条说法——"`useBuiltIns: 'usage'` 不要用在库上，因为它会污染使用方的全局"。

**本次核验的 `@babel/preset-env` 页面里没有这条警告。** 该页 `usage` 段落只有一句话，没有任何关于库 / `node_modules` 的告诫。若需要这条论据，应当去查 `babel-plugin-polyfill-corejs3` 的文档，而**不能把"官方说不要用在库上"归给这个页面**。

### 一个连接点：转译器可能亲手毁掉摇树

Webpack 的 Tree Shaking 指南把这件事写成了一条**陷阱**（原文）：

> **确保没有编译器把你的 ES2015 模块语法转换成 CommonJS 模块**（这是流行的 Babel 预设 `@babel/preset-env` 的默认行为）。

而 Babel 对这个"默认行为"的解释是 `modules: "auto"`：

> 默认情况下 `@babel/preset-env` 用 **caller data** 判断 ES 模块与模块特性（如 `import()`）是否应当被转换。通常 caller data 由打包器插件（如 `babel-loader`、`@rollup/plugin-babel`）指定，**因此不建议你自己传 caller data**。

**这条因果链完整体现了"流水线"的性质**：

```
打包器插件把 caller data 传给 Babel
   → modules: "auto" 据此决定保留 ESM
   → 保留的 ESM 才有静态结构
   → 静态结构才能摇树
```

**只要中间任一环被改成"转成 CJS"，摇树就静默失效**（不报错，只是产物变大）。这也解释了 `modules: false` 的官方说明为什么带着警告："只有在你打算向浏览器下发原生 ES 模块时才这样做。"

### 执行者：三个都不做类型检查

| 执行者 | 定位 | 备注 |
|---|---|---|
| **Oxc Transformer** | Vite 当前的转译器 | `build.target` 的转译由它执行；遇到它无法安全转译的特性会**输出警告** |
| **SWC** | Rust 实现的 Babel 替代 | — |
| **esbuild** | Go 实现的转译与打包 | `build.minify: 'esbuild'` 在 Vite 中已废弃 |

**三者的共同点必须点明：都不做类型检查。** 这条在 `D2.L2.09` 已按"检查与产出分离"讲过，它在 D3 里的具体后果是：**构建通过 ≠ 类型正确**，所以 `tsc --noEmit` 必须是独立的一步。

---

## 3.3 差异化产物：为什么要打两份

`D3.L2.07` 是地图新增的节点，它处理一个转译**无法单独解决**的问题。

### 问题：一份产物无法同时服务两端

| 策略 | 现代浏览器 | 老旧浏览器 |
|---|---|---|
| **只发降级产物** | 白拿一份更大的代码、更慢的解析 | 能跑 |
| **只发现代产物** | 最优 | **直接白屏**（语法都不认） |

于是有了第三条路：**打两份，让浏览器自己选一份。**

### 机制：`nomodule` 的选择权在浏览器手上

Vite 官方对 `@vitejs/plugin-legacy` 的描述只有一句，但把机制说清了：

> 旧浏览器可以通过 `@vitejs/plugin-legacy` 支持，它会**自动生成 legacy chunks 与对应的 ES 语言特性 polyfill**。legacy chunks **只会在不支持原生 ESM 的浏览器中有条件地加载**。

**"有条件地加载"这个条件是什么？** 是平台的 **`module` / `nomodule` 双脚本机制**：支持 ESM 的浏览器执行 `<script type="module">` 并**忽略** `<script nomodule>`；不支持 ESM 的浏览器反过来。

**本书的补充（Vite 该页未展开实现细节）**：这就是为什么"判断依据"是**原生 ESM 支持**而不是别的能力 —— 因为 `nomodule` 这个属性本身，是 HTML 规定给"不认识 `type="module"` 的浏览器"用的。它的判别力来自平台，不来自你写的任何检测代码。

**所以在 `nomodule` 机制下，浏览器不会下载另一份产物。** 这一点很重要 —— 差异化产物**不会**造成双倍下载，只会造成**双倍存储**。

### 判据：Browserslist 里那条被忽略的能力查询

Browserslist 官网的查询速查里有一类**能力查询**：

```text
fully supports es6-module
partially supports css-grid
```

官网对 `supports` 前缀的说明是：`supports …` 是 `partially supports` 的别名，但因为语义含糊，**官方建议优先写 `partially supports`**。

**这就是"要不要做差异化产物"的可判定判据**：

```text
> 0.5%, last 2 versions, not dead, not fully supports es6-module
```

跑一条查询，看**还剩多少个浏览器、覆盖多少受众**：

- 结果为空 → 现代产物已经够用，**不需要**差异化；
- 非空且覆盖不可忽略 → 需要差异化，或需要明确放弃这批用户。

Browserslist 官网还给了 `cover 99.5%` 这类按覆盖率截断的查询，可以直接回答"覆盖到 99.5% 需要包含哪些"。

### Vite 的硬性下限

官方给出的兼容性说明里有两条数值，都很硬：

**① Vite 自身的下限（即使你把 `target` 设得更低也满足不了）**：

> Chrome ≥ 64 · Firefox ≥ 67 · Safari ≥ 11.1 · Edge ≥ 79

原因是 Vite 依赖**原生 ESM 动态导入与 `import.meta`**。

**② 当前大版本的默认目标**：

> Chrome ≥ 111 · Edge ≥ 111 · Firefox ≥ 114 · Safari ≥ 16.4

这条与 `build.target` 的默认值 `'baseline-widely-available'` 是同一件事（第 1 章 §1.4 已提，这里补上具体版本号）。官网另说明：`'esnext'` 表示"假设浏览器原生支持动态导入，只做最少转译"。

**这两条数值放在一起，回答了一个常见问题**："我能不能把 `target` 设成 `es5`？"——**不能**，因为 Vite 的运行时机制本身要求 ESM 与 `import.meta`。要支持更老的浏览器，只能走 `plugin-legacy`。

### Vite 不做 polyfill —— 一句必须记住的话

官方在浏览器兼容性一节里写得很直：

> **Vite 只处理语法转换，不覆盖 polyfill。**

并推荐用 `https://cdnjs.cloudflare.com/polyfill/` 这类**按 UserAgent 自动生成 polyfill bundle** 的服务。

**这句话把责任分清了**：

| 责任 | 由谁承担 |
|---|---|
| 语法降级 | Vite 的 `build.target`（Oxc Transformer） |
| **缺失的 API** | **`plugin-legacy`（它带 polyfill）或外部 polyfill 服务** |
| 你自己写的业务代码 | 你 |

**所以"我配了 `target: 'safari11'` 为什么 `Promise.allSettled` 还报错"的答案是**：`target` 只承诺语法，不承诺 API。这与 §3.2 的"语法 vs API"分界是同一条。

### 代价：两份产物的三笔账

| 代价 | 具体表现 |
|---|---|
| **体积** | legacy 产物通常比现代产物显著更大（降级展开 + polyfill），且要全部存下来 |
| **构建时间** | 等于多跑一遍构建 |
| **部署一致性** | 两份产物**必须成对更新** —— 只更新一份会让一部分用户拿到错配的 chunk |

**判据**：差异化产物不是"更安全的默认选择"，而是**一次有明确代价的取舍**。当 `not fully supports es6-module` 的受众已可忽略时，它就是纯开销。

---

## 3.4 Tree Shaking：四种处置，而不是"删掉没用的代码"

### 定义与前史

Webpack 官方定义：

> Tree shaking 是 JavaScript 语境里常用来指**死代码消除**的术语。它依赖于 **ES2015 模块语法的静态结构**，即 `import` 与 `export`。这个名字与概念由 ES2015 模块打包器 **rollup** 推广开来。

历史沿革（官方原文）：**webpack 2** 带来了 ES2015 模块支持与"**未使用导出检测**"；**webpack 4** 增加了用 `package.json` 的 `sideEffects` 属性**给编译器提示**的能力。

### 关键：`sideEffects` 与 `usedExports` 是两件不同的事

这是本节最重要的一段，官方原文写得很清楚：

> **`sideEffects` 与 `usedExports`（更常被称为 tree shaking）这两个优化是两件不同的事。**
>
> **`sideEffects` 有效得多**，因为它允许**跳过整个模块/文件以及完整的子树**。
>
> **`usedExports` 依赖 terser** 去检测语句中的副作用。**这在 JavaScript 里是件难事**，且**不如直截了当的 `sideEffects` 标记有效**。它**也无法跳过子树/依赖**，因为规范要求副作用必须被求值。

### 三种处置状态 —— 本章最好用的心智模型

官方给出的三种模块处置：

> - **include it**：包含该模块、求值它，并继续分析依赖
> - **skip over**：不包含、不求值，但**继续分析依赖**
> - **exclude it**：不包含、不求值，且**不再分析依赖**

配合官方给的 Shopify Polaris 例子，逐文件判定结果如下：

| 文件 | 判定 | 原因 |
|---|---|---|
| `index.js` | include | 无直接导出被用，但**被标记 sideEffects** |
| `configure.js` | include | 同上 |
| `types/index.js` | **exclude** | 无导出被用、未标记 |
| `components/index.js` | **skip over** | 无直接导出被用、未标记，**但再导出的导出被使用** |
| `components/Breadcrumbs.js` | **exclude** | 无导出被用、未标记；**并连带排除其所有依赖，即便依赖本身标记了 `sideEffects`** |
| `components/Button.js` | include | 直接导出被使用 |
| `components/Button.css` | include | 无导出，但**被标记 sideEffects** |

最终只有 4 个模块进入 bundle。

**`skip over` 与 `exclude` 的区别就是 `sideEffects` 的威力所在**：前者只跳过了"这一层"，还得往下看；后者把**整棵子树**剪掉，且**下游的 `sideEffects` 标记不再有机会生效**。

**反过来说，这是一条排查纪律**：如果一个你明确标了 `sideEffects` 的文件仍然被丢掉，先看**它的父模块**是不是被判成了 `exclude`。子树级的剪枝会覆盖子节点自己的声明。

### `sideEffects` 的写法

**取值一：`false`** —— 整个包无副作用。

**取值二：数组**（白名单），官方原文：

> 数组接受指向相关文件的**简单 glob 模式**。底层用 **glob-to-regexp** 实现（支持 `*`、`**`、`{a,b}`、`[a-z]`）。像 `*.css` 这样**不含 `/` 的模式会被当作 `**/*.css`**。

CSS 的官方推荐写法带一条警告：

```json
{ "sideEffects": ["./src/some-side-effectful-file.js", "*.css"] }
```

> 注意**任何被导入的文件都受 tree shaking 影响**。一个仅为副作用而导入的 CSS 文件**必须被加入副作用列表**，否则它会在生产模式下被意外丢掉。

**这条解释了那个经典 bug**：组件库的样式"本地正常、生产丢样式"。因为 `import "./Button.css"` 没有导出、没有引用，从摇树视角看就是一段"没人用的东西" —— 除非你告诉它"这个导入本身就是目的"。

`sideEffects` 还有一个设置位置（官方原文）：**`module.rules` 配置项**也可以设置。

### 为什么必须靠压缩器 —— 四层机制

**第 1 层：打包器只做标记。** 在 `mode: 'development'` + `optimization.usedExports: true` 下，没被使用的 `square` **仍然在产物里**，只是被加了一行注释：

```js
/* unused harmony export square */
function square(x) { return x * x; }
```

官方原文："注意上面那行 `unused harmony export square` 注释……然而，**它仍然被包含在 bundle 中**。"

**第 2 层：删除由压缩器完成。** 切到 `mode: 'production'` 后，`square` 消失，`cube` 被 mangle。

**第 3 层：为什么非它不可。** 官方解释了难点：ESM 的静态结构只能告诉你"`square` 没被 import"，**但不能证明"执行 `square` 的函数体没有副作用"**。官方原话："Terser 确实会尝试弄明白，但在很多情况下它无法确定……**在 JavaScript 这样的动态语言里，要可靠地判定它太难了**。"

**第 4 层：一个容易漏掉的前提。** 官方另一句：

> **`ModuleConcatenationPlugin` 是 tree shaking 能工作所必需的。** 它由 `mode: 'production'` 添加。如果你没用它，记得手动加上 `ModuleConcatenationPlugin`。

**这四层合起来是一条重要认知**：**摇树不是"一个开关"，而是"标记 + 剪枝 + 压缩"三件事的串联**。缺任何一环，产物体积都不会真正下降。

### 三种副作用标注手段

当你确认某段代码其实无副作用、但打包器判不出来时，有三条路（都来自官方）：

| 手段 | 粒度 | 条件 / 版本 |
|---|---|---|
| `/*#__PURE__*/` | **语句级** —— "把这条语句标记为无副作用" | 生效条件是 `optimization.innerGraph: true` |
| `/*#__NO_SIDE_EFFECTS__` | **函数声明级** —— 这类函数的调用在返回值未被使用时可以被删除 | webpack **5.107.0+**；**5.108.0 起跨模块边界传播**（此前只在声明的模块内生效） |
| `module.parser.javascript.pureFunctions` | **配置级** —— 无法改源码时（比如来自依赖的函数）用配置标注 | webpack **5.108.0+** |

`/*#__PURE__*/` 有一条容易踩的细节（官方原文）：

> **传给函数的参数不会被该注解标记**，可能需要逐个标记。

而它的定位，官方给了一个很好记的类比：`sideEffects` 与它相似，但**`sideEffects` 是模块级而非语句级**。

### CJS 为什么摇不动

Webpack 该页**没有专门论证**这一段，但把它列成了**结论清单里的第 2 条**：

> 使用 ES2015 模块语法（即 `import` 与 `export`）。
> **确保没有编译器把你的 ES2015 模块语法转换成 CommonJS 模块**（这是流行的 Babel 预设 `@babel/preset-env` 的默认行为）。

配合开篇定义那句"它依赖于 **ES2015 模块语法的静态结构**"，机制就完整了：

| | ESM | CJS |
|---|---|---|
| 导出是**声明**还是**赋值** | 语法声明，解析期可枚举 | 运行时对 `module.exports` 赋值 |
| 能否在**不执行代码**时知道全部导出 | **能** | **不能** |
| 摇树前提 | 满足 | **不满足** |

**这也是一条"跨章因果"**：`D2.L2.01` 讲 ESM 与 CJS 的机制分野，在 D3 里它的直接后果就是**整个摇树能力的有无**。而破坏这个能力的，往往是**自己配错的一个转译选项**（§3.2 的 `modules`）。

---

## 3.5 代码分割：动态导入是唯一稳定的分割点

### Webpack 官方的三种方式与各自代价

| 方式 | 机制 | 代价（官方原文） |
|---|---|---|
| **入口点** | 用 `entry` 手动切分 | 入口 chunk 间的重复模块会被**同时打进多个 bundle**；"不够灵活，**无法随核心应用逻辑动态切分**" |
| **防重复** | 入口依赖 `dependOn`，或 `SplitChunksPlugin` | —— |
| **动态导入** | 模块内的内联函数调用 | —— |

官方对**入口点**的两条"坑"值得单独记：重复与不灵活。而它对单页多入口的立场是**能不用就不用**：

> 单页应用若坚持多入口，必须配 `runtimeChunk: 'single'`。

推荐做法是"**一个入口 + 多个 import**"（`entry: { page: ['./analytics', './app'] }`），官方说这样"在使用 async script 标签时能获得更好的优化与一致的执行顺序"。

而对动态导入，官方的定位是三种方式里的"**第一种也是推荐的做法**"，并明确 `require.ensure` 属于 **legacy、webpack 专有的写法**。

### `import()` 的三个机制点

**① 它返回 Promise。** 官方原文："由于 `import()` 返回一个 promise，它可以与 async 函数一起使用。" 官方另警告：`import()` 内部使用 promise，若需支持 IE 11 这类旧浏览器，要自己用 shim 补上。

**② 必须解构 `default`** —— 这是最实用的一个点：

> webpack 4 起，导入 CommonJS 模块时 `import` **不再解析为 `module.exports` 的值**，而是为 CJS 模块生成一个人造的**命名空间对象（artificial namespace object）**。

所以：

```js
const { default: _ } = await import('lodash')   // ✅
const _ = await import('lodash')                // ❌ 拿到的是命名空间对象
```

**这条是小节里最容易在真实项目里踩到的一处**，而它的根源又是 D2 那章讲的"ESM 与 CJS 的互操作"。

**③ `webpackExports` 魔法注释可以帮摇树**：

```js
import(/* webpackExports: ["default", "namedExport"] */ "./module")
```

官方说明它能"帮助 tree shake 其他未使用的导出"。

**另有一条排障提示**：运行时 chunk 加载失败会抛 `ChunkLoadError`，官方给的排查三项是——确认 chunk 文件网络可达、检查 `publicPath` 配置、查看浏览器控制台的其他脚本 / 网络错误。

### `splitChunks` 有一个体积阈值前提

官方对该插件的定位：

> `SplitChunksPlugin` 让我们把**公共依赖抽取到已有入口 chunk 或一个全新 chunk** 中。

但紧接着有一条**限定**（原文强调）：

> 公共依赖**只有在满足 webpack 规定的体积阈值时**才会被抽取到独立 chunk。

**这条解释了一个常见困惑**："我配了 `splitChunks: { chunks: 'all' }`，为什么那个小依赖还是被打进了主包？"——因为它没到阈值。

官方另给了一条 CSS 的好消息：**CSS 也按同样方式分割** —— webpack 会自行按 chunk 抽取样式表，所以**懒加载的 CSS 会随需要它的那个 chunk 一起到达**。

### Vite 侧：动态导入的三条硬规则

Vite 官方对**带变量的动态导入**给了三条必须满足的规则（原文要点）：

1. 必须以 `./`、`../` 或 `#` **开头**（`import(\`./dir/${foo}.js\`)` ✅，`import(\`${foo}.js\`)` ❌）
2. 必须以**文件扩展名结尾**（`import(\`./dir/${foo}\`)` ❌）
3. 导入自身目录时必须给出**文件名模式**（`import(\`./prefix-${foo}.js\`)` ✅，`import(\`./${foo}.js\`)` ❌）

**为什么要立这三条规矩**，官方说得很直白：

> 这些规则是为了**防止意外导入不打算被打包的文件的**。例如，如果没有这些规则，`import(foo)` 会把文件系统里的所有东西都打包进来。

**这句话把"打包器的自由度"与"安全边界"联系起来了**：一个完全动态的导入，在打包器看来等于"把目录里所有文件都变成潜在依赖"。

另有一条限制：变量只能表示**一层深度**的文件名；若变量值是 `'foo/bar'`，导入会失败。

### Vite 的 `glob` 与 chunk 的关系

官方说明：

> 匹配到的文件**默认通过动态导入懒加载**，并在构建时**分割为独立的 chunk**。

而 `{ eager: true }` 会把它改成静态 `import` —— 此时**不分割**，并且**可以 tree-shaking**。

**这一对语义值得记**：`eager` 不是一个性能开关，它**改变了模块图的结构**（从动态边变成静态边），因此同时改变了"能否分割"与"能否摇树"。

### 一处重要变更：Vite 的 chunk 配置入口换了

Vite 官方「Building for Production」的 Chunking Strategy 一节只有两句话，但第一句就是关键：

> 你可以用 **`build.rolldownOptions.output.codeSplitting`** 配置 chunk 如何切分（见 Rolldown 文档）。

**`output.manualChunks` 这个写法在这条新路径上不再适用。** 这与前两章的发现是同一条线索：Vite 8 的底层已从 Rollup 换成 **Rolldown**，`build.rollupOptions` 也降格为 `build.rolldownOptions` 的**废弃别名**（官方原文："此选项是 `build.rolldownOptions` 的别名，请改用 `build.rolldownOptions`"）。

**Vite 还自动做了三件事**（官方称"除非你想关掉，否则无需显式配置"）：

| 自动优化 | 内容 |
|---|---|
| **CSS 代码分割** | async chunk 用到的 CSS 自动抽成独立文件，通过 `<link>` 加载，**并保证 CSS 加载完成后才执行 async chunk**（避免 FOUC） |
| **Preload 指令生成** | 为入口 chunk 及其直接依赖生成 `<link rel="modulepreload">` |
| **Async chunk 加载优化** | 未优化时 `Entry ---> A ---> C` 需要多一次往返；优化后 `Entry ---> (A + C)` 并行预取，**无论深度都能消除额外往返** |

### 预取与预载：官方警告用错会变慢

Webpack 的 `prefetch` / `preload` 两个魔法注释，官方定义：

| 指令 | 官方定义 |
|---|---|
| `prefetch` | 资源可能在未来某次导航中需要 |
| `preload` | 资源在当前导航中也会需要 |

四条差异（原文要点）：

1. **预加载 chunk 与父 chunk 并行开始加载**；预取 chunk 在父 chunk **加载完成后**才开始；
2. 预加载是**中等优先级、立即下载**；预取在**浏览器空闲时**下载；
3. 预加载 chunk 应被父 chunk **立即请求**；预取 chunk 可在**未来任意时刻**使用；
4. **浏览器支持不同**。

而官方的风险提示是明确的一句：

> **错误地使用 `webpackPreload` 实际上会损害性能**，所以要小心使用。

**判断口诀**：**点开才用的东西用 `prefetch`（未来导航），首屏就要用的东西才考虑 `preload`。** 把 `preload` 用在"可能永远不点"的弹窗上，等于主动抢首屏带宽。

### 部署端的一条硬约束

Vite 官方提示了一个部署期的风险：新部署删除旧 assets 会让**仍停留在旧页面的用户**加载 chunk 失败。两条对策：

- 监听 **`vite:preloadError`** 事件；
- **对 HTML 设置 `Cache-Control: no-cache`**。

**这条把"构建"与"部署"接上了**：hash 文件名保证了一个文件的内容永不变，但**"旧 HTML 指向已被删除的文件"**这件事，只能靠 HTML 不缓存来解决。完整机制在 `D6.L4.02`（build once, deploy many）。

---

## 3.6 压缩、Sourcemap、Hash 与内联阈值

### 压缩：默认值已经换人了

Vite 官方的 `build.minify`：

> 设为 `false` 关闭压缩，或指定要用的压缩器。**默认是 Oxc Minifier，它比 terser 快 30~90 倍，压缩率只差 0.5~2%。**

| 环境 | 默认值 |
|---|---|
| 客户端构建 | **`'oxc'`** |
| SSR 构建 | **`false`** |

另有一条废弃信息：**`build.minify: 'esbuild'` 已废弃并将在未来移除**；用 `'esbuild'` 或 `'terser'` 时需自行安装对应依赖。

**库模式有一条要注意**（官方原文）：在 `'es'` 格式下该选项**不会压缩空白**，因为那会移除 pure annotations 并**破坏 tree-shaking**。

**这句话值得停一下**：它说明**压缩与摇树之间存在冲突面** —— 好的压缩会删掉"没人读的注释"，而其中就包括 `/*#__PURE__*/`。所以压缩器必须**理解**这些注解，不能一删了之。

Webpack 侧：`optimization.minimize` 在 `production` 默认 `true`；官方另提到 `--optimization-minimize` 标志也可启用 `TerserPlugin`。

### Sourcemap：命名规则本身就是文档

Webpack 官方的取值模式（原文）：

```text
[inline-|hidden-|eval-][nosources-][cheap-[module-]]source-map[-debugids]
```

**顺序不可打乱**，且前三个前缀互斥。各修饰符的官方解释：

| 修饰符 | 官方原文 | 含义 |
|---|---|---|
| `eval-*` | "为每个模块生成 SourceMap 并通过 eval 附加" | 不产独立 `.map`，**重建最快**；官方标注"推荐用于开发，因为重建性能更好" |
| `inline-*` | "把 SourceMap 内联到原文件，而不是创建独立文件" | 以 DataURL 内联 |
| `hidden-*` | "不添加对 SourceMap 的引用。当 SourceMap 不部署但仍需生成（例如用于错误上报）时使用" | 生成但不写 `//# sourceMappingURL` |
| `nosources-*` | "SourceMap 中不包含源码内容" | 不写 `sourcesContent`，只留映射结构 |
| `cheap-*` | "只映射源码行，列信息被丢弃或不予生成" | **无法在行中间下断点** |
| `module-*` | "消费并处理 loader 提供的 SourceMap" | 能映射回**原始源码**；没有它则只能看到 loader 转译后的代码 |

**`cheap-*` 有一条硬冲突（官方原文）**：

> **与压缩无法组合**，因为压缩器通常只输出单行。

**这条解释了一个很常见的困惑**："开发时断点好好的，生产出问题就定位不到？"—— 因为 `cheap-*` 的"只映射行"前提是"一行大致对应一段源码"，而压缩后整个文件就是**一行**。

官方给的质量维度分五级：`bundled code`（无支持）→ `generated code` → `transformed code` → `original source` → `without source content`。

**推荐组合**（官方分别标为"ideal for development"与"typically used in production"）：

| 场景 | 官方推荐 | 一句话理由 |
|---|---|---|
| 开发·极速 | `eval` | 重建最快，但**行号显示不正确** |
| **开发·首选** | **`eval-source-map`** | 首次慢、重建快，行号正确，"开发期质量最好的 SourceMap" |
| 开发·折中 | `eval-cheap-module-source-map` | 只到行，但处理 loader 的 map |
| 生产·极速 | **`devtool: false`** | "生产构建追求最大性能的推荐选择" |
| 生产·高质量 | `source-map` | 独立文件 + 引用注释 |
| 生产·仅错误上报 | `hidden-source-map` | 不写引用注释 |

**默认值（官方原文，很重要）**：

> 默认是 `false`。在 `mode: 'development'` 下，JavaScript 默认为 `'eval'`（若开启 `experiments.css`，CSS 为 `'source-map'`），**除非输出的是 module 或 modern-module 库类型，此时保持 `false`**。

这条与第 1 章 §1.4 的默认值表完全吻合 —— **`devtool` 的默认值是 `'eval'` 与 `false`，不是 `eval-cheap-*` 与 `hidden`**。

### `.map` 是怎么被找到的

前面讲的都是"生成什么"，还差一步：**调试器怎么知道去拿那个文件**。

官方对 `source-map` 的描述里有两句关键的话：

> **一个完整的 SourceMap 会作为独立文件发射出来**。它**向 bundle 添加一条引用注释**，好让开发工具知道去哪里找它。

而 `hidden-*` 的定义恰好从反面印证了这一点：

> **不添加对 SourceMap 的引用**。当 SourceMap 不部署但仍需生成（例如用于错误上报）时使用。

**所以"隐藏"隐藏的不是文件，是那行注释。** 两者的关系可以这样摆：

| 配置 | 生成 `.map` | 在产物里写引用注释 |
|---|---|---|
| `source-map` | ✅ | ✅ |
| `hidden-source-map` | ✅ | ❌ |
| `nosources-source-map` | ✅（**不含源码内容**） | ✅ |
| `false`（默认） | ❌ | ❌ |

**这就解释了两件事**：

1. **为什么 `hidden-` 不适合直接部署在 web 服务器上** —— 文件还在，只是没人被自动引导过去；任何人知道路径仍然能取到（官方警告原文："你**不应把 Source Map 文件部署到 web 服务器**"）。
2. **为什么 `nosources-` 是"可对外"的那一档** —— 它保留了映射结构但**不写 `sourcesContent`**，所以拿到的映射指不回原码内容。官方对它的定性是"仍然暴露文件名与结构，可用于反编译，但不暴露原始代码"。

**一条本书的补充说明（该页未展开）**：**Source Map 不改变运行结果。** 它是给调试器看的一条旁路信息 —— 产物该跑多快还是多快，代价只是浏览器**多下载一个文件**（并且在 devtools 打开时才会去取）。

**⚠️ 一处如实标注**：Source Map 的**文件格式本身**（映射表的编码方式等）由一套独立规范定义，**不在本次核验的 Webpack / Vite 页面范围内**，本章因此**不展开格式细节**。另有说法称可通过 HTTP 响应头替代引用注释，**本次未核验，标为【待验证】**。

### 生产 Sourcemap 的三条安全警告（官方原文）

| 取值 | 官方警告 |
|---|---|
| `source-map` | ⚠️ "你应当**配置服务器禁止普通用户访问 Source Map 文件**！" |
| `hidden-source-map` | ⚠️ "你**不应把 Source Map 文件部署到 web 服务器**。只把它用于错误上报工具。" |
| `nosources-source-map` | ⚠️ "它仍然暴露文件名与结构，可用于反编译，但不暴露原始代码。" |

**这三条的性质是"安全边界"，不是"最佳实践建议"。** `hidden-` 的"隐藏"只是**不写引用注释**，文件本身还在产物目录里 —— 如果部署时一起传上去，任何人都能打开。

### 两条互斥与一条连带

**① `devtool` 与插件互斥**（官方 tip 原文）：

> **绝不要同时使用 `devtool` 选项和插件**。`devtool` 选项内部会添加该插件，**结果就是插件被应用两次**。

对应关系是：`EvalSourceMapDevToolPlugin` ↔ `eval-*` 系；`SourceMapDevToolPlugin` ↔ 其余系。

**② 自定义压缩器必须开 `sourceMap: true`**（官方 tip 原文）：

> 如果默认的 webpack 压缩器被覆盖（例如为了定制 `minimizer-webpack-plugin` 的选项），**务必为替代品配置 `sourceMap: true`** 以启用 SourceMap 支持。

**漏了这一步的症状是**：`devtool` 配得好好的，但映射链**在压缩那一段断了** —— 报错栈指到压缩后的代码。

**③ Vite 侧**：`build.sourcemap` 默认 `false`，取值 `true` / `'inline'` / `'hidden'`，语义与 webpack 的对应项一致（`'hidden'` "类似 `true`，但打包文件中不保留 sourcemap 注释"）。

### Hash：为什么必须是内容 hash

第 1 章 §1.4 的默认值表里有一行直接管这件事：`optimization.chunkIds` 在 `development` 是 `'named'`、`production` 是 **`'deterministic'`**、`none` 是 `'natural'`。

`deterministic` 的意义是**稳定的确定性短标识** —— 内容没变，标识就不变；而 `natural` 是自然递增序号，**增删模块会让后面所有序号漂移**。

**这决定了长缓存的成败**：

```
文件名带内容 hash + 内容不变 → hash 不变 → 浏览器命中强缓存
文件名带序号          → 增一个模块就全体改名 → 强缓存全部失效
```

**一处诚实的缺口**：Vite 的文件名 hash 占位符（`[hash]` / `[name]` / `[ext]`）**在本次核验的 Vite 页面里没有出现**。Build Options 页只说 `build.manifest` 会生成"未哈希资源文件名到其哈希版本的映射"，并把 `entryFileNames` / `chunkFileNames` / `assetFileNames` 指向 **Rolldown options 文档**。**因此本书不凭印象给占位符清单** —— 需要时请查 Rolldown 文档。

### 内联阈值：一个被普遍高估的选项

Vite 官方对 `build.assetsInlineLimit`：

> 小于此阈值的被导入或被引用的资源会**内联为 base64 URL**，以避免额外的 http 请求。**设为 `0` 可完全关闭内联。**

| 项 | 值 |
|---|---|
| 默认值 | **`4096`（4 KiB）** |
| 关闭方式 | **设为 `0`** |
| 类型 | `number \| (filePath, content) => boolean \| undefined` |

**两处必须纠正的常见说法**：

**① "设成 `false` 可以关闭内联" —— 不对。** 官方只记载了 `0`，且类型定义里**没有 `boolean`**。`false` 不属于该选项的文档化类型。

**② `build.lib` 下这个选项会被忽略 —— 资源始终内联**，不论大小、不论是否为 Git LFS 占位文件。官方另说明 Git LFS 占位文件会自动排除、不参与内联。

**内联的真实代价，值得算一遍**：base64 编码会让体积**涨约三分之一**，而且内联的资源**无法独立缓存** —— 它随宿主文件一起失效。所以阈值不是"越大越好"：

| 阈值偏好 | 好处 | 代价 |
|---|---|---|
| **调大** | 少几个请求（尤其对小图标、字体） | 体积膨胀、失去独立缓存、阻塞宿主资源 |
| **调小 / 设 `0`** | 可独立缓存、体积小 | 请求数增加 |

**而请求数这条约束，在第 1 章 §1.2 里已经被定性为"唯一即使全用最新浏览器也依然存在"的约束** —— 所以这个阈值是在两条真实代价之间做取舍，不是"设为 0 更规范"。

---

## 3.7 实战：产物优化里六个"改了但没用"的现场

> **说明**：构造示例，不是真实项目经历。每一步的成因都能在本章找到对应机制。

### 场景一：加了 `sideEffects: false`，CSS 样式没了

**现象**：组件库打上 `"sideEffects": false` 后，生产环境样式全丢，本地开发正常。

**成因**（§3.4）：`import "./Button.css"` 没有导出、没有引用，在摇树视角里就是"没人用的东西"。而 `sideEffects: false` 等于向打包器声明"整个包没有副作用" —— **包括那个导入本身就是目的 CSS**。

**为什么本地正常**：官方那句"tree shaking 通常只在生产模式下完全生效"。开发模式为了 HMR 与调试保留了模块，所以你**测不到**这个问题。

**修法**：把 CSS 加进白名单 —— `"sideEffects": ["*.css"]`（官方推荐写法，且 `*.css` 会被视作 `**/*.css`）。

### 场景二：拆了包，但主包一点没小

**现象**：按 `splitChunks: { chunks: 'all' }` 配好，主包体积几乎没变。

**排查顺序**：

1. **依赖有没有达到体积阈值？**（§3.5）官方明确：公共依赖**只有满足 webpack 规定的体积阈值**才会被抽出。太小的依赖会被留在原地。
2. **这些依赖真的在多个 chunk 间共享吗？** 只有一个 chunk 用到的东西，不叫"公共依赖"。
3. **摇树生效了吗？** 如果依赖整包被引入（`import _ from 'lodash'`），那问题不在分割，在摇树。

**这一场景的教训**：`splitChunks` 解决的是"**重复**"，不是"**冗余**"。两者都表现为"包大"，但机制完全不同。

### 场景三：`await import('lodash')` 拿到了奇怪的东西

**现象**：`const _ = await import('lodash')` 之后，`_.join` 是 `undefined`。

**成因**（§3.5）：webpack 4 起，导入 CJS 模块时 `import` **不再解析为 `module.exports` 的值**，而是生成一个**人造命名空间对象**。

**修法**：解构 `default` —— `const { default: _ } = await import('lodash')`。

**这一场景的价值在于它暴露了一条跨章因果**：你在 D2 学到的"ESM 与 CJS 互操作"不是纸面语义，它在 D3 的产物里以"多一层 `default`"的形式出现。

### 场景四：生产报错定位不到源码

**现象**：`devtool: 'source-map'` 配了，产物里也有 `.map` 文件，但 Sentry 上的报错栈指向压缩后的代码。

**排查（三条，对应 §3.6 的三个机制点）**：

1. **自定义过压缩器吗？** 如果覆盖了默认 minimizer 而没配 `sourceMap: true`，映射链**在压缩段断开**（官方明写）。
2. **用了 `cheap-*` 吗？** 官方明写它与压缩**无法组合** —— 压缩器只输出单行。
3. **`.map` 真的上传了吗？** 用了 `hidden-source-map` 时官方警告"不应部署到 web 服务器，只用于错误上报工具" —— 也就是说它**必须**被上传到错误上报平台，而不是丢掉。

### 场景五：`target` 设很低，老设备还是白屏

**现象**：把 `build.target` 设成 `es2015`，某批安卓机上仍然白屏。

**成因**（§3.3）：Vite **有硬性下限** —— Chrome ≥ 64 / Firefox ≥ 67 / Safari ≥ 11.1 / Edge ≥ 79，因为它依赖**原生 ESM 动态导入与 `import.meta`**。`target` 只能在这个下限之上做语法降级。

**修法**：低于下限的浏览器只能走 `@vitejs/plugin-legacy`（条件加载 legacy chunks）。而在决定做这件事之前，先用 browserslist 的 `not fully supports es6-module` 查一次**到底还剩多少受众**。

### 场景六：开发能断点，生产 `console` 还在

**现象**：以为开了 production 就会删 `console`，结果全在。

**成因**（第 1 章 §1.4 已讲，这里补上 D3 侧的修法）：`mode` **从不承诺**删 console。要删得配压缩器选项。

**修法**：按当前默认压缩器来配 —— Vite 8 默认是 **Oxc Minifier**，不是 Terser；照抄 Terser 的 `drop_console` 配置可能**连选项名都不对**。**这一条是"默认值换人"带来的真实迁移成本。**

### 反过来看：本章机制该放进团队文档的哪几句

| 现象 | 先查什么 | 对应机制 |
|---|---|---|
| 生产丢样式 | CSS 在不在 `sideEffects` 白名单里 | §3.4 子树剪枝 |
| 标了 `sideEffects` 还被丢 | 它的父模块是不是被判成 `exclude` | §3.4 子树级 |
| 摇树没效果 | 转译器有没有把 ESM 转成 CJS | §3.2 `modules: 'auto'` |
| 老浏览器崩但语法明明降级了 | 缺的是语法还是 API | §3.2 语法 vs API |
| `corejs` 忘了写 | 默认 `"3.0"` 补不上新 API，且**不报错** | §3.2 |
| `target` 设低了还白屏 | Vite 的硬性下限 | §3.3 |
| 要不要打 legacy 产物 | `not fully supports es6-module` 的受众 | §3.3 |
| `splitChunks` 没效果 | 体积阈值 | §3.5 |
| `import()` 结果不对 | 有没有解构 `default` | §3.5 |
| 改了 `manualChunks` 没反应 | Vite 8 已改为 `codeSplitting` | §3.5 |
| 生产断点定位不到 | 自定义压缩器有没有开 `sourceMap`；是否用了 `cheap-*` | §3.6 |
| `.map` 会不会泄漏源码 | 三条生产安全警告 | §3.6 |
| 内联阈值调多少 | 请求数 vs 独立缓存的取舍 | §3.6 |

---

## 3.8 动手

**每一项都要求说出理由**：

| 任务 | 验收 |
|---|---|
| 跑 `npx browserslist`（或在 `browsersl.ist` 输入），分别查 `defaults` 与 `> 0.5%, last 2 versions, Firefox ESR, not dead` | 说出两者是否等价，依据是官网哪句话 |
| 写 `> 0.5% or not last 2 versions` 与 `> 0.5% and not last 2 versions` 各查一次 | 说出结果为何相同，并给出官网对这条陷阱的原文 |
| 把 `not dead` 去掉，查一次 | 说出多出哪些浏览器（对照官网明列的 dead 清单） |
| 查一次 `not fully supports es6-module` | 说出还剩哪些浏览器、覆盖多少受众 —— 这是"要不要做差异化产物"的判据 |
| 把 `?.` 与 `Promise.allSettled` 同时写进一个文件，`target` 设 `es2015` 后构建 | 说出产物里哪个变了、哪个没变，并解释"语法 vs API"的分界 |
| 查一次你项目的 Babel 主版本，确认 `useBuiltIns` 是否还存在 | 说出 Babel 8 的替代方案是什么（官方给的是哪个插件） |
| 不写 `corejs` 选项，构造一个依赖较新 API 的用例 | 说出为什么它补不上、以及为什么不报错 |
| 给某文件加一行 `import "./x.css"`，然后把包的 `sideEffects` 设为 `false` | 记录生产构建结果，说出官方为什么要求把 CSS 加进白名单 |
| 在 dev 下开 `optimization.usedExports: true`，查看未被使用的导出 | 说出它为什么**还在产物里**、删除由谁完成 |
| 同上，再切到 `production` 对比 | 说出变化，并指出 `ModuleConcatenationPlugin` 的作用 |
| 把一个函数用 `/*#__NO_SIDE_EFFECTS__ */` 标注，在另一个模块里调用且不用返回值 | 说出 webpack 5.108.0 起它能否跨模块生效 |
| 用 `await import('lodash')` 与 `const { default: _ } = await import('lodash')` 各写一次 | 说出差别，以及"人造命名空间对象"这个说法的来源 |
| 配 `splitChunks: { chunks: 'all' }`，但只让一个小依赖被两个 chunk 共享 | 说出它为什么没被抽出 |
| 在 Vite 里把 `build.rollupOptions.output.manualChunks` 改成新写法 | 说出新入口是什么、旧写法被官方称为什么 |
| 分别用 `devtool: 'eval-cheap-module-source-map'` 与 `'source-map'` 构建生产产物 | 说出前者为何在压缩后失去意义 |
| 覆盖默认压缩器但不配 `sourceMap: true`，再构建 | 记录现象，说出映射链断在哪一段 |
| 把 `build.assetsInlineLimit` 依次设为 `4096` / `0`，对比产物 | 说出两种设置的取舍；再说明 `false` 为什么不是文档化的关闭方式 |

**进阶挑战**（任选一项）：

1. 用一个真实项目，把 `not fully supports es6-module` 的受众算出来，然后写一份**不超过一页的决策记录**：做不做 legacy 产物、依据是什么、不做的话对那批用户承诺什么。要求每个数字都能被命令复现。
2. 构造一个"摇树静默失效"的最小复现：让 `@babel/preset-env` 的 `modules` 把 ESM 转成 CJS，对比产物体积，并说明为什么**没有任何报错**。
3. 把本章五个决策点画成一条流水线，在每个节点标注"如果这一步被跳过/配错，会在产物里留下什么可观测证据"。这张表的价值在于：**让"产物异常"能反查到具体的决策点**。

---

## 3.9 本章常见误区

| # | 误区 | 纠正 |
|---|---|---|
| 1 | "`target` 设低了就等于支持老浏览器" | 只承诺**语法**。Vite 官方明说"只处理语法转换，不覆盖 polyfill" |
| 2 | "`target` 可以设成 `es5`" | **不能**。Vite 硬性下限是 Chrome ≥64 / Fx ≥67 / Safari ≥11.1 / Edge ≥79（依赖原生 ESM 动态导入与 `import.meta`） |
| 3 | "`useBuiltIns: 'usage'` 是当前最佳实践" | 它是 **Babel 7** 的写法。**Babel 8 已移除 `useBuiltIns` 与 `corejs`**，改用 `babel-plugin-polyfill-corejs3` |
| 4 | "`corejs` 不用写，它会自动取最新" | **默认值是 `"3.0"`**。写得低只会注入低版本有的 polyfill，**且不报错** |
| 5 | "官方说 `usage` 不要用在库上" | 本次核验的 `@babel/preset-env` 页面**没有这条警告**。该页 `usage` 段落只有一句话。这条论据需另找出处 |
| 6 | "`defaults` 是"一切都包含"" | 它等于 **`> 0.5%, last 2 versions, Firefox ESR, not dead`** 四项并集 |
| 7 | "`not dead` 只排除 IE" | 官网明列的 dead 清单有**七项**：IE 11 / IE Mobile 11 / BlackBerry 10·7 / Samsung 4 / Opera Mobile 12.1 / 所有百度浏览器 |
| 8 | "`A or not B` 是并集" | **带 `not` 的查询永远与左侧项按 `and` 结合**，所以 `A or not B`、`A, not B`、`A and not B` **结果相同** |
| 9 | "browserslist 里可以把 `not X` 写在最前面" | 官网 BEWARE：**带 `not` 的查询不能放在列表第一位** |
| 10 | "`sideEffects` 和 `usedExports` 是一回事" | 官方原文：**两件不同的事**。前者能跳过**整个模块与完整子树**，后者不能跳子树 |
| 11 | "`splitChunks` 能把所有重复依赖抽出来" | 官方限定：**只有满足体积阈值的**公共依赖才会被抽出 |
| 12 | "标了 `sideEffects: false` 只会删 JS" | 它会让**仅为副作用而导入的 CSS** 被丢掉。官方要求把 CSS 加进白名单 |
| 13 | "某个文件标了 `sideEffects` 就一定保留" | 若它的父模块被判成 **`exclude`**，整棵子树被剪掉，**下游标记不再生效** |
| 14 | "摇树在生产模式会自动生效，不用管" | 前提是 ESM 没被转成 CJS。官方把"转译器把 ESM 转成 CJS"列为**陷阱第 2 条** |
| 15 | "`import()` 的结果就是模块导出" | webpack 4 起，CJS 模块会得到**人造命名空间对象**，必须解构 `default` |
| 16 | "入口点多配几个就能代码分割" | 官方列了两条坑：模块会被**同时打进多个 bundle**；**无法随核心逻辑动态切分** |
| 17 | "Vite 里改 `output.manualChunks` 就行" | Vite 8 的 chunk 配置入口已改为 **`build.rolldownOptions.output.codeSplitting`** |
| 18 | "`build.rollupOptions` 还是正式选项" | 官方原文：它是 **`build.rolldownOptions` 的别名**，已废弃 |
| 19 | "`preload` 和 `prefetch` 差不多，随便用" | 官方警告：**错误使用 `webpackPreload` 会损害性能**。`preload` 抢当前导航的带宽 |
| 20 | "`devtool` 默认是 `eval-cheap-module-source-map`" | 官方原文：**默认 `false`**；`mode: 'development'` 下 JS 默认 **`'eval'`** |
| 21 | "`cheap-*` 还能用，只是少点信息" | 它与**压缩不兼容**（压缩器只输出单行）。官方明写"组合是不可能的" |
| 22 | "`devtool` 和 `SourceMapDevToolPlugin` 一起用在哪儿都能补" | 官方 tip：**绝不能同时使用**，`devtool` 内部已挂该插件，会**应用两次** |
| 23 | "换了压缩器，Sourcemap 会自动跟着好" | 自定义 minimizer **必须显式配 `sourceMap: true`**，否则映射链在压缩段断开 |
| 24 | "`hidden-source-map` 就不会泄漏源码了" | 它只是**不写引用注释**，`.map` 文件仍在产物里。官方警告**不应部署到 web 服务器** |
| 25 | "Vite 现在默认还是用 Terser 压缩" | 客户端默认 **`'oxc'`**（官方称比 terser 快 30~90 倍、压缩率差 0.5~2%）；`'esbuild'` 已废弃；SSR 默认 `false` |
| 26 | "用 `assetsInlineLimit: false` 可以关闭内联" | 官方只记载 **`0`**，类型定义里**没有 `boolean`**。`false` 不属于文档化类型 |
| 27 | "`assetsInlineLimit` 对所有构建都生效" | `build.lib` 下它被**忽略**，资源**始终内联** |
| 28 | "内联越多越好，能少发请求" | base64 让体积**涨约三分之一**，且内联资源**无法独立缓存**。这是取舍不是规范 |
| 29 | "差异化产物会让用户下载两份" | `nomodule` 机制下浏览器**只执行一份**。代价是**双倍存储与构建时间**，不是双倍下载 |

---

## 待回链

| 位置 | 依赖节点 | 内容 |
|---|---|---|
| §3.2 转译器与类型检查分离 | `D2.L2.09` | 检查与产出分离的完整机制（已在 D2 第 3 章 §3.3，本处仅引用） |
| §3.6 Hash 与长缓存 | `D3.L4.07` | Hash 稳定性的完整治理（第 8 章） |
| §3.3 差异化产物的部署一致性 | `D6.L4.02` `D6.L3.03` | build once, deploy many 与 HTML 缓存策略 —— **✅ 已闭合，D6 第 1 章 §1.2 / §1.4 + 第 3 章 §3.1** |
| §3.6 `.map` 上传与错误上报 | `D6.L3.04` | Source Map 的线上还原与可观测性 —— **✅ 已闭合，D6 第 4 章 §4.2–§4.3**（并确认 `sourcemap` HTTP 头**优先于**注释，见 ECMA-426 §11.1） |
| §3.5 Rolldown 的 chunk 与命名细节 | `D3.L3.11` | Turbopack 与 Rolldown 的架构与配置面（第 6 章） |
| §3.3 现代/传统双构建的工具对比 | `D3.L3.12` | 成熟度矩阵与投入建议（第 6 章） |

---

> **本章的来源与标注**：本章内容取自原书 §2.4（Tree Shaking）、§2.5（代码分割）、§2.7（Sourcemap / 压缩 / Hash / 内联阈值）与 §4.2 的转译器部分，**逐节改写并大幅补深**，整章为【补充背景】。`D3.L2.07`（差异化产物）为地图新增节点，无课程来源。
>
> **本章核验纠正的五处过时表述**：① **Babel 8 已移除 `useBuiltIns` / `corejs` / `bugfixes`**，"`useBuiltIns: 'usage'` 是最佳实践"属 Babel 7 语境；② **Vite 的 chunk 配置入口改为 `build.rolldownOptions.output.codeSplitting`**，`output.manualChunks` 不再适用；③ **`build.rollupOptions` 已降为 `build.rolldownOptions` 的废弃别名**；④ **`assetsInlineLimit` 的关闭方式是 `0` 而非 `false`**（后者不在文档化类型里）；⑤ **Vite 客户端默认压缩器是 Oxc 而非 Terser**，`'esbuild'` 已废弃。
>
> 凡涉版本号者均为**核验日期 2026-10-17 的抓取结果**；凡官方页面未给出的结论（Vite 的 hash 占位符、`nomodule` 的具体实现、browserslist 配置文件优先级与 CLI 命令），本章均已标注为"页面未覆盖"或"本书的补充"。

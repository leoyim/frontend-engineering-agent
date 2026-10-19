# D3 第 4 章 · 依赖图、产物与扩展点

> **本章定位**：D3 领域第 4 章。前三章讲"产物算成什么样"，本章回到**上游**：构建器的**世界模型**是什么（依赖图），这张图怎么变成文件（chunk 与 asset），以及**你能在哪些点上干预它**（loader 与 plugin）。整章为【补充背景】。
>
> **对应地图节点**：`D3.L3.01`（依赖图：构建器的世界模型）· `D3.L3.02`（入口与输出：从图到 chunk 到文件）· `D3.L3.03`（Loader 与 Plugin：单文件转换与全流程干预）· `D3.L3.06`（插件生态对比：一套概念还是两套）
>
> **前置**：`D3.L2.01`（构建的三段）· `D2.L2.01`（ESM 与 CJS 的机制分野 —— 它决定"图能不能建"）。
>
> **规范引用约定**：**构建工具没有标准化组织规范**。本章按**官方文档页名**引用，并标注核验日期当日抓到的版本（核验日期 2026-10-17：**Webpack v5**（Concepts / Loaders / Plugins / Under The Hood 四页）· **Vite v8.3.4**（Plugin API 页））。凡官方页面**未给出**的结论，明确标注为"页面未覆盖"或"本书的补充"。
>
> **读完能做到**：用"从入口可达的子图"解释为什么未引入的文件不会进产物；说清 `initial` 与 `non-initial` chunk 的区别，以及为什么产物里会出现 `394.js` 这种文件名；说出 loader 链为什么必须从右到左执行；解释为什么插件改产物必须用 `processAssets` 而不是 `emit`；说清 webpack 与 Vite 在扩展模型上是"两套概念"还是"一套"。

---

## 4.1 四个词，一条链

先给全章的数据模型。Webpack 官方 "Under The Hood" 把它讲成一条链，本章整章都建立在这条链上：

```
文件  ──→  Module
             │  互相引用，形成 ModuleGraph
             ↓  打包时「modules are combined into chunks」
           Chunk  ──→  ChunkGroup
             │  一个入口 = 一个 chunk group，默认含一个 chunk
             ↓  「Each chunk has a corresponding asset」
           Asset（输出文件）
```

四个词的官方定义（原文）：

| 词 | 官方原文 |
|---|---|
| **Module** | "Every file used in your project is a **Module**"；"By using each other, the modules form a graph (**ModuleGraph**)" |
| **Chunk** | "During the bundling process, **modules are combined into chunks**"；"Chunks combine into **chunk groups** and form a graph (**ChunkGraph**)" |
| **ChunkGroup** | "When you describe an entry point - under the hood, you create a **chunk group with one chunk**" |
| **Asset** | "The **assets** are the output files - **the result of bundling**" |

### 一处必须纠正的用词

**"bundle" 不是 webpack 的官方名词。** 该页**从未**把 bundle 定义为一个名词性产物，它只使用动名词 *bundling*（打包过程）："The **bundling** is a function that takes some files and emits others."

最终产物官方叫 **asset / output file**。`bundle` 更接近社区口语。

**这条不是抠字眼**：后面 §4.3 讲"一个 chunk 对应一个文件"，用的正是官方那句 **"Each chunk has a corresponding asset"** —— 如果你按"bundle"去理解，就会以为 chunk 和 bundle 是两回事，从而找不到官方对应用词。

---

## 4.2 依赖图：构建器的世界模型

### 图怎么长出来

官方对 `make` 阶段的描述，是本章最值得逐字读的一段：

> `make` **构建模块图**。每个入口被交给一个 **module factory**，它**把请求解析到一个文件**。然后该模块被构建 —— **它的 loaders 跑过源码**，结果被**解析出依赖**。发现的每个依赖都以同样方式被解析与构建，于是**图向外生长，直到不再触达新东西**。**`finishModules` 是整张图第一次存在的时刻。**

拆成四步：

| 步 | 动作 | 谁做 |
|---|---|---|
| 1 | 把入口请求**解析成文件** | module factory + resolver |
| 2 | 对该文件**跑 loader 链** | loader |
| 3 | 对转换后的结果**解析出依赖** | 解析器（按模块类型） |
| 4 | 对每个依赖**回到第 1 步** | 递归 |

**第 3 步是全部的关键。** 它解释了 D2 那一章为什么是 D3 的前置：**"解析出依赖"这件事，只有静态结构才能做。** `import "./a.js"` 是一条可以被读出来的**边**；`require(someVar)` 是一条**读不出来的边** —— 所以打包器只能保守处理整个模块（`D2.L2.01` §1.3）。

### 最重要的推论：图是"从入口可达"的子图

**图不是"目录里有哪些文件"，而是"从入口出发能走到哪些文件"。**

这一句话能解释三件事：

| 现象 | 用"可达子图"解释 |
|---|---|
| 死代码为什么能被摇掉 | 它**本来就不在图里**（没人 import 它）或它**在图上但导出没人用**（`D3.L2.08` 的 `usedExports`） |
| 为什么动态导入会分出新 chunk | `import()` 是图上一条**新的边**，指向一个**非初始 chunk** |
| 为什么 `import.meta.glob` 会扩大图 | 它把一批文件**批量变成边**（`D3.L2.09` §2.5 的 `eager` 开关就是"这些边是静态还是动态"） |

**推论里还藏着一个反直觉的结论**：把文件放进源码目录**不会**让它进产物，必须有人 import 它。反过来 —— **一旦有人在某个"看起来不该被打包"的位置 import 了它，它就会进产物**。§4.7 场景六就是这个。

### 图的两个性质

**① 有向，且允许有环。**

模块之间互相 import 是合法的（`D2.L2.02` 已讲循环依赖的求值语义）。而在图上，环是**一个真实存在的结构**，不是错误 —— 所以构建器**不会**因为检测到环就失败。

**这一点值得强调**：很多人期待"构建时报循环依赖错误"。构建器**不做这件事**，因为它对这个环没有更好的处置方式 —— 它只能按规范求值（这属于 D2 的语义），不能替你决定"应该改成什么结构"。检测环是**静态分析工具**（如 `madge`、ESLint 的 `import/no-cycle`）的职责，属于 `D1` 领域的 lint 层。

**② 边来自静态解析，所以边有"可信度"差异。**

| 边来源 | 能否进图 | 后果 |
|---|---|---|
| `import "./a.js"` / `export ... from` | 精确 | 摇树可用 |
| `import()`（字面量） | 精确，但**另起 chunk** | 懒加载 |
| `import()`（变量） | **只能按模式推断** | 触达范围可能被高估（`D3.L2.09` 的三条规则就是给这个"推断"划边界） |
| `require(x)`（CJS 动态） | **不可静态判定** | 整个模块被保守纳入 |

**"可信度差异"是本章的一个判断工具**：当你发现产物体积莫名其妙地大，先问"是不是有一条边被**高估**了" —— 常见元凶是变量的 `import()` 和 CJS 的动态 `require`。

---

## 4.3 从图到文件：chunk 是"图的一次切分"

### 两种 chunk

官方对 `seal` 阶段的描述：

> `seal` 把那张图变成输出。**模块被分配到 chunk，chunk 图被优化，id 与 hash 被指派，代码被生成** —— **然后 asset 才存在**。

chunk 有两种（官方原文）：

| 类型 | 官方定义 |
|---|---|
| **initial** | "入口点的主 chunk。这个 chunk 包含**你为某个入口点指定的所有模块及其依赖**" |
| **non-initial** | "**可能被懒加载**的 chunk。它可能在用到动态导入或 `SplitChunksPlugin` 时出现" |

**"可能被懒加载"这个措辞值得注意** —— 它是"may be"，不是"is"。`SplitChunksPlugin` 切出来的 chunk 也可能**不是**懒加载的（它只是被拆出来，仍随入口一起加载）。**"non-initial" 不等于"懒加载"。**

### 一个入口 = 一个 chunk group

官方原文："When you describe an entry point - under the hood, you create a **chunk group with one chunk**."

而 chunk group 里**可以有多个** chunk："There might be more than one chunk in a chunk group. For example `SplitChunksPlugin` **splits a chunk into one or more chunks**."

**这条把"入口"与"文件"的关系讲清了**：你写一个 entry，得到的是一个**组**，不是"一个文件"。组里几个 chunk 由切分策略决定。

### `Each chunk has a corresponding asset` —— 注意方向

官方有这句话，但**方向是单向的**：

> "**Each chunk has a corresponding asset.** The assets are the output files - the result of bundling."

- **正向成立**：每个 chunk 都有对应产物；
- **反向未被断言**：官方**没有**说"每个产物都来自一个 chunk"。

而且该页**完全没有讨论** source map、抽出的 CSS、runtime chunk、`assetModuleFilename` 这些会破坏"1 chunk = 1 文件"直觉的额外产物。

**本书的补充（该页未覆盖）**：实际产物目录里，文件数通常**多于** chunk 数，因为 `.map`、独立抽出的 CSS、`manifest.json` 等都各自成文件。**不要用"chunk 数"去估算"文件数"。**

### 文件名是图结构的可观测投影

官方在该页给出的文件命名规则，值得完整看一遍：

| 规则 | 官方原文 |
|---|---|
| `output.filename` | 管 **initial** chunk 的文件名 |
| `output.chunkFilename` | 管 **non-initial** chunk 的文件名 |
| 两者重叠时 | "In some cases chunks are used initial and non-initial. In those cases **`output.filename` is used**" |
| `[id]` | 得到 `485.js` |
| `[name]` | 得到 `app.js`；"**If a chunk has no name, then its id will be used**" |
| `[contenthash]` | md4 |

以及一条直接解释"神秘文件名"的原文：

> **默认情况下，non-initial chunk 没有名字**，所以会用一个**唯一 ID** 代替名字。

**这就是 `dist/394.js` 的来历。** 它不是"构建器忘了起名"，而是**官方默认**：非初始 chunk 无名 → 落到 id。要给它名字，得主动加 `webpackChunkName` 魔法注释（官方示例：加 `/* webpackChunkName: "app" */` 后产物变成 `app.js`）。

**所以"产物文件名"是一个诊断入口**：

| 你看到的 | 说明 |
|---|---|
| `main.js` | initial chunk，来自默认 entry 名 |
| `394.js`（纯数字） | **non-initial 且无名** —— 动态导入没加 `webpackChunkName` |
| `app.js` | non-initial 但加了 `webpackChunkName` |
| `_app.4f3a1b.js` | 文件名带内容 hash —— 长缓存策略（`D3.L2.10` §2.6） |

---

## 4.4 Loader：单文件转换，链式执行

### 定义里藏着一条约束

官方定义：

> **loader 让 webpack 能处理其他类型的文件**，并把它们**转换为应用可消费、可加入依赖图的合法模块**。

以及一句话概括它的两个属性：

> 1. **`test`** 属性标识哪些文件应被转换。
> 2. **`use`** 属性指明用哪个 loader 做转换。

**"可加入依赖图的合法模块"这几个字是本节的核心。** 它意味着 loader 的**终点产物必须是一种模块类型** —— 官方在链式语义里把这条写清了：

> 链的最后，webpack **期望链尾的 loader 返回与该模块类型匹配的内容**：`javascript/*` 模块要 JavaScript、`css/*` 要 CSS、`json` 要 JSON、`asset/*` 要原始内容。

**所以 loader 不是"随便转换"**：它必须把"非法模块"变成"四种合法类型之一"。这也解释了为什么 `sass-loader` 之后还需要 `css-loader`（或 Native CSS 的 `type: 'css/auto'`）—— 因为 Sass 编译出来的还是 CSS，而 CSS 要进图还得再走一步。

### 链式：从右到左

官方原文，一句话给死：

> **Loaders 从右到左（或从下到上）求值/执行。** 下面的例子里，执行从 `sass-loader` 开始，到 `postcss-loader` 结束。

```js
use: [
  { loader: "postcss-loader" },                            // 最后执行
  { loader: "sass-loader", options: { sourceMap: true } }  // 最先执行
]
```

**为什么是反的？** 因为这是**函数组合**。`postcss(sass(source))` 写起来，自然是最外层的 `postcss` 在前面、最先被调用的 `sass` 在后面。**数组顺序表达的是"嵌套顺序"，不是"执行顺序"。**

**这条最容易在真实配置里写反**，而写反的症状很有特征：

| 写反的后果 | 现象 |
|---|---|
| `sass-loader` 在 `postcss-loader` 之后执行 | PostCSS 拿到的是**未编译的 SCSS**，于是 `autoprefixer` 不生效、变量语法直接报错 |
| 两者顺序对了但缺一环 | `url()` 没被重写、CSS Modules 没生效 |

**排查口诀**：**把 `use` 数组从右往左读一遍，就是数据的流动方向**。如果读出来的流程是"先处理 CSS 再编译 SCSS"，那就是写反了。

### 内联写法与三个前缀

除了配置式（官方推荐），还有内联式：

```js
import * as styles from "postcss-loader!sass-loader!./styles.scss";
```

三个前缀用于**覆盖配置中的 loader**（官方原文）：

| 前缀 | 官方描述 | 效果 |
|---|---|---|
| `!` | "disable all configured **normal** loaders" | 只禁用 `module.rules` 中的普通 loader |
| `!!` | "disable all configured loaders (**preLoaders, loaders, postLoaders**)" | 禁用**全部**已配置 loader |
| `-!` | "disable all configured **preLoaders and loaders** but not postLoaders" | 禁用 pre 与普通，**保留** post |

官方另注：**CLI 方式传 loader 在 webpack v4 可用、v5 已废弃**。

### 一个 2026 年的事实：CSS 不再需要 loader

官方 Concepts 页的这句话很容易被忽略：

> 开箱即用时，webpack 认识 JavaScript、JSON 与 WebAssembly，**并通过默认启用的内建支持（Native CSS / Native HTML）认识 CSS 与 HTML**。

而 Loaders 页把后果写得更直接：**纯 `.css` 已无需 loader**（`experiments.css` / Native CSS 指南）；**预处理器仍需自身 loader**，并配 `type: 'css/auto'` 把产物交给 CSS pipeline。

**这条修正了一个长期以来的默认认知**："webpack 处理 CSS 必须装 `css-loader` + `style-loader`"。**在 webpack 5 的 Native CSS 路径下不需要了。** 但**预处理器仍需 loader**，这一点没变。

### 官方列出的两个易错点

这两条是官方用 **warning** 标出的，都很具体：

1. **规则必须写在 `module.rules` 下，而不是顶层的 `rules`。**
2. **正则不要加引号。** `test: /\.txt$/` 与 `test: '/\.txt$/'` **不一样** —— 后者会被理解成"匹配一个绝对路径为 `.txt` 的单文件"。

**第 2 条的症状是"这条 loader 从来不生效，也不报错"** —— 因为 `'/.txt$/'` 作为一个字符串被当作文件路径，永远匹配不到任何文件。

---

## 4.5 Plugin：全流程干预，靠 hook 定位

### 定义

官方 Anatomy 一节：

> **webpack 插件是一个带有 `apply` 方法的 JavaScript 对象。** 这个 `apply` 方法由 **webpack compiler** 调用，从而**获得访问整个编译生命周期的能力**。

以及一句定位："**Plugins 是 webpack 的骨架。** webpack 本身就建立在你配置里用的同一套插件系统之上。"

loader 与 plugin 的分工，官方在 Plugins 页只有一句话：

> 它们也承担**做任何 loader 做不了的事**这个目的。

**这句话虽然短，但边界很清楚**：loader 的作用域是"一个文件进来、一个模块出去"；插件的作用域是"整个编译过程"。**任何需要"跨文件"或"跨阶段"信息的动作，loader 做不了。**

### compiler 与 compilation：一条判据

官方在 "Where the hooks live" 里给了一张对照：

| 对象 | 官方描述 |
|---|---|
| **Compiler hooks** | "每次构建一次，围绕整个运行：`run`、`watchRun`、`compile`、`make`、`emit`、`done`" |
| **Compilation hooks** | "在单次构建内部，作用于模块、chunk 与 asset" |

然后是那条**可以直接当判据用**的原文：

> **compiler 比它跑的构建活得久**：watch 模式下，每次重建都是**同一个 Compiler 上的一个新 Compilation**。**需要跨重建存活的状态属于 compiler；关于单次构建的状态属于 compilation。**

**这条判据的实践价值**：写插件时要存一个 Map（比如"哪些文件被转换过"），先问自己"这个 Map 在下次重建后还应该有效吗"？

- 应该有效（比如缓存）→ 挂 compiler；
- 不该有效（本次构建的中间结果）→ 挂 compilation。

**放错的症状是"增量构建后结果不对"**，而且极难查 —— 因为全量构建正常。

### 生命周期与 hook 归属

官方给出的完整阶段序列（摘关键段）：

```text
compiler created → environment → afterEnvironment → entryOption → afterPlugins
  → afterResolvers → initialize
run / watch   → beforeRun → run
compile       → beforeCompile → compile → thisCompilation → compilation
make          → addEntry → resolve → buildModule → succeedModule … → finishMake → finishModules
seal          → seal → optimizeDependencies → beforeChunks → afterChunks → optimize
              → optimizeModules → optimizeChunks → optimizeTree → moduleIds → chunkIds
              → codeGeneration → runtimeRequirements → beforeHash → afterHash
              → processAssets → afterProcessAssets → afterSeal
emit          → afterCompile → shouldEmit → emit → assetEmitted → afterEmit
done          → done → afterDone
```

而 hook 的归属规则（官方原文）：**"compiler hooks 标记阶段本身，compilation hooks 覆盖 `make` 与 `seal` 内部的一切。"**

**这句话解释了一个结构性事实**：`make` 和 `seal` 是**内部步骤最多**的两个阶段，所以它们的 hook 全在 compilation 上，而不是 compiler 上。**你写插件时 hook 挂错对象，代码根本不报错 —— 它只是永远不被调用。**

### 本章最硬的一条规则：改产物要用 `processAssets`，不是 `emit`

官方用**警告**的语气写了这一段，值得完整引用：

> **从 compiler 的 `emit` hook 里发射文件的插件是一个常见错误**，webpack 会把它报告为**已废弃**。`emit` 在 **compilation 已经封口之后**才运行，所以那个文件会**跳过本该对它做的每一个阶段** —— 压缩、压缩后处理、sourcemap、hash，**而且没有其他插件能看到它**。stage 系统的存在，就是为了**让插件自动组合，而不必在配置里手工排序**。

**这段话信息量很大，拆成四层**：

| 层 | 内容 |
|---|---|
| **为什么错** | `emit` 在 `seal` **之后**。而按 §4.3，asset 是 `seal` 阶段才产生的 —— 所以在 `emit` 里写文件等于"绕过整个 seal" |
| **代价 1** | 跳过 minify / compress / sourcemap / hash —— 产物**功能上不完整** |
| **代价 2** | **没人看得见它** —— 其他插件（包括你的分析器）都看不到 |
| **正解** | `compilation.hooks.processAssets` + **匹配工作的 stage** |

官方给的 stage 例子：

- 新增文件 → `PROCESS_ASSETS_STAGE_ADDITIONAL`
- 压缩 → `PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE`

**"自动组合"这四个字是 stage 系统存在的理由**：如果两个插件都要改产物，靠"在配置里谁写前面"来定顺序是脆弱的（用户会重排）；靠 stage 声明"我这一步属于哪个阶段"则是**声明式**的，顺序由 webpack 保证。

### hook 速查表（官方原文）

| 想做什么 | 用哪个 hook |
|---|---|
| 查看或改变请求如何被解析 | `normalModuleFactory` hooks |
| 在模块构建完成后读取它 | `succeedModule` |
| 在**图完整**时行动 | `finishModules` |
| 改变模块如何落进 chunk | `optimizeChunks` |
| **新增 / 修改 / 删除 asset** | `processAssets`（在匹配的 stage） |
| 读取已完成的构建 | `done` |

**这张表按"阶段"排序，其实就是 §4.2–§4.3 的数据链**：解析 → 单模块 → 整图 → chunk → asset → 完成。**沿着数据链找 hook，比背 hook 名可靠。**

### 两个附带的实践要点

**① 用 `compiler.webpack.sources`，不要直接导入 `webpack-sources`。** 官方 tip 的理由是**持久化缓存的版本冲突**。

**② watch 模式的复用语义**（官方 tip 原文）：

> 在 watch 模式下 **compiler 被复用**，而**从 `compile` 往下的一切**会在每次重建时**在一个新的 Compilation 上**重新运行。

**这条把 §4.5 的判据量化了**："从 `compile` 往下"是重建范围 —— 也就是说 `environment` / `afterPlugins` / `afterResolvers` / `initialize` 这些 **compiler 级初始化只跑一次**。

### 一处如实说明

官方 Plugins 概念页**没有出现** `tapable` 一词，也**没有** `SyncHook` / `AsyncSeriesHook` 等 Hook 类名。该页只有 `.tap()` 的调用形式与"compiler / compilation 两类 hook"的概念描述。

**所以本书不在这里给 Hook 类型清单。** 需要时请查 webpack 的 Writing a Plugin 指南与 Tapable 文档。

---

## 4.6 插件生态：webpack 是两套概念，Vite 是一套

`D3.L3.06` 问的是"一套概念还是两套" —— 答案是：**webpack 两套，Vite 一套**。而 Vite 这一套的底层归属，在 2026 年变了。

### Vite 的插件接口扩展的是 **Rolldown**，不是 Rollup

官方 Plugin API 页的开篇第一句就是结论：

> **Vite 插件扩展了 Rolldown 的插件接口**，加了若干 Vite 专有选项。因此，**你可以写一次 Vite 插件，让它同时工作在 dev 与 build 下**。

**三层含义**：

1. **是扩展，不是另起一套** —— 官方建议先读 Rolldown 的插件文档，再读 Vite 这一页；
2. **dev 期复用同一套钩子** —— dev server 创建一个 plugin container，像 Rolldown 一样调用 **Rolldown Build Hooks**；
3. **"写一次，两处生效"是官方承诺** —— 因为"默认情况下，插件在 serve 与 build 下都会被调用"。

**⚠️ 这里有一处版本事实**：**Vite 8 的底层是 Rolldown，不是 Rollup。** 所以旧文档里"Vite 插件兼容 Rollup 插件接口"的说法需要更新为 **Rolldown**。这与前三章的发现是同一条线索（`build.rollupOptions` 已降为 `build.rolldownOptions` 的废弃别名）。

### 但"兼容"有边界

官方在 "Rolldown Plugin Compatibility" 一节写得很克制：

> **相当多的 Rolldown / Rollup 插件会直接**作为 Vite 插件工作（例如 `@rollup/plugin-alias`、`@rollup/plugin-json`），**但不是全部**，因为有些插件钩子在**非打包的 dev server 上下文**里没有意义。

**官方给出三条判据**（满足即可直接复用）：

1. 不使用 **`moduleParsed`** 钩子；
2. 不依赖 **Rolldown 特有选项**（如 `transform.inject`）；
3. **bundle-phase 与 output-phase 的钩子之间没有强耦合**。

**这三条的共同点，是"dev server 是非打包的"**。这一条是 Vite 架构的根基（`D3.L3.05`），而在插件层面它的具体后果是：**打包期才存在的概念，在 dev 期不存在**。

**官方把 dev 期的两个"不调用"明确写了出来**：

| 钩子 | dev 期行为 | 原因（官方） |
|---|---|---|
| `moduleParsed` | **不调用** | Vite 为提升性能**避免全量 AST 解析** |
| Output Generation Hooks | **不调用**（`closeBundle` 除外） | 输出阶段在 dev 期不存在 |

而钩子的调用频次（官方原文）：

| 时机 | 钩子 |
|---|---|
| **仅在 server 启动时调用一次** | `options`、`buildStart` |
| **每次模块请求调用** | `resolveId`、`load`、`transform` |
| **server 关闭时调用** | `buildEnd`、`closeBundle` |

**这张表是排查"插件在 dev 下没反应"的第一站**。如果你的逻辑写在 `buildStart` 里、却期望它对每个文件生效，那它在 dev 下只会跑一次 —— 而 build 下也只会跑一次。**"跑一次"和"跑 N 次"是两种完全不同的钩子。**

**运行时探测**可以这样写（官方示例）：

```js
buildStart() {
  if (this.meta.rolldownVersion) {
    // Rolldown 驱动的 Vite（Vite 8+）
  } else {
    // Rollup 驱动的 Vite
  }
}
```

### `enforce` 管位置，`order` 管顺序 —— 这是两件事

官方对 `enforce` 的表述是**只有两个显式取值**：

> `enforce` 的值可以是 `"pre"` 或 `"post"`。

第三态是**不写**（默认态）。所以准确说是**三个层级状态**：

| 取值 | 位置 |
|---|---|
| `'pre'` | 提前到 **Vite 核心插件之前**（Alias 之后） |
| *（不写）* | 位于 **Vite 核心插件之后、Vite build 插件之前** |
| `'post'` | 延后到 **Vite build 插件之后**，仍早于 Vite 的 post build 插件 |

然后是那句容易混淆的澄清（官方原文）：

> **注意这与钩子的排序是分开的** —— 钩子仍然照常各自受其 `order` 属性约束（Rolldown 钩子的惯例）。

**所以两个旋钮管两件事**：

| 旋钮 | 管什么 | 类比 |
|---|---|---|
| `enforce` | **插件**在解析后数组中的**位置** | 排队时你站第几个 |
| `order` | **同一个钩子**在不同插件间的**调用顺序** | 同一件事由几个人做，谁先做 |

**混用的症状**：想让自己的 `transform` 比某个核心插件先跑，却去写 `enforce: 'post'` —— 结果把自己排到了后面。

### 官方给出的七步顺序

> 解析后的插件顺序如下：

```text
1. Alias
2. 用户插件（enforce: 'pre'）
3. Vite 核心插件
4. 用户插件（没有 enforce 值）
5. Vite build 插件
6. 用户插件（enforce: 'post'）
7. Vite post build 插件（minify、manifest、reporting）
```

**这张表有几个可用的推论**：

- 第 1 位是 **Alias**，所以 `enforce: 'pre'` **也不能**跑在 alias 之前 —— 想影响别名解析得用别的手段；
- 第 7 位是 **minify / manifest / reporting**，所以 `enforce: 'post'` 的插件**还没到最末**，产物压缩仍在你之后；
- 想"在压缩之后看产物" → 需要更靠后的手段（如 `generateBundle` 的合适阶段或 `writeBundle`）。

另有两个细节（官方）：`plugins` 数组里**假值会被忽略**（可用来开关插件）；`plugins` 也接受**预设（preset）** —— 即"返回插件数组的插件"，数组会被**内部展平**。

### `apply`：默认两边都跑

官方原文：

> 默认情况下，插件在 **serve 与 build 下都会被调用**。如果插件需要**有条件地只在 serve 或 build 期间应用**，用 `apply` 属性只在 `'build'` 或 `'serve'` 期间调用它们。

也支持**函数形式**做更精细控制：

```js
apply(config, { command }) {
  // 只在 build 生效，但 SSR 时不生效
  return command === 'build' && !config.build.ssr
}
```

### 仅构建期的插件放哪

官方给了一条等价关系：仅适用于构建阶段的插件，可以放到 **`build.rolldownOptions.plugins`** 下 —— 效果等同于"**Vite 插件 + `enforce: 'post'` + `apply: 'build'`**"。

**这条等价关系本身就是对 §4.6 两节的小结**：位置（`enforce`）与作用域（`apply`）是两个正交的维度，而"放在哪个数组里"只是这两个维度的**一种简写**。

### webpack 与 Vite 的扩展模型对照

| 维度 | **webpack** | **Vite（Rolldown）** |
|---|---|---|
| **扩展点数量** | **两个**：loader + plugin | **一个**：plugin |
| 单文件转换 | **loader**（`module.rules`，按 `test` 命中） | **也是插件**（`transform` 钩子） |
| 全流程干预 | plugin（`apply(compiler)` + `.tap()`） | plugin（具名钩子） |
| 定位靠什么 | **hook 名**（阶段即位置） | **`enforce`（数组位置）+ `order`（钩子顺序）** |
| 改产物的正确入口 | `compilation.hooks.processAssets` + **stage** | `generateBundle` / `writeBundle` |
| dev 与 build | 同一套（dev 走 watch + dev-server） | **同一套**（官方明确 "write once, work for both"） |
| 生态复用 | 仅 webpack 生态 | **可复用 Rolldown / Rollup 插件**（有边界） |

**这就是"一套还是两套"的答案**：

- **webpack 是两套概念**。你要处理 SCSS，得装 `sass-loader`（loader）；你要产出 HTML，得装插件。两种东西的配置位置、参数形式、心智模型都不同。
- **Vite 是一套概念**。转换 SCSS 也是插件（`transform` + `load`），产出 HTML 也是插件（`transformIndexHtml`）。**区别只在钩子，不在概念。**

**这个差异的真实代价**：webpack 的 loader 生态**不能**直接用于 Vite；而 Vite 能直接吃下一部分 Rolldown/Rollup 插件。**这是迁移时最容易低估的一块工作量。**

### 两个实用的附注

**① 虚拟模块的 `\0` 约定**（官方）：`virtual:xxx` → `'\0' + id`；dev 下因为 `\0` 不能出现在 import URL 里，会被编码成 `/@id/__x00__{id}`，**进入插件管道前已解码**，所以插件钩子看不到编码形态。

**② 路径分隔符**（官方）：**Vite 解析 id 时用 POSIX `/`，Rollup 保留 win32 `\`**；官方建议比较前先 `import { normalizePath } from 'vite'`。

**这条在一个只在 Windows 上出现的 bug 里是首要嫌疑**：`id.endsWith('/x.js')` 在 Windows 上可能永远为假。

---

## 4.7 实战：依赖图诊断的六个现场

> **说明**：构造示例，不是真实项目经历。每一步的成因都能在本章找到对应机制。

### 场景一：图有环，能跑，但某个变量是 `undefined`

**现象**：`a.js` 与 `b.js` 互相 import，构建成功、运行不报错，但 `b.js` 里拿到的某个值是 `undefined`。

**成因**（§4.2）：图**允许有环**，构建器不会因此失败。而运行时为什么是 `undefined`，是 `D2.L2.02` 讲的**循环依赖求值顺序**问题 —— 构建成功只说明图建成了，不说明求值顺序符合你的期待。

**诊断纪律**：**构建器不替你做环检测**。要检测环，用静态分析工具（`madge`、`import/no-cycle`），这属于 D1 的 lint 层。

### 场景二：一个依赖被打进了两个 chunk

**现象**：`lodash` 同时出现在 `main.js` 与 `app.js`（动态导入的 chunk）里，总体积翻倍。

**成因**（§4.3）：`main` 是 initial chunk，官方定义是"包含你为某个入口点指定的**所有模块及其依赖**"，但**排除**被动态 import 的部分。而 `app` 是 non-initial chunk，它也把 `lodash` 当自己的依赖。**两条路径各自带一份。**

**修法**：`splitChunks`（`D3.L2.09` §2.5）—— 但注意它**有体积阈值前提**，小依赖不会被抽出。

**这个场景的诊断价值**：**重复 = 图上有两条路径通往同一个模块**。所以"一个依赖被打进两处"永远不是"打包器算错了"，而是"图里确实有两条路"。

### 场景三：PostCSS 不生效

**现象**：`autoprefixer` 配好了，产物里却没有前缀；直接跑 PostCSS 则正常。

**成因**（§4.4）：loader 链**从右到左**执行。如果 `use` 数组把 `postcss-loader` 写在 `sass-loader` 右边，PostCSS 拿到的就是**未编译的 SCSS**。

**排查口诀**：**从右往左读一遍 `use` 数组，看这条数据流是否符合"先编译、再处理"**。

### 场景四：插件生成的产物没被压缩

**现象**：写了个插件生成一个 JSON 文件，它在 `dist` 里、内容正确，但**没被 minify**，也没进 hash 命名。

**成因**（§4.5）：插件在 **compiler 的 `emit` 钩子**里写了文件。官方明确把这种做法列为**常见错误并报告为已废弃** —— 因为 `emit` 在 `seal` **之后**，该文件**跳过了每一个本该对它做的阶段**（minify / compress / sourcemap / hash），**而且没有其他插件能看到它**。

**修法**：改用 `compilation.hooks.processAssets`，并按工作性质声明 stage（新增文件用 `PROCESS_ASSETS_STAGE_ADDITIONAL`，压缩用 `PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE`）。

**这个场景是本章最有教育意义的一个**：它说明**"能写出文件"不等于"融入了流水线"**。

### 场景五：插件在 dev 下完全没反应

**现象**：插件在 `build` 下正常，`dev` 下什么都不发生。

**排查（按 §4.6 的顺序）**：

1. **用了 `moduleParsed` 吗？** dev 期**不调用**（Vite 为避免全量 AST 解析）。
2. **逻辑放在 `buildStart` 里、却期望对每个模块生效吗？** 它**只在 server 启动时调用一次**。
3. **依赖了 output-phase 钩子吗？** dev 期**不调用**（`closeBundle` 除外）。
4. **`apply` 是不是被限定了？** 检查是否写了 `apply: 'build'`。

**这四项覆盖了绝大多数"dev 不生效"**，而它们的共同根源都是 §4.6 那句"dev server 是非打包的"。

### 场景六：产物里出现了 `node:fs`

**现象**：浏览器端产物里出现 `require("node:fs")` 或 `node:fs` 的报错。

**成因**（§4.2）：图上多了一条**通往 Node 内建模块的边**。而按"从入口可达"的定义，**只要有一条边碰到它，它就会试图进图**。

**排查方向**：某处 import 的模块在实现里用了 Node API（常见于同构库、日期库、环境检测库）。这条边的**可信度是高的**（它是静态 `import`），所以不是"误判" —— 是**真的引用了**。

**修法**：不是"让打包器忽略"，而是**把这条边从图上切掉**（用浏览器版本的条件导出、或 `resolve.alias` 指向浏览器实现）。完整的同构与边界机制在 **`X2.L3.01`**（SSR / SSG 的工程实现）。**⚠️ 勘误：本章早期版本此处写作 `D4.L4.04`，该节点在地图中不存在**（`D4` 是**样式工程**，仅 13 节点至 `D4.L4.03`）。

### 反过来看：本章机制该放进团队文档的哪几句

| 现象 | 先查什么 | 对应机制 |
|---|---|---|
| 某文件没进产物 | 它有没有被 import（可达性） | §4.2 从入口可达的子图 |
| 产物体积莫名变大 | 有没有边被**高估**（变量 `import()`、CJS 动态 `require`） | §4.2 边的可信度 |
| 同一依赖出现两份 | 图上是不是有两条路径 | §4.3 initial vs non-initial |
| 文件名是纯数字 | non-initial chunk 无名，官方默认用 id | §4.3 命名规则 |
| 文件数比 chunk 数多 | `.map` / 抽出的 CSS / manifest 各自成文件 | §4.3 **单向**对应 |
| PostCSS 不生效 | `use` 数组从右往左读一遍 | §4.4 链式反序 |
| 某 loader 从不生效也不报错 | `test` 的正则是不是加了引号 | §4.4 两个易错点 |
| 装了一堆 CSS loader 但 webpack 5 不再需要 | 是否走 Native CSS 路径 | §4.4 CSS 不需 loader |
| 插件生成的产物没被压缩 | 是不是在 `emit` 里写的 | §4.5 `processAssets` + stage |
| 增量构建结果不对、全量正常 | 状态挂 compiler 还是 compilation | §4.5 存活期判据 |
| 插件 dev 下不生效 | `moduleParsed` / `buildStart` / output 钩子 | §4.6 两个"不调用" |
| 想把插件排到最前 | `enforce: 'pre'` 也排在 Alias 之后 | §4.6 七步顺序 |
| 想让 transform 先跑 | `enforce` 管位置，`order` 管钩子顺序 | §4.6 两个旋钮 |
| 只在 Windows 上出错 | 路径分隔符（POSIX `/` vs win32 `\`） | §4.6 `normalizePath` |

---

## 4.8 动手

**每一项都要求说出理由**：

| 任务 | 验收 |
|---|---|
| 在一个入口里 import 三个文件，其中一个再 import 两个 | 画出 ModuleGraph，标出哪些是节点、哪些是边 |
| 把某个文件从"被 import"改成"只放在目录里" | 说出它为什么从产物里消失，用"从入口可达的子图"解释 |
| 造一个循环依赖（`a → b → a`） | 记录构建是否成功，并区分"构建成功"与"求值顺序正确" |
| 用一个变量做 `import()`，观察产物 | 说出变量 `import()` 的边为什么"只能按模式推断"、触达范围可能被高估 |
| 触发一次动态导入，观察产物文件名 | 说出 `394.js` 这类纯数字文件名的来源（官方哪句话） |
| 给同一个动态导入加 `webpackChunkName` | 说出文件名变化，以及"无名则用 id"的规则 |
| 在 `output.filename` 与 `output.chunkFilename` 都设模板，再让一个 chunk 同时是 initial 与 non-initial | 说出实际用哪一个（官方原文） |
| 把 `sass-loader` 与 `postcss-loader` 的顺序写反 | 记录现象，说出"从右到左"的官方原文 |
| 给某个 `test` 的正则加上引号 | 记录现象，说出它为什么不报错也不生效 |
| 查一次你的 webpack 配置，确认纯 `.css` 是否还需要 loader | 说出 Native CSS 路径下 CSS 的处理方式变了什么 |
| 写一个最小插件，在 `compiler.hooks.done` 里打印耗时 | 说出 `done` 属于 compiler 还是 compilation，依据官方哪句话 |
| 把上一步的插件改成在 `emit` 里 emit 一个文件 | 记录该产物是否被压缩 / 加 hash，用官方警告原文解释 |
| 同上，改到 `processAssets` + `PROCESS_ASSETS_STAGE_ADDITIONAL` | 对比结果，说出 stage 系统为什么能让插件"自动组合" |
| 手写一个在 `buildStart` 里计数的插件，分别在 dev 与 build 下运行 | 说出它为什么只跑一次（官方钩子频次表） |
| 用一个 Rolldown/Rollup 插件直接放进 Vite，观察是否可用 | 用官方三条判据解释结果 |
| 分别设 `enforce: 'pre'` 与不设，打印插件在解析后数组里的位置 | 说出"`enforce` 管位置、`order` 管钩子顺序"的区别 |

**进阶挑战**（任选一项）：

1. 写一个**只做一件事**的 Vite 插件（例如给每个模块注入构建时间），要求它**在 dev 与 build 下都能工作**，并说明你选了哪个钩子、为什么不会踩到官方列的三个"不调用"。
2. 拿一个真实项目的产物目录，**反推它的 chunk 结构**：哪些是 initial、哪些是 non-initial、哪些文件不是 chunk 产物。然后把结论与 `dist` 里的实际文件对照，看你的推断错在哪。
3. 把本章的数据链（Module → Chunk → ChunkGroup → Asset）与 webpack 生命周期（`make` → `seal` → `emit`）画成**一张二维图**：横轴是数据，纵轴是阶段，标出每一步"什么变成了什么"。这张图的价值在于：**任何产物异常都能被定位到"数据链的哪一层、生命周期的哪一段"**。

---

## 4.9 本章常见误区

| # | 误区 | 纠正 |
|---|---|---|
| 1 | "构建器会报循环依赖错误" | **不会**。图允许有环，构建器不检测环。环检测是静态分析工具（lint 层）的职责 |
| 2 | "所有 import 都同样可靠" | 边的**可信度不同**：字面量 `import` 精确；变量 `import()` 只能按模式推断；CJS 动态 `require` 不可判定 |
| 3 | "`bundle` 是 webpack 的官方名词" | **不是**。Under The Hood 页只使用动名词 *bundling*，最终产物官方叫 **asset / output file** |
| 4 | "产物文件名是纯数字，是构建器起名失败" | **官方默认**：non-initial chunk 默认**没有名字**，所以用唯一 ID 代替 |
| 5 | "`output.filename` 管所有 chunk" | 它管 **initial**；non-initial 归 `output.chunkFilename`；两者重叠时用 `output.filename` |
| 6 | "loader 从左到右执行" | **从右到左（或从下到上）**。数组顺序表达的是**嵌套顺序**，不是执行顺序 |
| 7 | "loader 可以随意转换格式" | 链尾必须返回**匹配模块类型**的内容（`javascript/*` / `css/*` / `json` / `asset/*`） |
| 8 | "webpack 处理 CSS 必须装 `css-loader` + `style-loader`" | webpack 5 的 **Native CSS** 路径下纯 `.css` 不需要 loader；**预处理器仍需 loader** |
| 9 | "`test: '/\\.txt$/'` 与 `test: /\\.txt$/` 差不多" | **不一样**。前者是字符串，会被理解为"绝对路径为 `.txt` 的单文件"，永远匹配不到 |
| 10 | "loader 能做跨文件的事" | 不能。loader 的作用域是"一个文件进、一个模块出"。跨文件/跨阶段必须用插件 |
| 11 | "插件就是会自动跑的函数" | 插件是**带 `apply` 方法的对象**，由 compiler 调用 `apply` 才拿到生命周期访问权 |
| 12 | "插件状态挂哪都行" | 官方判据：**要跨重建保留的挂 compiler，单次构建的挂 compilation**。放错的症状是"增量构建结果不对、全量正常" |
| 13 | "在 `emit` 里写产物文件就行" | 官方把它列为**常见错误并报告为已废弃**。`emit` 在 `seal` 之后，产物会**跳过 minify / compress / sourcemap / hash**，且**没人看得见** |
| 14 | "插件改产物用 `emit` 更快" | 正确入口是 `compilation.hooks.processAssets` + **匹配工作的 stage** |
| 15 | "插件顺序靠配置里谁写前面" | 靠 **stage 声明**自动组合。"stage 系统的存在，就是为了让插件不必在配置里手工排序" |
| 16 | "Vite 插件接口扩展的是 Rollup" | **Vite 8 起是 Rolldown**。官方原文："Vite plugins extends **Rolldown's** plugin interface" |
| 17 | "所有 Rollup/Rolldown 插件都能直接用于 Vite" | 官方原文："相当多的……**但不是全部**"。因为有些钩子在**非打包的 dev server** 里没有意义 |
| 18 | "`moduleParsed` 在 dev 下也会调用" | **dev 期不调用**。Vite 为避免全量 AST 解析而刻意不调 |
| 19 | "`buildStart` 会对每个文件调用" | 它**只在 server 启动时调用一次**。按文件生效要用 `resolveId` / `load` / `transform` |
| 20 | "`enforce: 'post'` 就能排到最后" | **不能**。第 7 位是 Vite 的 **post build 插件**（minify / manifest / reporting），你排在它之前 |
| 21 | "`enforce: 'pre'` 能跑在 alias 之前" | **不能**。解析后顺序第 1 位是 **Alias** |
| 22 | "`enforce` 有三个值" | 官方原文只有 **`"pre"` 与 `"post"`** 两个显式取值，第三态是**不写** |
| 23 | "Vite 插件要分别写 dev 版和 build 版" | 官方承诺 "**write once, work for both**"。默认在 serve 与 build 下都调用 |
| 24 | "webpack 与 Vite 的扩展模型是同一套" | **webpack 是两套**（loader + plugin），**Vite 是一套**（转换也是插件）。所以 webpack 的 loader 生态**不能**直接用于 Vite |
| 25 | "路径比较用 `endsWith('/x.js')` 就行" | Vite 用 POSIX `/`，Rollup 保留 win32 `\`。应先用 `normalizePath` |
| 26 | "虚拟模块的 id 就是 `virtual:xxx`" | 按约定是 **`'\0' + id`**；dev 下会被编码成 `/@id/__x00__{id}`，**插件钩子看到的是解码后的形态** |
| 27 | "`tapable` / `SyncHook` 这些在 webpack 概念页有定义" | 本次核验的 Plugins 概念页**没有出现** `tapable`，也没有任何 Hook 类名。需查 Writing a Plugin 与 Tapable 文档 |
| 28 | "watch 模式会重建整个 compiler" | **compiler 被复用**；"从 `compile` 往下的一切"在新 Compilation 上重跑 |

---

## 待回链

| 位置 | 依赖节点 | 内容 |
|---|---|---|
| §4.2 循环依赖的求值语义 | `D2.L2.02` | 环境记录与求值顺序（已在 D2 第 2 章，本处仅引用） |
| §4.2 CJS 动态 `require` 为何不可静态判定 | `D2.L2.01` | ESM 与 CJS 的机制分野（已在 D2 第 1 章） |
| §4.5 插件 hook 与 Tapable 的完整机制 | `D3.L3.11` | Turbopack 与 Rolldown 的架构（第 6 章） |
| §4.6 Vite 的"非打包 dev server"为什么能成立 | `D3.L3.05` | 架构分野：打包式构建 vs 原生 ESM（第 5 章） |
| §4.6 插件生态的迁移成本 | `D3.L3.12` | 成熟度矩阵与投入建议（第 6 章） |
| §4.7 场景六的边界处理 | `X2.L3.01` | 同构与边界 —— **✅ 已闭合，X2 第 2 章 §2.2–§2.3**（`window` 未定义的**求值时机**、hydration mismatch 的**官方四项成因**）。**⚠️ 勘误**：早期误写为 `D4.L4.04`，该节点不存在 |

---

> **本章的来源与标注**：本章内容主要取自原书 §2.1（依赖图）、§2.2（入口与输出）、§2.3（Loader 与 Plugin）、§3.5（插件生态对比），**逐节改写并大幅补深**，整章为【补充背景】。
>
> **本章核验纠正的三处表述**：① **Vite 插件接口扩展的是 Rolldown，不是 Rollup**（Vite 8 起；官方原文 "Vite plugins extends Rolldown's plugin interface"）；② **`bundle` 不是 webpack 官方名词** —— Under The Hood 页只使用动名词 *bundling*，最终产物官方叫 **asset**；③ **webpack 5 的 Native CSS / Native HTML 让纯 `.css` 不再需要 loader**（"webpack 处理 CSS 必须装 `css-loader` + `style-loader`"是旧说法的过度泛化）。
>
> 凡涉版本者均为**核验日期 2026-10-17 的抓取结果**；凡官方页面未给出的结论（tapable 与 Hook 类型清单、`output.filename` 的完整占位符表、chunk 与文件的严格反向对应、compiler / compilation 的形式化定义），本章均已标注为"页面未覆盖"。

# D3 第 1 章 · 从源码到产物：构建在做什么

> **本章定位**：D3 领域第 1 章，也是整条构建链路的入口。**标注说明：本章内容由原书第 1 章 §1.2、§1.4 迁移并改写而来，按 `MIGRATION_PLAN.md` 的 a2 决策整章标注为【补充背景】**（原标注为【已学】，因改写后与课程原文不再逐句对应，已统一降级 —— 见 `METADATA.md` 的标注约定修订说明与 `notes/compilation-log.md` 的逐章记录）。
>
> **对应地图节点**：`D3.L1.01`（为什么需要构建）· `D3.L2.01`（构建工具究竟做了什么）· `D3.L1.02`（跑通第一个项目）· `D3.L2.02`（开发构建与生产构建）
>
> **前置**：`D0.L1.34`（为什么需要工程化）· `D0.L1.31`（`npm init` / `install` / `run` 与 `package.json`）· `D2.L2.01`（模块规范：ESM 与 CJS 的机制分野）。
>
> **规范引用约定**：**构建工具没有标准化组织规范** —— Vite、Webpack、Rollup、Rolldown、esbuild 的定义都来自各自官方文档。本章按**官方文档页名**引用，并按**核验日期当日抓到的版本**标注（核验日期 2026-10-17：Vite 文档对应 **v8.3.4**，Webpack 对应 **v5**）。
>
> **读完能做到**：说出构建存在的三个约束条件、以及为什么"开发期不打包"是可能的；分清 `dev` / `build` / `preview` 三条命令各自走哪条管线；解释 `mode` 实际做了什么（以及它**不**做什么）；判断一个"build 之后行为变了"的问题该往哪三个方向上查。

---

## 1.1 三个约束：为什么必须有构建

`D2.L2.01` 已经讲过 ESM 与 CJS 的机制分野，这里只取它对本领域最关键的那一条结论：

> **ESM 的 `import` / `export` 是语法层的静态声明，所以依赖图第一次可以在「不运行代码」的前提下被算出来。**

这一条是后面所有优化的地基 —— Tree Shaking 要靠它标记未使用的导出，代码分割要靠它找图的断点，Vite 的按需转换要靠它知道模块之间的引用关系。

**但 ESM 只解决了"依赖可以被静态分析"这一件事，它没有解决三件事：**

| # | 约束 | 为什么 ESM 解决不了 |
|---|---|---|
| 1 | **浏览器只认它认识的东西** | 浏览器只执行 JS。TS、JSX、Sass、Vue SFC 都必须**先转成浏览器认识的形态** |
| 2 | **浏览器版本无法统一** | 原生 ESM 是较新能力；旧浏览器既不认 ESM，也不认新语法 |
| 3 | **请求数量与网络往返** | 一个内部有几百个模块的库（如 `lodash-es`），按原生 ESM 逐个加载就是几百个请求 |

**这三条的交集，就是构建工具的生存空间。** 注意第 3 条 —— 它是唯一一条"即使所有人用最新浏览器也依然存在"的约束，也是下一节要展开的关键判别点。

---

## 1.2 构建工具只做三件事

剥掉所有配置项与插件名，构建工具做的是三件事：

| 环节 | 做什么 | 常见执行者 |
|---|---|---|
| **① 转译（Transform）** | 把浏览器不认的东西变成浏览器认的 | Babel / tsc → esbuild / SWC / Oxc |
| **② 打包（Bundle）** | 沿依赖图把散落的模块合成若干 chunk | Webpack / Rollup / Rspack / Rolldown |
| **③ 优化（Optimize）** | 压缩、混淆、摇树、分割、打 hash | Terser / SWC minify / Oxc + 打包器自身 |

### 关键认知：这三件事不绑定

大多数人对构建工具的印象是"Webpack 或者 Vite"，把它们当成不可分割的整体。实际它们是**一条流水线的三个段位**，而每一段现在都有独立的原生实现可以替换。

这个认知是 D3 第 6 章（新一代工具）能读懂的前提：**原生化不是一个整体运动，而是三段各自被替换**。

### 补深：三段各自的可替换性，已经在一线工具里被验证了

Vite 官方在「Why Vite」页叙述了自己的架构演进，正好是三段替换的实例：

> Vite **最初依赖两个独立的底层工具**：开发期用 **esbuild** 做快速编译，生产构建用 **Rollup** 做彻底的优化。这能工作，但维护两条管线引入了一致性问题……

> **Rolldown 被构建出来把两者统一成单一打包器**：用 Rust 写成以获得原生速度，并兼容生态已经依赖的同一套插件 API。它使用 **Oxc** 做解析、转换与压缩。

也就是说，Vite 早期是 **① esbuild + ②③ Rollup** 的分工，现在统一到了 **Rolldown + Oxc**。

**这里必须纠正一条已经过时的说法**：网上（以及本书原书的部分表述里）常见"Vite 生产构建走 Rollup"。按核验当日的官方文档（v8.3.4），**当前 Vite 的 build 已改用 Rolldown**，Getting Started 页的原话是 "bundles your code with **Rolldown**"。**任何依赖"Vite = Rolldown/Webpack + Rollup"这类组合的判断，都要先确认版本。**

---

## 1.3 跑通第一个项目：从脚手架到产物

这一节是 `D3.L1.02`，目的不是"教你建项目"，而是**建立一个可验证的心智模型**：三条命令各走哪条管线。

### 脚手架

官方命令（Vite 文档 v8.3.4）：

```bash
npm create vite@latest            # 交互式
npm create vite@latest my-app -- --template vue   # 直接指定模板（npm 7+ 需要额外的一对 --）
```

模板覆盖 `vanilla` / `vue` / `react` / `react-compiler` / `preact` / `lit` / `svelte` / `solid` / `qwik` 及各自的 `-ts` 变体。

**环境要求（官方 Compatibility Note）**：Node.js **20.19+ 或 22.12+**（部分模板要求更高）。这条与 D1 第 1 章 §1.4 里 ESLint v10 的 Node 要求属同一类约束 —— **工具链的版本下限比框架本身更硬**。

### 三条命令，三条不同的路径

```json
{
  "scripts": {
    "dev": "vite",            // 启动开发服务器；别名 vite dev / vite serve
    "build": "vite build",    // 生产构建
    "preview": "vite preview" // 本地预览生产构建
  }
}
```

| 命令 | 实际执行 | 走的管线 |
|---|---|---|
| `npm run dev` | `vite` | **开发管线**：不打包，按原生 ESM 按需服务 |
| `npm run build` | `vite build` | **生产管线**：打包、优化、产出静态文件 |
| `npm run preview` | `vite preview` | 起一个静态服务器 **伺服 `build` 的产物** |

**`preview` 为什么必须存在？** 因为 `dev` 与 `build` 是**两条完全不同的管线**（§1.2 已给出证据：一条用原生 ESM 按需转换，一条用打包器整体产出）。所以：

> **只跑过 `npm run dev` 就等于没测过生产产物。**

这是本领域最便宜也最常被忽略的一条纪律。它在后面会以更严重的形式出现 —— `D3.L2.03`（环境变量机制的构建期替换）与 `D3.L3.04`（开发/生产模式差异全景）都会说明：**有些 bug 只在 `build` 之后存在，而 `dev` 永远看不见。**

### 机制点：为什么入口是根目录的 `index.html`

第一次用 Vite 的人几乎都会问："入口不是 `src/main.js` 吗？"官方对此有明确解释：

> 你可能注意到的一件事是，在 Vite 项目里 **`index.html` 位于核心位置**，而不是被塞在 `public` 里。这是刻意的：**开发期 Vite 是一个服务器，而 `index.html` 就是你的应用入口。**

更关键的是后半段机制：

> Vite 把 `index.html` **当作源码**，视为**模块图（module graph）的一部分**，会解析其中 `<script type="module" src="...">` 指向的 JS 源码。连**内联 `<script type="module">`** 和通过 `<link href>` 引用的 CSS 也享有 Vite 的专有特性。

这句话的价值在于它把"入口"从一个**配置项**变成了**图的根节点**：模块图不是从某个 JS 文件开始，而是从 HTML 开始 —— HTML 里的 `<script>` 与 `<link>` 就是图的出边。

两个衍生结论：

1. **`index.html` 里的 URL 会被自动 rebase**，因此不需要 `%PUBLIC_URL%` 这类占位符（这是与 CRA 的差别）；
2. **多页应用天然可行** —— 多个 `.html` 入口就是多个根。

**一处诚实的缺口**：Vite 的 Getting Started 页**没有显式写出产物目录名**（如 `dist`），只说明 build 会"输出高度优化的生产静态资源"，细节指向 Building for Production 一节。若要断言具体目录，应以 `build.outDir` 的默认值为准，不要凭本页推断。

---

## 1.4 开发构建与生产构建：目标冲突，两套策略

这是本章的核心节，也是理解后面所有"为什么 dev 一套、build 另一套"的总开关。

### 核心事实：两个模式的目标是冲突的

| 维度 | 开发模式 | 生产模式 |
|---|---|---|
| **目标** | 构建快、反馈快 | 产物小、加载快 |
| 压缩混淆 | 不做 | 做 |
| Tree Shaking 相关优化 | 大部分关闭 | 全开 |
| Source Map | 只求"能定位到行" | 视策略而定（常常关掉或外置） |
| 代码分割 | 不抽公共包 | 抽 |
| HMR | 启用 | 无 |
| `NODE_ENV` | `development` | `production` |

**一句话概括**：开发模式**愿意牺牲产物质量换速度**；生产模式**愿意牺牲构建时长换产物质量**。

### 补深：`mode` 到底做了什么

上面那张表是**工程实践**的总结。要做到可解释，必须看工具的实现 —— Webpack 的 `mode` 是最清晰的案例。

**先看一句官方原话，它把 `mode` 的性质说透了：**

> **`mode` 本身不执行任何操作** —— 它只是**为其他选项挑选默认值**，而每一个选项你仍然可以显式设置。

这句话消解了一类很常见的误解："我设了 `mode: 'production'`，为什么 console 还在？"—— 因为 `mode` 不是一组行为的开关，**它是一张默认值表**。

**再看它的签名（官方给出）：**

```
'none' | 'development' | 'production' = 'production'
```

**默认值是 `production`。** 也就是说：**一个不写 `mode` 的配置，默认走生产模式的优化路径。** 官方另有一条提示：若配置与 CLI 都没提供 `mode`，**CLI 会使用任何合法的 `NODE_ENV` 值**作为 mode。

**完整的默认值表**（官方「Defaults per mode」表格，16 项，逐项照录）：

| 选项 | `development` | `production` | `none` |
|---|---|---|---|
| `cache` | `{ type: 'memory' }` | `false` | `false` |
| `devtool` | **`'eval'`** | **`false`** | `false` |
| `output.pathinfo` | `true` | `false` | `false` |
| `performance.hints` | `false` | `'warning'` | `false` |
| `optimization.chunkIds` | **`'named'`** | **`'deterministic'`** | `'natural'` |
| `optimization.moduleIds` | **`'named'`** | **`'deterministic'`** | `'natural'` |
| `optimization.nodeEnv` | `'development'` | `'production'` | `false` |
| `optimization.emitOnErrors` | `true` | `false` | `true` |
| `optimization.sideEffects` | **`'flag'`** | `true` | `'flag'` |
| `optimization.usedExports` | `false` | `true` | `false` |
| `optimization.innerGraph` | `false` | `true` | `false` |
| `optimization.mangleExports` | `false` | `true` | `false` |
| `optimization.concatenateModules` | `false` | `true` | `false` |
| `optimization.flagIncludedChunks` | `false` | `true` | `false` |
| `optimization.realContentHash` | `false` | `true` | `false` |
| `optimization.checkWasmTypes` | `false` | `true` | `false` |
| `optimization.minimize` | `false` | `true` | `false` |

**这张表里有四处会推翻常见说法，逐条说：**

**① `devtool` 的默认值是 `'eval'`（dev）与 `false`（prod），不是 `eval-cheap-*` 与 `hidden`。**
`eval-cheap-module-source-map`、`hidden-source-map` 这些是**工程推荐配置**，需要自己写。**"默认值"与"推荐值"是两件事** —— 混在一起讲，会导致读者以为自己配错了，或者以为不用配。

**② 开发模式并非"什么都不做"。** `optimization.sideEffects` 在 `development` 下是 **`'flag'`** —— 意思是**仍然会按 `sideEffects` 字段打标记**，只是不做后续的删除。所以"开发模式完全不启用 Tree Shaking"这个说法不准确：**标记做了，只差最后那一步。**

**③ `chunkIds` / `moduleIds` 的策略随 mode 变。** `development` 用 `'named'`（可读路径名，便于调试）、`production` 用 **`'deterministic'`**（稳定的确定性短标识）、`none` 用 `'natural'`（自然递增序号）。
**这一行直接关系到长缓存**：`deterministic` 是为了让"内容没变时 hash 不变"，而 `natural` 的顺序会因增删模块而漂移。`D3.L4.07`（Hash 稳定性）会专门展开这一点。

**④ `none` 不等于"关闭全部优化"。** 官方明确提示：`mode: 'none'` **只退出上表列出的那批"依赖 mode 的默认值"**；不依赖 mode 的选项（如 `optimization.providedExports`、`optimization.removeEmptyChunks`）**仍保持常规默认值**。

**一处措辞精度**：官方在 `production` 的描述里列的是 **`MinimizerPlugin`**，**该页面并未出现 "TerserPlugin" 这一名称**。Terser 是 Webpack 默认的 minifier，但引用时应说明"页面只说 MinimizerPlugin"。

### 补深：两个模式唯一共享的机制 —— 构建期字面量替换

上面那张表全是"关/开"的差异。**两个模式之间真正共享的机制只有一个，但它极其重要**：`optimization.nodeEnv` 背后的 `DefinePlugin` 会在**编译期**把 `process.env.NODE_ENV` 整体替换成字符串字面量。

机制链条：

```
源码里写 process.env.NODE_ENV === 'development'
        │
        ├─ 编译期：DefinePlugin 把 process.env.NODE_ENV 替换成 "production"
        │          → 变成 "production" === 'development'
        │
        ├─ 压缩期：压缩器识别出这是恒假表达式
        │          → 整个分支被物理删除
        │
        └─ 产物里：这段代码根本不存在，连那个字符串都不一定留下
```

**这条机制解释了三件事：**

1. **为什么 `process.env` 在前端产物里"看起来能用"** —— 它不是运行时的环境变量，而是被**替换**出来的。浏览器里根本没有 `process` 这个对象。
2. **为什么条件代码不占体积** —— 恒假分支被物理删除，而不是"运行时判断后跳过"。
3. **为什么构建期的环境变量与运行时的环境变量不是一回事** —— 前者在编译时就固化了，改了要重新构建。完整机制在 `D3.L2.03`（环境变量机制），本章只埋钩子。

### 两条由此推出的判断纪律

**① 一个"build 之后行为变了"的问题，先往三个方向查：**

| 方向 | 问什么 | 对应机制 |
|---|---|---|
| **语法与目标** | 生产构建的 target 是否比你开发时的浏览器低？ | 转译与降级（`D3.L2.06`） |
| **环境常量** | 代码里有没有依赖 `process.env.*` 的判断？ | 构建期字面量替换 |
| **优化** | 是否涉及副作用、动态引用、反射式访问？ | Tree Shaking 的边界（`D3.L2.08`） |

**② `mode` 不负责删 console。** 官方 `mode` 页没有这个能力 —— 要删 console 得自己配压缩器的 `drop_console` 类选项（属 `D3.L2.10` 的压缩策略）。**"我开了 production 怎么还有 console"这个问题的答案，是"production 从来没承诺过这件事"。**

---

## 1.5 实战：一个项目从 dev 到上线的三次"行为变了"

> **说明**：与 D1 各章同一性质 —— 这是一条**构造示例**，不是某个真实项目的经历。每一步的现象与成因都能在本章找到对应机制。

### 阶段一：本地 `npm run dev` 一切正常，`npm run build` 之后页面白屏

**现象**：控制台报一个语法错误，位置在 `dist/assets/index-xxxx.js` 里，那一行长得完全不像自己写的代码。

**排查路径**（按成本从低到高）：

1. **先跑 `npm run preview`。** 这一步确认"是不是产物本身有问题" —— 有 `preview` 能复现、`dev` 不能复现，问题就一定在**两条管线的差异**上（§1.3）。
2. **看生产构建的 target。** Vite 官方的做法是：生产构建默认目标为 **Baseline Widely Available** 在某个固定日期时的浏览器版本（核验当日这版对应 2023 年中左右的版本），而**开发期的 transform target 设为 `esnext`（不做语法降级）**。
3. **对照报错的那个语法特性**，看它是否在 target 覆盖范围之外。

**成因**：**开发期不降级，生产期降级** —— 这是两条管线的设计差异，不是 bug。白屏往往来自"生产降级后的代码里混进了开发期才有的东西"（比如某个只做了一半的 polyfill）。

**修法**：明确指出要不要降级 —— 要降就统一（`build.target` + 必要时 `@vitejs/plugin-legacy`），不要就明确"这个项目不服务旧浏览器"。

### 阶段二：`build` 之后接口地址变成了 `undefined`

**现象**：本地一切正常，产物里请求打到了 `https://example.com/undefined/api/...`。

**成因**：代码里写的是 `if (process.env.NODE_ENV === 'development') { base = 'http://localhost:3000' }`，而**自定义的那个环境变量没有被构建工具替换**，于是运行时 `process` 不存在 → 取到 `undefined`。

**这里必须分清两件事**：

| | 构建期常量 | 运行时配置 |
|---|---|---|
| 何时确定 | **构建时固化** | 部署/启动时注入 |
| 改了要不要重新构建 | **要** | 不要 |
| 前端能否读到 | 能（被替换成字面量） | 只有被暴露出来的才能 |

**修法**：要么把该变量正确纳入构建期替换（Vite 是 `VITE_` 前缀 + `import.meta.env`，见 `D3.L2.03`），要么改成**运行期注入**（这正是 `D6.L4.02`「build once, deploy many」要解决的问题）。

**这一阶段的真正教训**：**"环境变量"在前端有两套完全不同的机制，而它们长得几乎一样。** 用错的那一套不会报错，只会静默变成 `undefined`。

### 阶段三：CI 构建出来的产物和本地不一样

**现象**：同一份代码，CI 上的产物 hash 不同，行为也偶有差异。

**排查**（三条都对应已验证的机制）：

1. **`mode` 是否被 `NODE_ENV` 悄悄决定了？** 官方提示：若配置与 CLI 都没提供 `mode`，CLI 会用**任何合法的 `NODE_ENV` 值**作为 mode。**CI 上设了 `NODE_ENV=test`，构建就会走一条你没预期的路径**（`test` 不是合法的 mode 值，但 `NODE_ENV` 的存在会让默认行为与本地不同）。
2. **Node 版本是否一致？** Vite 要求 Node **20.19+ 或 22.12+** —— 版本不一致时，脚手架与依赖解析的结果可能不同（呼应 `D0.L1.28` 与 D1 第 1 章 §1.8 的 `.nvmrc`）。
3. **有没有跑过 `preview`？** 没有的话，"本地正常"这个结论本身没有被验证过（§1.3）。

**修法**：显式写死 `mode`（不依赖 `NODE_ENV` 推断）、锁 Node 版本、CI 与本地都跑同一条 `build` + `preview` 冒烟。

### 反过来看：本章的机制该放进团队文档的哪几句

| 现象 | 先查什么 | 对应机制 |
|---|---|---|
| `build` 后白屏，`dev` 正常 | 生产 target 与语法降级；先跑 `preview` 复现 | §1.3 两条管线 / §1.4 target |
| 环境变量成了 `undefined` | 用的是构建期常量还是运行时配置 | §1.4 字面量替换 |
| 开了 production 还有 `console` | `mode` 从不承诺删 console | §1.4 `mode` 只是默认值表 |
| CI 与本地产物不同 | `mode` 是否被 `NODE_ENV` 推断；Node 版本 | §1.4 签名与默认值 |
| 想关掉全部优化 | `mode: 'none'` 只退出**依赖 mode 的那批**默认值 | §1.4 `none` 的边界 |
| 内容没变但 hash 变了 | `chunkIds` / `moduleIds` 是不是 `natural` | §1.4 默认值表第 5、6 行 |
| "Vite 生产构建用 Rollup" | 版本 | §1.2 当前是 Rolldown |

---

## 1.6 动手

**每一项都要求说出理由**：

| 任务 | 验收 |
|---|---|
| 用 `npm create vite@latest` 建一个最小项目，依次跑 `dev` / `build` / `preview` | 说出三条命令各走哪条管线，以及"为什么 `preview` 不能省" |
| 打开产物目录，找出入口 HTML 与它引用的 JS | 说出 `index.html` 在开发期与生产期分别扮演什么角色 |
| 把 `index.html` 从根目录移进 `public/`，再跑 `dev` | 记录现象，说出官方对"为什么 `index.html` 不进 `public`"的原文解释 |
| 在代码里写 `console.log(process.env.NODE_ENV)`，跑 `build` 后在产物里搜 | 说出它在**编译期**被替换成了什么、压缩后还在不在 |
| 同上，但把 `mode` 设成 `none` 再构建 | 说出与 `development` / `production` 的差别，以及 `none` **没有**关掉什么 |
| 在 Webpack 配置里不写 `mode`，跑一次构建 | 说出它默认取了什么、以及"CLI 会用 `NODE_ENV` 作为 mode"这条提示的含义 |
| 把一个配置项在 `mode: 'production'` 下显式设成开发期的值 | 说出为什么可行 —— 引用官方那句"`mode` 本身不执行任何操作" |
| 造一个 `process.env.MY_VAR` 的自定义变量并在生产构建里读它 | 记录结果，说出为什么它是 `undefined`（而不是报错） |
| 对比 `development` 与 `production` 下 `chunkIds` 的取值 | 说出两者对"内容不变时文件名是否不变"的影响 |
| 让 `mode` 为 `development` 时构建一个含 `sideEffects: false` 的依赖 | 说出 `optimization.sideEffects` 在 dev 下是 `'flag'` 意味着什么 |
| 查一次你项目里 Vite 的主版本号，并确认 build 用的是哪个打包器 | 说出"Vite 生产构建走 Rollup"这句话在你这个版本上是否成立 |

**进阶挑战**（任选一项）：

1. 写一个最小的 HTML + 一个 ESM 入口，**完全不用构建工具**，用静态服务器跑起来，再用 Chrome DevTools 的 Network 面板数请求数。然后把同一个项目用 Vite 构建一次再数一次 —— 用这两个数字解释 §1.2 的第 3 条约束（请求数量）。
2. 在 Webpack 里把 `mode` 的 16 项默认值逐项打印出来（`webpack --mode=development` 与 `production` 各一次），与你项目里的实际配置做 diff，找出**哪些差异是你有意设的、哪些是默认值悄悄给的**。
3. 构造一个"只在 `build` 后失败"的用例（提示：用 `import.meta.env` 或 `process.env` 做分支），把它放进 CI 的冒烟流程，并写清为什么 `dev` 测不出它。

---

## 1.7 本章常见误区

| # | 误区 | 纠正 |
|---|---|---|
| 1 | "Webpack 和 Vite 是两个不可分割的整体" | 它们是**一条流水线的不同段位**的组合。Vite 早期是 esbuild + Rollup，现在统一到 Rolldown + Oxc |
| 2 | "Vite 生产构建走 Rollup" | 按核验当日文档（v8.3.4），**build 已用 Rolldown**。这句话要先确认版本 |
| 3 | "`preview` 只是可选的展示工具" | 它是**唯一**能验证 `build` 产物的方式。跳过它，就等于让所有"只在生产出现"的 bug 直通线上 |
| 4 | "Vite 的入口是 `src/main.js`" | 入口是**根目录的 `index.html`**，且它被当作**源码**、是**模块图的一部分** |
| 5 | "`index.html` 应该放进 `public/`" | 官方明确这是刻意的：开发期 Vite 是服务器，`index.html` 就是应用入口 |
| 6 | "不写 `mode` 就没有优化" | 默认是 **`production`**。另有一条提示：未提供 `mode` 时 CLI 会用**任何合法的 `NODE_ENV`** 作为 mode |
| 7 | "开发模式的 `devtool` 默认是 `eval-cheap-module-source-map`" | 官方默认是 **`'eval'`**；生产默认是 **`false`**。你看到的 `eval-cheap-*` / `hidden` 是**工程推荐值**，要自己写 |
| 8 | "开发模式完全不启用 Tree Shaking" | `optimization.sideEffects` 在 dev 下是 **`'flag'`** —— **标记照做，只差删除那一步** |
| 9 | "`mode: 'none'` 会关闭全部优化" | 它**只退出依赖 mode 的那批默认值**；`optimization.providedExports` 等不依赖 mode 的选项仍按常规默认值 |
| 10 | "生产模式的压缩器就叫 TerserPlugin" | Webpack 的 `mode` 页在 production 描述里列的是 **`MinimizerPlugin`**，**未出现 "TerserPlugin"**。Terser 是默认 minifier，但引用时要说清是哪个页面 |
| 11 | "`process.env.NODE_ENV` 是运行时的环境变量" | 它是**构建期被整体替换成字符串字面量**的常量。浏览器里根本没有 `process` |
| 12 | "改环境变量不用重新构建" | 构建期常量在编译时**已固化**。这就是「build once, deploy many」要解决的问题 |
| 13 | "环境变量读不到会报错" | 它通常**静默变成 `undefined`** —— 这是最危险的失败方式，因为请求会真的发出去 |
| 14 | "内容没变，文件名就不该变" | 取决于 `chunkIds` / `moduleIds`：`deterministic` 才稳定，`natural` 会因增删模块而漂移 |
| 15 | "CI 与本地产物不同，一定是缓存问题" | 先查三处：`mode` 是否被 `NODE_ENV` 悄悄决定、Node 版本是否一致、有没有跑过 `preview` |
| 16 | "生产构建的 target 越高越好" | Vite 生产默认目标是 **Baseline Widely Available**（核验当日对应 2023 年中的浏览器），**开发期是不降级的 `esnext`** —— 这个落差正是"build 后白屏"的常见来源 |

---

## 待回链

| 位置 | 依赖节点 | 内容 |
|---|---|---|
| §1.4 环境变量机制的完整展开 | `D3.L2.03` | 构建期替换与 `import.meta.env` / `define` 的机制（第 2 章） |
| §1.4 转译与降级策略 | `D3.L2.06` | Babel / SWC / esbuild 的定位、`browserslist`、按需 Polyfill（第 3 章） |
| §1.2 打包环节的完整机制 | `D3.L3.01` `D3.L3.02` | 依赖图与入口/输出（第 4 章） |
| §1.4 压缩与 `drop_console` | `D3.L2.10` | 压缩混淆、Sourcemap 策略、文件名 Hash、资源内联阈值（第 3 章） |
| §1.4 `deterministic` 与长缓存 | `D3.L4.07` | Hash 稳定性（第 8 章） |
| §1.5 阶段二 运行期注入 | `D6.L4.02` | build once, deploy many —— **✅ 已闭合，D6 第 1 章 §1.4** |

---

> **本章的来源与标注**：本章由原书第 1 章 §1.2（构建工具究竟做了什么）与 §1.4（开发构建与生产构建）**迁移并改写**而来，按 a2 决策整章标注为【补充背景】。原书这两节原标注为【已学】/【导引】；改写时新增了 Vite 8 的架构事实、Webpack `mode` 的完整默认值表与「构建期字面量替换」机制，并纠正了"Vite 走 Rollup"与"devtool 默认值为 `eval-cheap-*`"两处过时/混淆表述。凡涉版本号者均为**核验日期 2026-10-17 的抓取结果**。

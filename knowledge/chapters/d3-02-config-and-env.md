# D3 第 2 章 · 配置与环境：把默认值改对

> **本章定位**：D3 领域第 2 章。第 1 章讲了"构建做什么"，本章讲"**你写的配置到底改了什么**"。这两者之间隔着一层最容易被误解的东西 —— **默认值**。本章要建立的是三条可判定的认知：**配置的两种世界观**、**环境变量是一套伪造出来的常量**、**依赖预构建是 Vite dev 专属的一次性预处理**。整章为【补充背景】。
>
> **对应地图节点**：`D3.L2.04`（配置方式对比：Vite vs Webpack 的默认值覆盖差异）· `D3.L2.03`（环境变量机制：构建期替换"伪造"出的对象）· `D3.L2.05`（依赖预构建：Vite dev 专属的两件事）
>
> **前置**：`D3.L2.02`（开发构建与生产构建 —— 本章依赖第 1 章 §1.4 的"`mode` 只是一张默认值表"与"构建期字面量替换"两处结论）。
>
> **规范引用约定**：**构建工具没有标准化组织规范**。本章按**官方文档页名**引用，并按核验日期当日抓到的版本标注（核验日期 2026-10-17：**Vite 文档 v8.3.4**、**Webpack 文档 v5**）。凡官方页面**未给出**的结论，本章明确标注为"本书的推理"或"页面未覆盖"。
>
> **读完能做到**：说清 Webpack 与 Vite 的默认值差异**性质上**不同在哪；解释 `VITE_` 前缀为什么是白名单而不是命名习惯；分清 `MODE` 与 `NODE_ENV` 并按官方对照表判断 `PROD` / `DEV` 的取值；说出预构建的四个缓存键、以及它为什么只在开发期存在。

---

## 2.1 配置的两种世界观

先看 Webpack 官方在「Configuration」总览页开篇的那段话：

> **开箱即用，webpack 不要求你使用配置文件。** 然而，它会**假定**你的项目入口是 `src/index.js`，并把结果输出到 `dist/main.js`，**已压缩并针对生产优化**。

接着是第二句，它才是真实世界的写照：

> **通常，你的项目需要扩展这项功能**，为此你可以在根目录创建 `webpack.config.js`，webpack 会自动使用它。

**这两句话合起来，把 Webpack 的定位说清了：默认可跑，但高度显式可配。** 官方甚至在同一页承认"Webpack 有一大堆选项，可能让你不知所措"。

对照 Vite：它的配置同样可以省略 —— 但省略之后能做的事要多得多（原生 ESM 开发服务器、按需转换、预构建、`index.html` 作为入口）。**所以两者的差别不是"有没有默认值"，而是默认值的密度与可预测性。**

### 一处会破坏"算默认值"的细节

Webpack 配置总览页还有一条容易被忽略的 warning（官方原文）：

> **webpack 在插件的默认值应用之后，才应用配置的默认值。**

这句话的含义是：**你以为的"默认值"可能是某个插件先填进去的。** 所以"不写配置时会怎样"这个问题，在装了插件的项目里**不能只查文档的默认值表** —— 得看插件的默认值。

这与第 1 章 §1.4 的结论是同一条：**`mode` 只是一张默认值表，而默认值本身可能被别的东西改。**

### Vite 的配置文件：单份 + 条件分支

Vite 官方对"能否按 dev / build 拆两份配置"的立场很明确 —— **它的推荐做法是单份配置导出函数**：

```js
export default defineConfig(({ command, mode, isSsrBuild, isPreview }) => {
  if (command === 'serve') {
    return { /* dev 专属配置 */ }
  } else {
    // command === 'build'
    return { /* build 专属配置 */ }
  }
})
```

官方给出的四个参数：

| 参数 | 含义 |
|---|---|
| `command` | 开发期为 `serve`（`vite`、`vite dev`、`vite serve` 三者等价），生产构建为 `build` |
| `mode` | 当前使用的 mode |
| `isSsrBuild` | 是否为 SSR 构建（**附加可选标志**） |
| `isPreview` | 是否为预览构建产物（**附加可选标志**） |

**一条必须遵守的写法纪律（官方特意提醒）**：`isSsrBuild` 与 `isPreview` 是附加的可选标志，**某些加载 Vite 配置的工具可能不支持它们并传入 `undefined`**。因此要**显式与 `true` / `false` 比较**，**不要用真值判断**。

这个提醒的普适价值超过它本身：**凡"可选标志"都应当显式比较** —— 因为 `undefined` 在真值判断里是 `false`，你可能恰好对；但在"默认应该为真"的语义下就会错。

**需要如实说明的**：Vite 官方 Config 页**没有**"按 mode 自动加载不同配置文件"的约定（不存在 `vite.config.development.js` 这类机制），文档里按 mode 自动加载的**只有 `.env.[mode]` 系列**。技术上用 `--config` 可以做到多份配置，但**官方没有把它表述为 dev/build 分离的推荐实践**。

### 补深：Vite 的配置文件本身也走一条管线

这是本章第一处反常识：**`vite.config.js` 不是被直接 `require` 进来的。**

官方给出的两种加载模式：

| 模式 | 机制 |
|---|---|
| **默认 `bundle`** | 用 **Rolldown** 把配置打包成临时文件后加载，写入 `node_modules/.vite-temp`，带 inline source map |
| **`--configLoader native`** | 用运行环境原生运行时直接执行配置文件；适用于支持 TypeScript 的环境（如 **Node 22.18+**）或纯 JavaScript |

官方另说 `configLoader: 'native'` **计划在未来某个大版本成为默认值**。

**为什么这条值得知道**：因为它直接决定了**调试配置时断点能不能停住**。默认的 `bundle` 模式下你执行的是临时文件，所以官方给出了两条配套设置 —— 用 `vite --configLoader native` 让断点映射回源文件与插件钩子（如 `transform`）；若必须用 `bundle` 加载器，则要在 `.vscode/settings.json` 的 `debug.javascript.terminalOptions.resolveSourceMapLocations` 里加上 `**/node_modules/.vite-temp/**`。

**这条机制解释了 D0 第 7 章 §7.3 提过的"编辑器是第一层门禁"为什么在构建工具上会失灵**：门禁依赖断点能停在你想停的地方，而配置文件被换了一层皮。

---

## 2.2 默认值差异的实证

把两者"不写配置时"的行为并排放，差异就有了实证：

| 维度 | Webpack（v5） | Vite（v8） |
|---|---|---|
| **是否必须有配置文件** | 不要求（官方原文"won't require you"） | 不要求 |
| **默认入口** | **`src/index.js`**（官方原文"will assume the entry point of your project is `src/index.js`"） | **根目录 `index.html`**（第 1 章 §1.3 已讲） |
| **默认产物** | **`dist/main.js`**，且"已压缩并针对生产优化" | 高度优化的生产静态资源（目录名见 `build.outDir`） |
| **默认语法降级** | 不降级（由 `babel-loader` / `swc-loader` 之类决定） | 生产构建默认目标为 **Baseline Widely Available**；**开发期 transform target 为 `esnext`（不降级）** |
| **dev / build 的分野** | 靠 `mode` 的**默认值表** | 靠**两条不同管线** + 配置里的 `command` 分支 |
| **配置文件的加载** | 直接 require（Node 语义） | 默认由 **Rolldown 打包成临时文件**再加载 |
| **默认值被谁改** | ⚠️ **插件默认值先应用**，然后才是配置默认值 | 无对应机制（按文档） |

**一处必须诚实标注的缺口**：Webpack 的 Configuration **总览页**只给出"入口 `src/index.js`、输出到 `dist/main.js`"，**没有**写出 `output.path` 的默认表达式、`output.filename` 的模板、以及 `resolve.extensions` 的默认数组。这三项分别属于 Output 与 Resolve 子页，**本章不凭印象断言**。

**这张表的判断价值**：遇到"同样的代码换个工具行为就不一样"，第一件事不是查配置，而是查**默认入口在哪、默认是否降级**。第 1 章 §1.5 阶段一的"build 后白屏"，根源就在"开发期不降级、生产期降级"这一行的落差。

---

## 2.3 环境变量：一套"伪造"出来的常量

这是本章的核心节。第 1 章 §1.4 讲了"构建期字面量替换"的机制链，这里把它接到**你在代码里实际写的那套 API** 上。

### 先看官方的定性

Vite 官方对 `import.meta.env` 下那些常量的描述是：

> 这些常量**在开发期被定义为全局变量**，并在**构建期被静态替换，以使 tree-shaking 生效**。

同一页还有两句，把"替换"说得更死：

> 带 `VITE_` 前缀的变量会在 **Vite 打包之后**暴露在客户端源码里。
>
> 这些变量的值会在**构建期被打进你的源码**。

**三句话合起来就是本节的结论：`import.meta.env` 不是运行时读取的环境变量，而是一组在构建期被写成字面量的常量。**

这解释了第 1 章 §1.4 提过的那三件事（前端产物里 `process` 不存在、恒假分支被物理删除、改环境变量要重新构建），并给出第四个推论：**它天然是 tree-shake 友好的** —— 官方示例直接说明了这一点：

```js
if (import.meta.env.DEV) {
  // 这里的代码会在生产构建中被 tree-shaken
  console.log('Dev mode')
}
```

### 五个内置常量

| 常量 | 类型 | 含义 |
|---|---|---|
| `import.meta.env.MODE` | string | 应用运行所处的 **mode** |
| `import.meta.env.BASE_URL` | string | 应用被服务的 base url，由 `base` 配置项决定 |
| `import.meta.env.PROD` | boolean | 是否运行在生产环境（用 `NODE_ENV='production'` 运行 dev server，或运行以 `NODE_ENV='production'` 构建的应用） |
| `import.meta.env.DEV` | boolean | 是否运行在开发环境，**始终是 `PROD` 的反面** |
| `import.meta.env.SSR` | boolean | 应用是否运行在服务端 |

**`PROD` 与 `DEV` 是精确的互补**（官方原文"always the inverse of `PROD`"）—— 这条看起来是废话，但它是一处可用的自检：**如果你发现两者同时为真或同时为假，那一定不是环境的问题，是读法的问题。**

### `VITE_` 前缀是白名单，不是命名习惯

官方用一段对照代码把机制说透了。`.env` 内容：

```ini
VITE_SOME_KEY=123
DB_PASSWORD=foobar
```

代码：

```js
console.log(import.meta.env.VITE_SOME_KEY) // "123"
console.log(import.meta.env.DB_PASSWORD)   // undefined
```

三个结论：

1. **只有带 `VITE_` 前缀的变量才会被注入客户端** —— 它是**白名单机制**，不是"建议加个前缀好识别"；
2. **所有值以字符串形式暴露** —— 写的是数字 `123`，读出来是字符串 `"123"`；布尔值同理。**类型要自己转换**；
3. **不带前缀 = 天然隔离** —— 这是刻意的防泄漏设计。

官方的安全提醒原文：

> `VITE_*` 变量**不应**包含 API 密钥之类敏感信息。这些变量的值会在**构建期被打进你的源码**。生产部署时，请考虑用**后端服务或 serverless / edge 函数**来妥善保管密钥。

**这条的推理链很短，但很多人没走完**：带前缀 → 构建期被字面量写进 JS → 任何访问站点的人都能在产物里读到 → **等于公开**。所以"前端能不能放密钥"这个问题的答案不是"最好不要"，而是"**这根本不是一个能藏的容器**"。

### `.env` 的加载是叠加，不是二选一

官方的四个文件：

```ini
.env                # 所有情况都加载
.env.local          # 所有情况都加载，会被 git 忽略
.env.[mode]         # 只在指定 mode 加载
.env.[mode].local   # 只在指定 mode 加载，会被 git 忽略
```

**关键规则（官方原文）**：

> Vite **总是**在 mode 专属的 `.env.[mode]` 之外，**额外加载** `.env` 与 `.env.local`。

也就是说这是**叠加**，不是二选一。由此得到优先级排序：

| 优先级 | 来源 |
|---|---|
| **最高** | **进程启动时已存在的真实环境变量**（**不会被 `.env` 文件覆盖**） |
| ↓ | `.env.[mode].local` |
| ↓ | `.env.[mode]` |
| ↓ | `.env.local` |
| **最低** | `.env` |

**"进程已有的环境变量优先级最高"这一条解释了本章 §2.5 场景一**：你在 shell 里 `export` 过一个同名变量，`.env` 里写什么都没用。

**两处如实标注**：

- 前三条（mode 专属高于通用、`.env`/`.env.local` 叠加加载、进程变量不被覆盖）是**官方明写**的；**`.local` 高于同名非 `.local` 属 Vite / dotenv 的惯例行为，该页未逐条明说**。
- `.env` 文件在 **Vite 启动时加载，修改后需重启服务**（官方明写）。

另有一个细节值得记：Vite 用 `dotenv-expand` 做变量展开，**`$` 需转义为 `\$`**（`test$foo` → `test`，`test\$foo` → `test$foo`，`test$KEY` → `test123`）。官方另说支持**逆序展开**（`VITE_FOO=foo${VITE_BAR}` 写在 `VITE_BAR=bar` 之前也能求值），但**在 shell / docker compose 中不成立**，建议**不要依赖**。

### 一处绝妙的对照：不存在的变量，两种语法两种行为

这是本章最值得记住的一个细节，官方原文给了同一种"替换"的两种失败形态：

| 语法位置 | 变量不存在时 |
|---|---|
| **HTML 里** `%NON_EXISTENT%` | **原样保留，不被替换** |
| **JS 里** `import.meta.env.NON_EXISTENT` | **被替换为 `undefined`** |

同一种机制（构建期替换），两个方向相反的失败：**HTML 里你能看见那个占位符**（所以会发现写错了），**JS 里它静默变成 `undefined`**（所以你会看到接口地址成了 `/undefined/api`）。

**这就是第 1 章 §1.5 阶段二那个 bug 的机制根源。** 它也是"环境变量类问题为什么难查"的通用解释：**失败方式是不报错。**

HTML 侧的正确写法是 `%CONST_NAME%`：

```html
<h1>Vite is running in %MODE%</h1>
<p>Using data from %VITE_API_URL%</p>
```

官方另说明：Vite 对复杂替换（如条件判断）不做预设，可通过 `transformIndexHtml` 钩子的插件扩展。

### `MODE` 与 `NODE_ENV` 是两个概念

这是本章第二个反常识，也是官方给得最清楚的一张表：

| 命令 | `NODE_ENV` | `Mode` |
|---|---|---|
| `vite build` | `"production"` | `"production"` |
| `vite build --mode development` | `"production"` | **`"development"`** |
| `NODE_ENV=development vite build` | **`"development"`** | `"production"` |
| `NODE_ENV=development vite build --mode development` | `"development"` | `"development"` |

**第二、三行就是全部误会的来源**：`--mode` 只改 `Mode`，不改 `NODE_ENV`；`NODE_ENV` 只改 `NODE_ENV`，不改 `Mode`。两者**各管一摊**。

而它们各自决定什么，官方也给了表：

| `NODE_ENV` | `import.meta.env.PROD` | `import.meta.env.DEV` |
|---|---|---|
| `production` | `true` | `false` |
| `development` | `false` | `true` |
| 其他值 | `false` | `true` |

| 参数 | `import.meta.env.MODE` |
|---|---|
| `--mode production` | `"production"` |
| `--mode development` | `"development"` |
| `--mode staging` | `"staging"` |

**三句话总结这张表：**

1. **`MODE` 由 `--mode` 决定**（默认：`vite dev` → `development`，`vite build` → `production`）；
2. **`PROD` / `DEV` 由 `NODE_ENV` 决定**，**不看 `MODE`**；
3. **`NODE_ENV` 取"其他值"时，`DEV` 为 `true`** —— 这是"非 production 即开发"的保守取向。

**官方还给了两条实用建议**：`NODE_ENV` 也可以写在 `.env.[mode]` 里由 mode 控制取值；在命令行显式指定 `NODE_ENV` 的好处是 **Vite 能更早检测到它**（因为 env 文件要等配置求值后才加载，见下）。

### 因果链：为什么配置文件里读不到 `.env`

这是一个完整的因果链，官方原文给了每一环：

1. Vite **刻意延迟**加载 `.env*` 文件；
2. 原因：**要加载哪些文件取决于 `root`、`envDir` 等配置项以及最终的 mode** —— 而这些都是**配置文件求出来的**；
3. 因此配置文件被求值时，`process.env` 里**只有当前进程已有的变量**；
4. 所以 `.env` 里的值**不会**在 `vite.config.*` 运行期间自动注入；
5. 若配置本身需要用到它们（如设置 `server.port`、条件启用插件、计算 `define` 替换），要**手动**用 `loadEnv`。

官方示例：

```js
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')  // 第三参数为 '' 则忽略 VITE_ 前缀
  return {
    define: { __APP_ENV__: JSON.stringify(env.APP_ENV) },
    server: { port: env.APP_PORT ? Number(env.APP_PORT) : 5173 },
  }
})
```

**这条链的价值在于它是"循环依赖"的教科书案例**：配置决定加载哪些 env，而 env 又要在配置里用。Vite 的解法是**打破循环**（延迟加载 + 显式 `loadEnv`），不是让它自动生效。

**一处诚实标注**：`envPrefix` 与 `envDir` 的具体写法**不在该页**（前者仅一句"见 `envPrefix` 选项"，后者该页未出现），属 Config Reference 的内容。

---

## 2.4 依赖预构建：Vite dev 专属的两件事

`D3.L2.05` 是本章唯一一个"Vite 独有的、Webpack 没有对应物"的机制。**理解了它，就理解了 Vite 开发体验的来源与代价。**

### 两个目的（官方原话）

官方原文："This process serves two purposes:"

**① CommonJS / UMD 兼容**

> 开发期，Vite 把**所有代码以原生 ESM 提供**。因此 Vite **必须先把以 CommonJS 或 UMD 形式发布的依赖转成 ESM**。
>
> 转换 CommonJS 依赖时，Vite 会做**智能 import 分析**，使命名导入到 CommonJS 模块也能按预期工作，**即使导出是动态赋值的（例如 React）**。

对照代码（官方给的"按预期工作"）：

```js
import React, { useState } from 'react'
```

**这一条回答了 D2 第 1 章留下的那个问题的工程侧答案**：ESM 与 CJS 的互操作不是纯粹的语义问题，在**开发期**它是被一个预处理步骤"抹平"的。而 `import React, { useState }` 这种写法之所以在 dev 里能用，靠的是**静态分析猜出了 CJS 的导出名**。

**② 性能：减少请求数量**

> Vite 会把内部模块很多的 ESM 依赖**转换成单个模块**，以改善后续的页面加载性能。
>
> 有些包把 ESM 构建成许多互相引用的独立文件。例如 **`lodash-es` 有 600 多个内部模块**！当我们 `import { debounce } from 'lodash-es'` 时，浏览器会**同时**发出 600 多个 HTTP 请求！即使服务端处理它们没问题，**大量请求也会在浏览器侧造成网络拥塞**，导致页面加载明显变慢。
>
> 通过把 `lodash-es` 预构建成单个模块，我们现在**只需要一个 HTTP 请求**！

**注意官方的措辞重心**：问题**不在服务端**（"服务端处理它们没问题"），而在**浏览器侧的网络拥塞**。这与第 1 章 §1.2 的第三条约束完全对应 —— **请求数量是唯一"即使全用最新浏览器也依然存在"的约束**。

### 执行者：当前是 Rolldown

官方原文："预构建由 **Rolldown** 完成，因此通常非常快。"

**该页全文未出现 "esbuild"。** 这与第 1 章 §1.2 的发现一致 —— "Vite 用 esbuild 做预构建"同样是**旧版本的说法**。佐证是配置项名：自定义预构建行为的选项是 **`optimizeDeps.rolldownOptions`**。

### 缓存：位置、四个缓存键、第二层缓存

**位置**：`node_modules/.vite`。

**决定是否重跑的四个来源（官方原文）**：

| 缓存键 | 说明 |
|---|---|
| **包管理器 lockfile 内容** | `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `bun.lock` 等 |
| **patches 文件夹修改时间** | 补丁目录的 mtime |
| **`vite.config.js` 中的相关字段** | 配置变化会让缓存失效 |
| **`NODE_ENV` 的值** | 环境变量变化会让缓存失效 |

> 官方原文：**只有上述之一发生变化时，预构建步骤才需要重跑。**

**注意这里出现了一个熟悉的东西**：`NODE_ENV` 也在缓存键里。这解释了 §2.5 场景三的一个副作用 —— 改 `NODE_ENV` 不只影响 `PROD`/`DEV`，还会**触发全量重新预构建**。

**第二层缓存（浏览器侧）**：官方说解析后的依赖请求被**强缓存**，HTTP 头是 `max-age=31536000,immutable` —— "一旦缓存，这些请求将不再访问 dev server"。失效方式是**在 URL 上附加版本查询**（版本来自 lockfile）。

**这两层缓存叠起来，构成本章最实用的一个排查顺序**：

```
改了依赖但 dev 端没变
   ├─ 第一层：node_modules/.vite 有旧预构建结果 → --force 或删目录
   └─ 第二层：浏览器强缓存觉得 URL 没变 → 用 devtools 临时禁用缓存
```

官方给的调试三步正是这个顺序：① 在浏览器 devtools 的 Network 面板临时禁用缓存；② 用 `--force` 重启 dev server 重新预构建；③ 刷新页面。

### 何时会自动重跑

| 时机 | 行为 |
|---|---|
| **首次运行 `vite`** | 在本地加载站点**之前**自动完成（默认透明、自动） |
| **任一缓存键变化** | 重跑 |
| **服务启动后遇到新的、未缓存的依赖导入** | 重跑，**并按需刷新页面** |
| **monorepo 中被链接的依赖发生改动** | **需用 `--force` 重启** dev server 才生效 |

### `optimizeDeps` 的官方选择准则

先看**自动发现**机制：

> 若找不到已有缓存，Vite 会**扫描你的源码，自动发现依赖导入**（即那些期望从 `node_modules` 解析的 **"bare imports"**），并把这些找到的导入作为预构建的**入口**。

对 monorepo 的**链接依赖**，官方规则不同：

> Vite 会自动检测不是从 `node_modules` 解析的依赖，并**把链接依赖当作源码**处理。它不会尝试打包该链接依赖，而是**改为分析该链接依赖的依赖列表**。
>
> 但这要求**链接依赖以 ESM 导出**。如果不是，你可以在配置中把该依赖加入 `optimizeDeps.include`。

**手动干预的判断标准，官方给得很干净**：

| 依赖特征 | 建议 |
|---|---|
| **体积大（内部模块多）** 或 **是 CommonJS** | 用 **`include`** |
| **体积小** 且 **已是合法 ESM** | 用 **`exclude`**，让浏览器直接加载 |

**典型的 `include` 场景**（官方点名的）：

> `optimizeDeps.include` / `exclude` 的典型用例，是当你有**在源码中无法直接发现的导入**时。例如该导入可能是**插件转换的产物**。这意味着 Vite 在初次扫描时发现不了它 —— 只有在文件被浏览器请求并转换之后才能发现。**这会导致服务启动后立即重新打包。**

**这一段解释了一个真实存在的坏体验**：插件注入的 import 会让 dev server 刚起来就重打包一次。修法不是在插件里想办法，而是**显式 `include`** —— 因为问题在于"扫描时机"而不是"扫描能力"。

### 为什么只在开发期存在

官方只有一句 NOTE：

> **依赖预构建只适用于开发模式。**

**该页没有解释原因。** 本书给出的推理（标明为推理，不是官方原文）：

预构建的两个目的都是**开发期服务方式的产物** —— dev 阶段 Vite 以原生 ESM 逐文件提供代码、**不做打包**，所以才需要①把 CJS/UMD 转 ESM、②把成百上千个内部模块合并以减少请求。而**生产构建本身就是一次完整打包**：CJS→ESM 的转换与"模块合并"由构建流程统一完成，请求数量问题也由产物打包与代码分割解决。**在已经打包过的产物上再叠一层"为了不打包而做的预处理"，没有意义。**

**旁证**：该页围绕的全部是 dev server 机制 —— `node_modules/.vite`、`--force`、浏览器 `immutable` 长缓存。

---

## 2.5 实战：五个"配置没生效"的现场

> **说明**：构造示例，不是真实项目经历。每一步的成因都能在本章找到对应机制。

### 场景一：改了 `.env`，值却没变

**排查顺序**（按概率）：

1. **重启过 dev server 吗？** 官方明写：`.env` 在 Vite 启动时加载，**修改后需重启服务**。
2. **shell 里有没有同名环境变量？** 官方明写：**进程启动时已存在的真实环境变量优先**，`.env` 覆盖不了它。
3. **是不是看错了文件？** `.env` 与 `.env.local` 是**叠加**加载，mode 专属文件会**覆盖**通用文件 —— 你可能改的是一份被覆盖的。

**这一场景的通用教训**：**"配置有优先级"这件事必须被显式记住**，否则每次改配置都在赌。

### 场景二：`vite.config.js` 里 `process.env` 读不到 `.env` 的值

**成因**（§2.3 的因果链）：Vite **刻意延迟**加载 env 文件，因为**要加载哪些取决于 `root`、`envDir` 与最终 mode** —— 而这些都由配置文件决定。所以配置文件求值时，`.env` 还没被读进来。

**修法**：用 `loadEnv`。注意第三个参数 —— 传 `''` 才能读到**不带 `VITE_` 前缀**的变量（官方示例正是这样读 `APP_PORT` 的）。

**这一场景的教训**：这是一个**循环依赖被刻意打破**的例子。正确的反应不是"为什么它不自动生效"，而是"**它在设计上就不该自动生效**" —— 否则 `envDir` 这个配置项自己就没法工作了。

### 场景三：CI 上 `PROD` 判断反了

**现象**：本地 `vite build` 之后行为正常，CI 构建出来的产物走了"开发分支"。

**排查**（对照 §2.3 的三句话）：

1. **CI 里有没有设 `NODE_ENV`？** 若有且不是 `production`，则 `import.meta.env.PROD` 为 `false`、`DEV` 为 `true` —— **`NODE_ENV=development vite build` 这一行官方表格就是这个行为**：`Mode` 仍是 `production`，但 `NODE_ENV` 是 `development`。
2. **代码里判断的是 `MODE` 还是 `PROD`？** 两者由不同来源决定，混用必然错。

**修法**：判断"是不是生产"用 `PROD`（它看 `NODE_ENV`）；判断"哪一套环境（staging / production）"用 `MODE`（它看 `--mode`）。**这两个问题是不同的问题。**

### 场景四：改了本地链接的库，dev 端没变

**成因**（§2.4 的两层缓存）：预构建结果在 `node_modules/.vite`；浏览器端又有 `immutable` 强缓存。

**修法**（官方给的三步顺序）：

1. devtools 的 Network 面板**临时禁用缓存**；
2. 用 **`--force`** 重启 dev server（或手动删 `node_modules/.vite`）；
3. 刷新页面。

**monorepo 的额外一条**：官方明确 —— **改动被链接的依赖后，需用 `--force` 重启**才能生效。

### 场景五：dev server 刚起来就重打包一次

**成因**（§2.4 的官方原文）：某个导入在**源码里不可直接发现**（典型是**插件转换后才产生**的 import）。Vite 初次扫描时看不到它，等浏览器请求该文件、插件转换完才发现 —— 于是**立即重新预构建**。

**修法**：显式写进 `optimizeDeps.include`。**不是改插件** —— 问题在扫描时机，不在插件能力。

### 反过来看：本章机制该放进团队文档的哪几句

| 现象 | 先查什么 | 对应机制 |
|---|---|---|
| 改了 `.env` 不生效 | 重启了吗；shell 有同名变量吗；是否被 mode 文件覆盖 | §2.3 叠加加载与优先级 |
| 配置里读不到环境变量 | 用 `loadEnv` 了吗 | §2.3 延迟加载的因果链 |
| 环境变量成了 `undefined` | 有没有 `VITE_` 前缀；名字是否拼错 | §2.3 白名单 + JS 侧静默变 `undefined` |
| 读出来是字符串不是数字 | `import.meta.env` 的值**全是字符串** | §2.3 类型 |
| `PROD` 判断反了 | `NODE_ENV` 的值 | §2.3 `PROD`/`DEV` 看 `NODE_ENV` 不看 `MODE` |
| 配置断点停不住 | 默认加载器会把配置打包成临时文件 | §2.1 `bundle` vs `native` |
| 改了链接依赖没生效 | 预构建缓存 + 浏览器强缓存 | §2.4 两层缓存 + `--force` |
| dev 刚启动就重打包 | 有无插件注入的 import | §2.4 discovered dependencies |
| 想把密钥放前端 | 带 `VITE_` 的会被打进产物 | §2.3 安全边界 |

---

## 2.6 动手

**每一项都要求说出理由**：

| 任务 | 验收 |
|---|---|
| 建一个不写配置文件的 Webpack 项目（只有 `src/index.js`），跑一次构建 | 说出默认入口与默认输出分别是什么，依据是官方哪句话 |
| 同上，但装一个自带默认值的插件，再跑一次 | 说出官方那条"配置默认值在插件默认值**之后**应用"意味着什么 |
| 把 Vite 配置改成导出函数，在 `command === 'serve'` 与 `'build'` 下各打一条日志 | 说出为什么官方推荐单文件导出函数而不是两份配置文件 |
| 在配置函数里用 `if (isPreview)` 判断，再改成 `if (isPreview === true)` | 说出官方提醒的理由，以及 `undefined` 在两种写法下的差别 |
| 用 `vite --configLoader native` 与默认模式分别调一次配置断点 | 记录两次断点能否停在源文件，说出 `node_modules/.vite-temp` 的作用 |
| `.env` 里写 `VITE_SOME_KEY=123` 与 `DB_PASSWORD=foobar`，代码里各读一次 | 说出两个结果，以及为什么类型是字符串 |
| 在 HTML 里写 `%VITE_SOME_KEY%` 与 `%NON_EXISTENT%`，在 JS 里读同两个变量 | 对比四处结果，说出"不命中"时两种语法为何行为不同 |
| 依次用 `.env` / `.env.production` / `.env.production.local` 定义同名变量，跑 `build` | 说出最终取到哪个，以及"叠加加载"与"二选一"的差别 |
| 在 shell 里 `export` 一个与 `.env` 同名的变量，再跑 | 说出为什么 `.env` 覆盖不了它 |
| 跑 `vite build --mode development`，打印 `MODE` 与 `PROD` | 说出两个值，并对照官方那张 `NODE_ENV` / `Mode` 表解释 |
| 跑 `NODE_ENV=development vite build`，同样打印 | 说出它与上一条的差别，以及 `import.meta.env.DEV` 的取值 |
| 在 `vite.config.js` 里直接读 `process.env.VITE_SOME_KEY` | 记录结果，说出为什么必须用 `loadEnv` |
| 找一个有几百个内部模块的 ESM 库，看 dev server 下它发出几个请求 | 说出预构建把它变成了几个请求，以及"问题在浏览器侧还是服务端侧" |
| 删掉 `node_modules/.vite` 再启动，观察控制台 | 说出预构建的四个缓存键分别是什么 |
| 写一个插件，在 `transform` 里注入一个新 import，观察 dev server 行为 | 记录现象，说出为什么需要 `optimizeDeps.include` |

**进阶挑战**（任选一项）：

1. 把 §2.3 那张 `NODE_ENV` / `Mode` 的 4×2 官方表格**逐行亲手验证一遍**，并说明哪两行最容易让人误判、为什么。
2. 构造一个"开发正常、构建后失败"的用例，要求失败原因是**环境变量类**（提示：`VITE_` 前缀缺失或 `PROD` 判断反了），然后写清为什么 `dev` 阶段看不出它。
3. 在一个 monorepo 里链接一个**非 ESM 导出**的本地包，复现"预构建不生效"的现象，再用官方给的 `optimizeDeps.include` 修好，并说明为什么官方把链接依赖当"源码"处理。

---

## 2.7 本章常见误区

| # | 误区 | 纠正 |
|---|---|---|
| 1 | "Webpack 必须有配置文件才能用" | 官方原文：**不要求**配置文件，会假定入口 `src/index.js`、输出 `dist/main.js` 且**已按生产优化** |
| 2 | "不写配置就是没优化" | Webpack 零配置产物**已压缩并针对生产优化**（与 `mode` 默认 `production` 一致） |
| 3 | "`vite.config.js` 是直接被 require 的" | 默认用 **Rolldown 打包成临时文件**再加载（`node_modules/.vite-temp`），所以断点会停在临时文件上 |
| 4 | "`isPreview` 可以当真值判断" | 官方提醒它可能是 **`undefined`**，**必须与 `true` / `false` 显式比较** |
| 5 | "`import.meta.env.X` 是运行时读环境变量" | 它在**构建期被静态替换成字面量**（官方原文），目的是让 tree-shaking 生效 |
| 6 | "`VITE_` 前缀是命名建议" | 它是**白名单机制**：只有带前缀的才会被注入客户端，其余在客户端是 `undefined` |
| 7 | "环境变量读出来是它本来的类型" | **全部以字符串暴露**。`VITE_SOME_KEY=123` 读出来是 `"123"` |
| 8 | "`.env` 与 `.env.production` 是二选一" | 官方原文：**总是**在 mode 专属文件之外**额外加载** `.env` 与 `.env.local` —— 是**叠加** |
| 9 | "`.env` 的优先级最高" | **进程启动时已存在的真实环境变量最高**，`.env` 覆盖不了它 |
| 10 | "变量名拼错会报错" | JS 里 `import.meta.env.NON_EXISTENT` **被替换成 `undefined`**（而 HTML 里的 `%NON_EXISTENT%` **原样保留**） |
| 11 | "`MODE` 和 `NODE_ENV` 是一回事" | 官方 4×2 表格：`vite build --mode development` → `NODE_ENV=production` 但 `Mode=development`；反过来 `NODE_ENV=development vite build` → `Mode` 仍是 `production` |
| 12 | "`PROD` 看的是 mode" | `PROD` / `DEV` 由 **`NODE_ENV`** 决定，**不看 `MODE`**；`MODE` 由 `--mode` 决定 |
| 13 | "`NODE_ENV` 设成 `staging` 就是"非生产"" | 官方表：`NODE_ENV` 为"其他值"时 **`DEV` 为 `true`**、`PROD` 为 `false` —— 即按"非 production 即开发"处理 |
| 14 | "`vite.config.js` 里能读到 `.env`" | Vite **刻意延迟**加载 env 文件（因为要加载哪些取决于 `root` / `envDir` / mode）—— 要用 `loadEnv` |
| 15 | "`loadEnv` 只读得到 `VITE_` 开头的变量" | 第三个参数传 `''` 就能读到不带前缀的变量（官方示例正是这样读 `APP_PORT`） |
| 16 | "带 `VITE_` 前缀的变量比较安全" | 官方原文：`VITE_*` **不应**包含 API 密钥 —— 它们**会在构建期被打进源码**，等于公开 |
| 17 | "预构建用的是 esbuild" | 当前文档（v8.3.4）明确**预构建由 Rolldown 完成**，且该页**未出现 "esbuild"**；配置项名为 `optimizeDeps.rolldownOptions` |
| 18 | "预构建是为了让生产产物更小" | 官方 NOTE：**只适用于开发模式**。它解决的是"dev 不打包"带来的两个问题 |
| 19 | "600 个请求的问题是服务端扛不住" | 官方重心在**浏览器侧网络拥塞**（"服务端处理它们没问题"） |
| 20 | "改了依赖，重启 dev server 就够了" | 有两层缓存：`node_modules/.vite` 与浏览器端的 `max-age=31536000,immutable`。官方调试三步是**先禁浏览器缓存、再 `--force`、再刷新** |
| 21 | "预构建缓存只看 lockfile" | 官方列了**四个**缓存键：lockfile 内容 · patches 目录 mtime · 配置相关字段 · **`NODE_ENV` 值** |
| 22 | "monorepo 里链接的依赖也会被预构建" | 官方：**链接依赖被当作源码**，不打包它，而是分析它的依赖列表；且**要求它以 ESM 导出**，否则要 `include` |
| 23 | "插件注入的 import 让 dev 重打包是插件写坏了" | 官方解释：该导入**在源码里不可直接发现**，扫描时看不到 → 启动后才触发重新预构建。修法是**显式 `include`** |
| 24 | "`optimizeDeps.exclude` 可以随便用" | 官方准则：**大的或 CJS 用 `include`；小的且合法 ESM 才用 `exclude`** |
| 25 | "改了 `.node_modules/.vite` 里的东西没关系" | 那是预构建缓存的落点，缓存键之一变化就整体重跑；手工删它等价于 `--force` |

---

## 待回链

| 位置 | 依赖节点 | 内容 |
|---|---|---|
| §2.3 环境变量的编译期替换 | `D3.L2.10` | `define` / 压缩器的常量折叠与 `drop_console`（第 3 章） |
| §2.1 配置文件的加载与插件 | `D3.L3.03` `D3.L3.06` | Loader 与 Plugin 的执行机制、插件生态对比（第 4 章） |
| §2.4 预构建与依赖图 | `D3.L3.01` | 依赖图的构建过程（预构建是 dev 期的一张子图） |
| §2.4 预构建的产物与 hash | `D3.L2.11` `D3.L4.07` | 持久化缓存与 Hash 稳定性（第 5、8 章） |
| §2.3 运行时配置注入 | `D6.L4.02` | build once, deploy many —— **✅ 已闭合，D6 第 1 章 §1.4** |
| §2.1 `configLoader` 与编辑器调试 | `X1.L2.01` | 脚手架与模板 —— **✅ 已闭合，X1 第 1 章 §1.2–§1.5**（`npm create` 的机制、模板版本托管、模板与共享包的分工） |

---

> **本章的来源与标注**：本章内容取自原书第 3 章 §3.2（依赖预构建）、§3.3（配置方式对比）、§3.4（环境变量机制），**逐节改写并大幅补深**（新增 Vite 8 的 Rolldown 事实、`MODE`/`NODE_ENV` 官方对照表、`.env` 叠加加载与优先级、HTML 与 JS 的两种"替换失败"形态、预构建的四个缓存键与两层缓存），整章为【补充背景】。凡涉版本号者均为**核验日期 2026-10-17 的抓取结果**；凡官方页面未给出的结论，均标注为"本书的推理"或"页面未覆盖"。

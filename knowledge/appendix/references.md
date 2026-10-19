# 参考资料

> **诚实声明（请先读）**
>
> 本文件只列**实际核验过的来源**，并标注核验方式与粒度。
>
> 课程进行中的核验方式是**联网检索官方文档 / 官方站点 / 发布记录**，核验日期集中在 **2026-10-10**。
>
> **自 2026-10-16 起新增的编纂内容（D0 / D2 共 10 章）适用另一套规则**：按**规范条款名**引用（不写节号），条款名依据编纂者既有知识写出、**未逐条联网核验** —— 清单见 §三。**请勿把 §三当作"已核验来源"。**
>
> **粒度说明**：过程记录中只逐字保留了**一个**完整 URL（Vite 依赖预构建文档）。其余来源是在**官方站点 / 官方仓库 / 官方博客**这一层级记录的，**未逐字保留具体 URL 与版本快照**。本文件如实标注这一差别 —— 需要精确引用时，请到对应官方站点核对当前内容。
>
> **凡本书中标注为【待验证】的结论，其来源均不在本文件内** —— 它们是没有来源的推断。

---

## 一、逐字记录过 URL 的来源

| # | 来源 | 支撑的结论 | 章节 |
|---|---|---|---|
| 1 | `https://vite.dev/guide/dep-pre-bundling` | 依赖预构建的**两个目的**（CJS/UMD → ESM 兼容 + 性能）；`lodash-es` 600+ 内部模块 → 600+ 请求；执行者为 **Rolldown**（早期 esbuild） | §3.2 |

---

## 二、按官方站点层级记录（未逐字保留 URL）

### 官方文档

| 来源 | 类型 | 支撑的结论 | 章节 |
|---|---|---|---|
| **Webpack 官方文档** — Concepts 系列 | 机制文档 | 依赖图三动作、Loader / Plugin 概念、`module.rules` 与 `plugins` 的关系 | §2.1–§2.3 |
| **Webpack 官方文档** — Asset Modules | 机制文档 | 静态资源 "without configuring additional loaders" 的原文表述，以及仍需 `type` 声明的精度修正 | §3.3 |
| **Webpack 官方文档** — Optimization / SplitChunksPlugin | API 文档 | `chunks` 默认 `'async'`；`minChunks` 的语义 | §2.2、§2.5 |
| **Webpack 官方文档** — Devtool | API 文档 | devtool 各值的速度 / 质量梯度 | §2.7 |
| **Webpack 官方文档** — Cache | API 文档 | `cache: { type: 'filesystem' }` | §5.3 |
| **Vite 官方文档** — Why Vite | 机制文档 | 打包式 vs 原生 ESM 的架构差异 | §3.1 |
| **Vite 官方文档** — Env Variables and Modes | 机制文档 | `VITE_` 前缀、`loadEnv`、`import.meta.env` 为静态替换 | §3.4 |
| **Vite 官方文档** — Build Options | API 文档 | `build.sourcemap` 默认 `false`；`build.lib.formats`；`forwardConsole` | §2.7、§7.5、§6.3 |
| **Vite 官方文档** — Features（静态资源后缀） | API 文档 | `?raw` / `?url` / `?inline` | §3.5 |
| **Rollup 官方文档** — Plugin Development | 机制文档 | Rollup 插件钩子（含 `generateBundle` 等在 dev 下不触发的钩子） | §3.5 |

### 官方站点 / 官方仓库（工具事实）

| 来源 | 支撑的结论 | 章节 |
|---|---|---|
| **Rspack 官方站点** | 1.0 发布与 production-ready 声明；"10x faster than webpack"；loader runner 完全兼容；top 50 插件 >80%；`builtin:swc-loader` 推荐；采用了 Module Federation 2.0；采用方名单（字节内部 >1000 应用、微软 / 亚马逊 / 阿里 / Discord） | §4.3 |
| **Rspack 迁移文档 + `rspack-compat` 仓库** | `HtmlWebpackPlugin` → `HtmlRspackPlugin`、`MiniCssExtractPlugin` → `CssExtractRspackPlugin`、`css-loader` → 内置、`resolve.plugins` 不支持；逐插件兼容起始版本 | §4.3、§7.6 |
| **Farm 官方站点** | `vitePlugins`；Farm JS 插件必须配 `filters`；Partial bundling；三类插件的划分 | §4.3 |
| **Next.js / Turbopack 官方发布记录** | Next.js 15.0 中 `next dev` 稳定；**Next.js 16.0（2025-10-21）dev 与 build 双双稳定并成为默认**；`--webpack` 退回；`webpack()` 配置导致 `next build` 失败；三条设计（单图 / 函数级增量落盘 / dev 懒编译）；转换用 SWC、CSS 用 Lightning CSS、不做类型检查；`experimental.turbo.rules`；Sass `~` 前缀不支持 | §4.4 |
| **Vercel 官方口径** | Turbopack 生产构建快 2–5x、Fast Refresh 快至 10x（厂商自测） | §4.4 |
| **Rolldown / VoidZero 官方博客与发布记录** | 时间线（2024-04 首发 → 2026-05-07 1.0 稳定）；基于 Oxc；Rollup 插件 API 兼容；Vite 8（2026-03-12）成为默认；比 Rollup 快 10–30x 的官方口径；真实案例（Linear 46s→6s、GitLab 2.5min→22s、Ramp -57%、Beehiiv -64%、Mercedes-Benz.io -38%）；Node 20.19+ / 22.12+ 与 ESM-only；Yarn PnP 兼容问题；`build.rolldownOptions` | §4.4、§4.5 |
| **Cloudflare 官方公告**（VoidZero 加入 Cloudflare，2026-06-04） | agents as users 原话；agent 对工具的三项要求；"For agents, speed is a reliability requirement"；`@cloudflare/vite-plugin` 周下载量与解释；100 万美元 Vite 生态基金；Vite 保持 MIT / 厂商中立 | §6.1、§6.3 |

### 社区实践（AI 辅助构建部分）

| 来源 | 支撑的结论 | 章节 |
|---|---|---|
| `@paretools/build`、`cpp-build-mcp` 一类 **MCP build server** | 结构化诊断（file / line / column / severity / message / code）；两步式（摘要 → 详情）；原始日志不进上下文窗口 | §6.3 |
| **Frontman、Stagewise** 一类运行时感知工具 | 以 dev server 中间件 / 浏览器代理形式，通过 MCP 暴露 DOM / 组件树 / computed style / 模块图 / 路由 / 服务日志 | §6.3 |

---

## 三、编纂内容引用的规范（条款名，未逐条联网核验）

**自 2026-10-16 起新增的 D0 / D2 共 10 章，统一按「条款名」引用规范，不写节号。**（理由：节号在规范版本间会变动，条款名更稳定。）

> **核验状态声明（2026-10-16 更新）**：下表条款名**已逐组联网核验** —— 抓取各规范的官方 TR 页面 / Living Standard 目录页，逐一核对条款名是否存在、是否改名。
>
> **核验结果**：25 项一致；**12 处名称不符或归属错误，已全部改正**。逐条清单与各规范版本快照见 `notes/compilation-log.md` §五。逐章对应关系见同文件 §三。
>
> **仍需注意**：HTML Standard 与 DOM Standard 是 Living Standard（核验当日分别在 2026-10-14、2026-10-15 更新过），**条款名本身也会随更新变动**。需要精确引用时请到对应站点核对当前版本。

### Web 平台规范（WHATWG / W3C / Ecma）

| 规范 | 引用的条款名 / 内容 | 章节 |
|---|---|---|
| **HTML Standard** | 《Parsing》《Tree construction》《The DOCTYPE》《Focus》《Forms》《Constraint validation》《Form submission algorithm》《The lang and xml:lang attributes》《Event loops》《Timers》《Rendering》《Origin》《Module scripts》《Preparing a script》 | D0 1 / 3 / 4 / 5 / 6、D2 1 |
| **ECMA-262** | 《Language Types》、抽象操作、词法环境与 TDZ、原型内部方法（`[[Get]]` / `[[Construct]]`）、`this` 绑定规则、迭代器协议、生成器语义、《Modules》《Source Text Module Records》《Cyclic Module Records》《ResolveExport》《Module Evaluation》《Import Calls》 | D0 3 / 4、D2 1 |
| **DOM Standard** | 《Events》（`EventTarget` / `Event`）、`AbortController` | D0 3 / 4 / 5 / 6 |
| **Fetch Standard** | 请求与响应模型 | D0 4 / 5 / 6 |
| **WHATWG URL Standard** | URL 解析算法（状态机） | D0 6 |
| **Encoding Standard** | 编码嗅探；`<meta charset>` 的 1024 字节位置约束 | D0 1 |
| **Infra Standard** | 基础数据结构 | D0 3 / 7 |
| **HTML-AAM**（HTML Accessibility API Mappings） | 标签 → role 的映射 | D0 1 |
| **WAI-ARIA** | ARIA 属性与规则 | D0 1 / 7 |
| **W3C《Accessible Name and Description Computation》** | 可访问名的计算顺序 | D0 1 |
| **WCAG 2.2** | 对比度公式与相对亮度 | D0 1 |
| **ECMAScript Internationalization API**（ECMA-402） | `Intl` 格式化与时区 | D0 7 |
| **Paint Timing / Layout Instability API** | CLS 的定义与计算；`width` / `height` 与预留空间的关系 | D0 1 / 5 |

### CSS 规范（W3C）

| 规范 | 引用的条款名 / 内容 | 章节 |
|---|---|---|
| **CSS Cascading and Inheritance Level 5** | 《Cascade Sorting Order》《Cascade Origins》《Cascade Layers》 | D0 2 |
| **Selectors Level 4** | 《Calculating a selector's specificity》、`:focus-visible` | D0 1 / 2 |
| **CSS Display** | 《Formatting Contexts》 | D0 2 |
| **CSS Box Model** | 《Box Model》《Collapsing Margins》 | D0 2 |
| **CSS Values and Units** · **CSS Color 4** · **CSS Logical Properties** | 单位、色彩表示、逻辑属性 | D0 2 |
| **CSS Flexible Box Layout Level 1** | 《Flex Layout Algorithm》 | D0 2 |
| **CSS Grid Layout Level 1** | 《Track Sizing Algorithm》 | D0 2 |
| **CSS Positioned Layout** | 《Stacking Contexts》 | D0 2 |
| **Media Queries Level 4** / **CSS Conditional Rules** | 媒体查询求值 | D0 2 |
| **CSS Containment Level 3** | 容器查询 | D0 2 |
| **CSSOM View** | 几何接口、`devicePixelRatio` | D0 2 / 5 |
| **CSS Will Change** / **Compositing** | 合成层与提升条件 | D0 5 |

### IETF RFC（HTTP 部分按 RFC 名称引用）

| RFC | 支撑的内容 | 章节 |
|---|---|---|
| **RFC 9110《HTTP Semantics》** | 方法与状态码的语义（安全 / 幂等性质） | D0 6 |
| **RFC 9111《HTTP Caching》** | 缓存判定算法、`no-cache` vs `no-store` | D0 6 |
| **RFC 9112《HTTP/1.1》** · **RFC 9113《HTTP/2》** · **RFC 9114《HTTP/3》** | 协议演进与两处队头阻塞 | D0 6 |
| **RFC 6265《Cookies》** | Cookie 的属性与作用域 | D0 6 |

### 工具官方文档（无标准化组织规范）

这些主题**不由标准化组织定义**，"以谁为准"的判断因此不同 —— 各章头部会显式说明。

| 来源 | 支撑的内容 | 章节 |
|---|---|---|
| **TypeScript 官方文档与 `tsconfig` 参考** | 语言行为与编译选项；涉及"编译后行为"时以它为准 | D2 3 |
| **TC39 ECMAScript 规范** | 运行时语义；涉及"运行时行为"时以它为准 | D2 3 |
| **typescript-eslint 官方文档** | 类型感知的 lint 规则 | D2 3 |
| **esbuild / SWC 官方文档** | 转译边界（含"不做类型检查"） | D2 3 |
| **Node.js 官方文档** | 模块解析算法、`exports` 条件导出、双包危害、`.nvmrc` / `engines` | D0 7、D2 1 / 2 |
| **npm 官方文档** | `package.json` 字段、lockfile、`npm ci`、workspaces、`peerDependencies` | D0 7、D2 2 |
| **pnpm 官方文档** | 内容寻址与硬链接布局 | D2 2 |
| **SemVer 规范**（`semver.org`） | "最左侧非零位"规则、预发布匹配 | D2 2 |
| **Changesets / Nx / Turborepo 官方文档** | 版本发布流程、任务编排与缓存 | D2 2 |
| **Git 官方文档与 Pro Git** | 内容寻址与快照模型（**非标准化组织规范**） | D0 7 |
| **ESLint 官方文档** · Configuration Files | flat config 的文件名与优先级、向上查找算法、`extends` 三元语义、`ignores` 的两种身份、级联合并"后者覆盖前者"、不对配置文件做类型检查 | D1 1 |
| **ESLint 官方文档** · Command Line Interface | `--fix` / `--fix-dry-run` / `--fix-type`、`--max-warnings` 的"严格大于"语义与 `--quiet` 的交互、`--cache` 的三条反直觉行为、退出码 0 / 1 / 2 | D1 1 |
| **ESLint 官方文档** · Custom Rules | 规则的 visitor 执行模型、`:exit` 与代码路径事件、`context` 字段集合与"severity 被剥离"、**修复后重跑所有规则最多 10 次**、冲突修复无法指定、`meta.fixable` 强制 | D1 1 |
| **ESLint 官方文档** · Migrate to v10.x | **v10.0.0 起旧配置格式不再被支持**、Node 版本要求、`eslint:recommended` 变化、配置查找算法默认变更 | D1 1 |
| **Prettier 官方文档** · Integrating with Linters | 职责边界原话（格式 vs 质量）、推荐 `eslint-config-prettier`、对 `eslint-plugin-prettier` 的"generally not recommended"与三条缺点 | D1 1 |
| **Stylelint 官方文档** · Configuring | 配置文件格式与"未来可能移除"清单、100+ 规则默认全关、五条通用 secondary options、`overrides` 中 `customSyntax` 替换而其余追加、`ignoreFiles` 覆盖默认忽略 | D1 1 |
| **EditorConfig** · `editorconfig.org` 与 `editorconfig-specification` | 向上查找 / `root=true` 截止 / 同文件内后出现者优先（**非标准化组织规范**） | D1 1 |
| **Husky 官方文档** · Get Started | `husky init` 的行为、`prepare` 脚本、`HUSKY=0` 全局禁用、`.husky/pre-commit` 为普通 shell 文件 | D1 1 |
| **lint-staged README** | 输入是 git index 路径、**五次 git 操作与备份 stash**、`--no-hide-partially-staged` 的代价、失败回滚语义、`--concurrent` 与子任务串行、glob 重叠竞态 | D1 1 |
| **Git 官方文档** · `githooks` | 四个钩子的精确语义（`pre-commit` 无参数且在获取提交信息之前、`prepare-commit-msg` **不受 `--no-verify` 抑制**、`commit-msg` 入参为消息文件名、`pre-push` 参数与 stdin 格式）、钩子目录与执行位、**钩子不随 clone 分发** | D1 2 |
| **Conventional Commits 1.0.0** | 结构模板、MUST 条款（type / scope / description / body / footer）、**大小写不敏感的唯一例外**、`BREAKING CHANGE` 的两种写法与两处特例、**强制的 type 只有 `feat`/`fix`**、与 SemVer 的映射（**社区规范，非标准组织标准**） | D1 2 |
| **commitlint 官方文档** · Getting started / Local setup / CI setup / Rules configuration | `commit-msg` 钩子的必需性与落地命令、**severity 为闭区间 `[0..2]`**、规则配置为数组三元素（无裸数字写法）、`never` 的反转语义、默认 11 个 type、v8 / v21 的输出行为变化、CI 的 `--from`/`--to` 与 **`fetch-depth: 0`** | D1 2 |
| **Commitizen README**（cz-cli） | adapter 机制与 `config.commitizen.path`、`git cz` / `cz` 入口、`cz-` 前缀约定、**"Commitizen or Commit Hooks — Both!"**（与钩子并存而非替代） | D1 2 |
| **conventional-changelog README** | "Generate a CHANGELOG from git metadata"、解析/过滤/写出与 `conventional-recommended-bump` 的分工、推荐的高层工具（**导航型入口页，无 CLI 示例、无 type→SemVer 映射表**） | D1 2 |
| **Git Flow 原文**（nvie.com） | 五种分支的职责与合并方向、`--no-ff` 与"版本号在切发布分支时确定"、**作者 2020-03-05 的反思注记**（"被当成教条或万能药"、"持续交付的团队应改用更简单的工作流"）（**个人博客，非标准**） | D1 2 |
| **Trunk Based Development 站点** | 定义（单一 trunk + 抵御长分支压力）、短分支的两条边界、**四项硬性要求（每 24 小时提交 / pre-integrate 构建 / 构建服务器 / 不破坏构建）**、feature flags 与 branch by abstraction、release 分支的两种做法（**实践汇编站，非标准**） | D1 2 |
| **GitHub 官方文档** · CODEOWNERS | 三个位置与优先级、**"最后匹配的 pattern 生效"**、与 gitignore 的三处语法差异、**写权限与组织团队的硬性要求**、**草稿 PR 不触发**、任一 owner 批准即可、**CODEOWNERS 自身的自我授权盲区**、3 MB 上限 | D1 2 |
| **GitHub 官方文档** · PR 模板 | 三个单模板路径与两个多模板目录、**大小写陷阱**、必须合并进默认分支、`template` 查询参数、**`config.yml` 属议题侧（页内未提及）** | D1 2 |
| **Google 工程实践** · Code Review（overview / standard / speed） | **批准标准**（"确实改善整体代码健康度"即应倾向批准）、"不存在完美代码"与追求持续改进、`Nit: ` 前缀、审查者 8 项清单、**"一个工作日"响应上限**、响应时间比整流程时间更重要、拆分大 CL（自述为 Google 内部流程的权威描述） | D1 2 |
| **ESLint 官方文档** · Configure Rules | severity 三取值与官方对 `"warn"` 的使用场景（**引入一条最终会设为 error 的新规则** —— 渐进接入的唯一官方依据）、按 `files` 覆盖级别、合并语义、**内联注释优先级最高**、禁用注释三形式与"谨慎使用"五条、`reportUnusedDisableDirectives` | D1 3 |
| **ESLint 官方文档** · Command Line Interface（Suppressions / Concurrency / Cache） | `--suppress-all` 的"只在新违规出现时被通知"、**未使用抑制项默认退出码 2**、`--prune-suppressions`、**`--concurrency` 默认 `off`**、`--cache-strategy` 的 `content` 使用场景、`--cache-location` 的尾部斜杠注意事项 | D1 3 |
| **ESLint 官方文档** · Share Configurations | `eslint-config-*` 与 `@scope/eslint-config*` 命名、**直接 `export default` 导出（无 `configs` 字段）**、**flat config 无短名简写**、eslint 走 `peerDependencies` 而插件走 `dependencies`、**不能与 `--config` 同用** | D1 3 |
| **Turborepo 官方文档** · Caching | **global hash 与 task hash 双哈希**及其输入项、**任务确定性前提**、`outputs` 的默认行为与"对 linter 没问题"、命中时回放日志、**`--force` 禁读不禁写**、三个"缓存反而更慢"的场景、`--dry` / `--summarize` 排障 | D1 3 |

---

## 四、官方文档的推荐阅读入口

**课程给出的"读哪些页"的清单**（对应 §7.4）：

| 工具 | 值得逐字读的机制页 |
|---|---|
| Webpack | **Concepts** 系列 |
| Vite | **Why Vite**、**Dependency Pre-Bundling** |
| Rollup | **Plugin Development** |
| Rspack | **migration 指南** + `rspack-compat` 仓库 |

**读文档的判据**：

> **读到「已知限制 / deprecated」段落时，停下精读。** 那是坑的官方来源。

---

## 四、本书未使用的来源

**以下类型的来源未被本书采用**，列出来是为了说明取材边界：

| 类型 | 为什么不用 |
|---|---|
| 二手技术博客 / 公众号文章 | 结论可能滞后或转述失真，且无法确认一手来源 |
| 厂商营销页的性能对比图 | 无法确认测试条件，且是**厂商自测** |
| 社区问答（Stack Overflow 等） | 答案质量与时效差异大，不适合作为书籍依据 |
| 未标注版本的教程 | 配置项默认值随版本变化 |

**本书中所有性能倍数均标注为「厂商公开口径」**，并明确提示需自测 —— 见 `decisions/tool-selection.md` 第四节。

---

## 六、复核建议

工具链演进速度快。**阅读本书时若发现某条版本相关结论与当前官方文档不符，以官方文档为准。**

建议的复核顺序：

1. 先查该工具的官方 **migration / breaking changes 页** —— 官方承认的变更，性价比最高
2. 再查对应配置项的**官方 API 文档** —— 确认默认值有没有变
3. 最后查**发布记录 / 官方博客** —— 确认版本时间线

**复核后请更新**：对应章节的结论 + `METADATA.md` 的最后更新日期 + `CHANGELOG.md` 记一条。

# D0 第 4 章 · 语言的深水区

> **本章定位**：入门轨道D0 第 4 章。**深度标准：接触规范条款、接入浏览器渲染管线。** D0 第 3 章建立了"规范定义的算法"这一视角，本章用它拆开 JavaScript 里最常被当成"玄学"的四件事：原型链、`this`、事件循环、异步取消。
>
> **对应地图节点**：`D0.L2.01`（原型链与继承、`class` 的本质）· `D0.L2.02`（闭包、`this` 绑定、执行上下文）· `D0.L2.03`（事件循环：宏任务 / 微任务）· `D0.L2.04`（迭代器与生成器）· `D0.L2.05`（Promise 组合子、并发控制、超时与取消）· `D0.L2.06`（`fetch` 的正确用法与错误处理陷阱）
>
> **前置**：`D0.L1.13`（作用域与词法环境）· `D0.L1.17`（Promise 与微任务基础）· `D0.L1.23`（HTTP 基础）
>
> **两段式说明**：`D0.L2.03`（事件循环）的**基础模型**已在 D0 第 3 章 §3.6 给出（一任务 → 清空微任务 → 可能渲染）。本章 §4.4 做**完整规范化展开**：多任务队列、渲染时机的判定、`requestAnimationFrame` 的位置、长任务与让出主线程。这是刻意的两段式——先能用，再讲全。
>
> **规范引用约定**：按**条款名**引用，不写节号。涉及的规范：**ECMA-262**（原型内部方法、`this` 绑定、迭代器协议、生成器语义）、**HTML Standard**（Event loops、Timers、Rendering）、**DOM Standard**（`AbortController`）、**Fetch Standard**（请求与响应模型）。
>
> **读完能做到**：解释"为什么改了原型所有实例都变""为什么方法赋值给变量后 `this` 丢了""为什么事件回调不一定早于 `setTimeout`""为什么 `fetch` 拿到 404 却不报错"。

---

## 4.1 属性查找与原型链：对象的内部方法

### 对象是"属性的集合"，而属性有描述符

ECMA-262 里，对象的每个属性都带一组描述符：

| 描述符 | 含义 | 默认值（用 `defineProperty` 定义时） |
|---|---|---|
| `value` | 值 | `undefined` |
| `writable` | 可否改写 | `false` |
| `enumerable` | 是否出现在 `for...in` / `Object.keys` 中 | `false` |
| `configurable` | 可否删除、可否改描述符 | `false` |

**访问器属性**则用 `get` / `set` 代替 `value` / `writable`。

`enumerable` 这一位是很多"为什么它没被遍历到"的答案来源：`class` 的方法、`Object.prototype.toString` 都是不可枚举的。

### `[[Prototype]]` 是内部槽，不是属性

这是一个必须分清的区别：

| 概念 | 形态 | 谁能看到 |
|---|---|---|
| **`[[Prototype]]`** | 对象的**内部槽**（规范用双括号表示内部槽） | 通过 `Object.getPrototypeOf(obj)` 读取 |
| `__proto__` | `Object.prototype` 上的一个**访问器属性** | 是个后加的历史兼容接口，不应在新代码中使用 |
| **`prototype`** | **只有函数对象**才有的普通属性 | 用于 `new` 时设置实例的 `[[Prototype]]` |

一句话区分：**`obj.__proto__` 与 `Object.getPrototypeOf(obj)` 读的是同一个内部槽；而 `Fn.prototype` 是函数身上一个独立属性。**

### 属性读取走的是规范算法

读取 `obj.x` 触发 ECMA-262 的**内部方法 `[[Get]]`**，其算法是：

```text
① 在 obj 自身属性里找 x → 找到就返回
② 没有 → 取 obj.[[Prototype]]，对它重复步骤 ①
③ 直到 [[Prototype]] 为 null → 返回 undefined
```

**关键推论：属性查找是"运行时递归"，不是"复制"。** 所以：

```js
const proto = { hello() { return "hi"; } };
const a = Object.create(proto);
proto.hello = () => "changed";     // 改原型
a.hello();                          // "changed" —— 立即生效
```

`a` 身上从来没有 `hello`。每次访问都在沿链查——这是"改了原型，所有实例都变"的唯一解释。

### 原型链的终点与几个判断方法

```text
实例.[[Prototype]] → 构造函数的 prototype → Object.prototype → null
```

| 判断方式 | 范围 |
|---|---|
| `"x" in obj` | **含原型链** |
| `Object.hasOwn(obj, "x")` | **仅自身**（替代 `obj.hasOwnProperty`，后者会被同名属性遮蔽） |
| `Object.keys(obj)` | 仅自身 + 可枚举 |
| `for...in` | **含原型链** + 可枚举（这是它不适合遍历数组的原因） |

### 属性遮蔽（shadowing）

给实例写一个与原型同名的属性，会把原型上的"盖住"——但**只对读取该实例生效**，原型与其他实例不受影响：

```js
const proto = { n: 1 };
const a = Object.create(proto);
a.n = 2;
proto.n;  // 仍是 1
```

---

## 4.2 `class` 的本质：语法糖，但有硬性差异

### 它确实是语法糖

`class` 不引入新的对象模型。下面两段在原型结构上等价：

```js
class A { constructor(x) { this.x = x; } hi() { return 1; } }

function B(x) { this.x = x; }
B.prototype.hi = function () { return 1; };
```

### 但有五处不可忽略的差异

| 差异 | 原因 |
|---|---|
| **类声明有 TDZ** | 与 `let` 同规则：绑定存在但不初始化，声明前访问抛 `ReferenceError` |
| **类体自动严格模式** | 类内部代码不会退化为非严格模式 |
| **必须用 `new` 调用** | 直接调用会抛 `TypeError`（普通构造函数不会） |
| **方法不可枚举** | 因为 `enumerable: false`，所以不会出现在 `for...in` / `Object.keys` 里 |
| **`super` 能工作** | 依赖一个普通函数没有的内部槽 `[[HomeObject]]` |

### `new` 到底做了四件事（ECMA-262 的 `[[Construct]]`）

```text
① 创建一个新对象，把它的 [[Prototype]] 设为 F.prototype
② 把 this 绑定到新对象，执行函数体
③ 若函数体返回「对象」，则用该返回对象
④ 否则返回步骤 ① 创建的新对象
```

第 ③ 步解释了一个常见困惑：**构造函数里 `return` 一个对象会替换掉实例；`return` 一个原始值则被忽略。**

```js
function F() { this.a = 1; return { b: 2 }; }
new F();    // { b: 2 } —— 实例被替换了
function G() { this.a = 1; return 42; }
new G();    // { a: 1 } —— 原始值被忽略
```

### `extends` 会连两条链

```js
class Child extends Parent {}
```

`extends` 不是"复制方法"，而是设置**两个** `[[Prototype]]`：

| 谁的原型 | 指向 |
|---|---|
| `Child.prototype.[[Prototype]]` | `Parent.prototype` —— 实例属性查找走这条 |
| `Child.[[Prototype]]`（构造函数自身） | `Parent` —— 静态方法继承走这条 |

这解释了一个现象：**静态方法也能被继承**，因为构造函数自己也在一条原型链上。

### `super` 为什么必须用 `[[HomeObject]]`

`super.method()` 的语义不是"找父类"，而是：

> **沿 `[[HomeObject]]`（方法被定义时所在的那个对象）的 `[[Prototype]]` 找到方法，再以当前 `this` 调用它。**

所以把方法取出来孤立调用时 `super` 仍然可用（它认的是定义位置），这与 `this`（认的是调用位置）刚好相反。这是"`this` 动态、`super` 静态"的准确含义。

### 为什么"组合优于继承"

| 继承的问题 | 机制原因 |
|---|---|
| 脆弱的基类（fragile base class） | 基类改一个方法，可能破坏所有子类的隐含假设 |
| 深层链的查找成本 | `[[Get]]` 沿链递归，链越深访问越慢 |
| 单继承的表达限制 | 一条 `[[Prototype]]` 链无法组合多个来源 |
| 类型耦合 | 子类依赖基类的实现细节，而非契约 |

---

## 4.3 闭包与 `this`：两个绑定，两套规则

### 闭包是词法环境的直接推论

D0 第 3 章 §3.2 说过：函数对象会记录它定义时的词法环境（规范里的函数内部槽 **`[[Environment]]`**）。

于是"闭包"不需要单独定义——**它就是"函数 + 它记住的那个环境"**：

```js
function counter() {
  let n = 0;
  return () => ++n;
}
const c = counter();
c();  // 1
c();  // 2   —— n 没有被回收，因为它仍被返回的箭头函数引用
```

两种常见用法与一个代价：

| 用法 | 说明 |
|---|---|
| 私有状态 | 外部无法直接读写 `n`，只能通过暴露的函数 |
| 函数工厂 | 每次调用 `counter()` 得到**独立**的环境，互不干扰 |
| **代价** | 被闭包引用的环境**不会被回收**——这是内存增长与"泄漏"的一类来源（见 D0 第 5 章与 D5 领域） |

### `this` 的四条绑定规则，加一个例外（按优先级从高到低）

`this` **在函数被调用的那一刻**根据调用形式决定，与函数定义位置无关（箭头函数除外）：

| 优先级 | 规则 | 判定依据 | `this` 是谁 |
|---|---|---|---|
| 1 | **`new` 绑定** | 用 `new` 调用 | 新创建的实例 |
| 2 | **显式绑定** | `call` / `apply` / `bind` | 传入的第一个参数 |
| 3 | **隐式绑定** | `obj.fn()` | `obj`（即 `.` 左边那个） |
| 4 | **默认绑定** | 直接 `fn()` | 严格模式 / 模块中为 `undefined`；非严格模式为全局对象 |
| — | **箭头函数** | 无自己的 `this` | 取定义处外层环境的 `this`（不参与以上四条） |

### "`this` 丢失"的机制

```js
const obj = {
  name: "A",
  hi() { return this.name; },
};

obj.hi();              // "A"      —— 隐式绑定成立
const f = obj.hi;
f();                   // undefined —— 调用形式是 f()，没有 "." 左边的东西
```

**关键点：隐式绑定看的是"调用时的语法形式"，不是"函数从哪来"。** 一旦把方法取出来单独调用，那层"调用者信息"就没了。

两种修法各有机制差异：

```js
const f1 = obj.hi.bind(obj);   // bind 返回一个"永久绑定"的新函数，后续无法被隐式绑定改写
const f2 = () => obj.hi();     // 箭头函数在定义处捕获 this
```

`bind` 的绑定**不可再被覆盖**（即使后续用 `call` 传入别的对象）；箭头函数的 `this` 也**不可被 `call` 改写**——两者都是"免疫"，但免疫的对象不同。

### `this` 与调用栈

规范为每次函数调用建立**执行上下文**，并压入**执行上下文栈**。`Error.prototype.stack` 展示的正是这条栈的文本化结果。"栈溢出（`RangeError: Maximum call stack size exceeded`）"就是栈深超过上限。

---

## 4.4 事件循环的完整模型

D0 第 3 章 §3.6 给出的是三步简化版。现在补全规范细节——这些细节解释了三条常被当成"随机现象"的行为。

### 任务队列不止一条

HTML Standard《Event loops》按 **task source（任务源）** 对任务分类，常见的有：

| task source | 典型任务 |
|---|---|
| timer | `setTimeout` / `setInterval` 到期 |
| DOM manipulation | 用户交互事件（点击、输入） |
| networking | `fetch` 响应到达、`XMLHttpRequest` 回调 |
| history traversal | `popstate` / `hashchange` |
| posted message | `MessageChannel`、`postMessage` |

**规范只要求"从某个任务源取一个任务执行"，并没有规定各队列之间的固定优先序。**

**推论（很重要）**：**"用户点击的回调一定早于 `setTimeout(0)`"这个说法不成立**。浏览器可以自行选择取哪一条队列的任务。只有**同一队列内部**才有序。这与"微任务一定早于下一个任务"的确定性形成鲜明对比——后者是规范写死的，前者不是。

### 微任务检查点何时执行

微任务队列在**每个任务执行完毕后**被完整清空（包括执行期间新追加的微任务）。此外，某些操作也会显式触发检查点。

由此推出两条实用结论：

- 微任务是**"任务内的收尾工作"**，所以 `Promise.then` 一定早于同级 `setTimeout`。
- 但微任务**不能跨帧取巧**：往微任务里无限追加，检查点永不清空，渲染永远等不到（D0 第 3 章 §3.6 的"微任务活锁"）。

### 渲染时机不是每轮都发生

一次事件循环迭代**不一定**包含渲染。渲染由浏览器按显示刷新节奏决定（60Hz 屏幕约每 16.7ms 一次机会），这个时机叫 **rendering opportunity**。

HTML Standard 的 `update the rendering` 步骤里，回调与阶段的相对顺序是**固定**的：

```text
update the rendering：
  ① 执行 requestAnimationFrame 回调      ← 你的动画代码在这里
  ② 样式计算（Recalc Style）
  ③ 布局（Layout）
  ④ 绘制（Paint / 生成绘制指令）
  ⑤ 合成（Composite；可能交给合成线程）
```

**这就是 `requestAnimationFrame` 优于 `setTimeout` 做动画的原因**：它在渲染步骤的**内部**、且**紧贴**样式计算之前执行；`setTimeout(…, 16)` 则可能落在任意位置，甚至一帧内跑两次、或跨帧错过。

### 四种"稍后执行"的排队位置

| API | 归属 | 相对渲染的位置 |
|---|---|---|
| `queueMicrotask` / `Promise.then` | 微任务 | 渲染**之前**，且早于下一个任务 |
| `requestAnimationFrame` | 渲染步骤内的回调 | **就在**渲染前段 |
| `setTimeout` | 任务（timer 源） | 渲染之前，但**队列优先序无保证** |
| `requestIdleCallback` | 空闲回调 | 渲染**之后**（若无空闲则可能长期不执行） |

### `setTimeout` 的两个陷阱

**一、嵌套延迟有下限。** HTML Standard 的《Timers》规定：**嵌套层级超过 5 层的定时器，最小延迟被抬到 4ms**。所以"连续用 `setTimeout(fn, 0)` 切片"会越来越慢。

**二、ID 是"清除"用的，不是"控制"用的。** `clearTimeout` 只能阻止尚未执行的任务。

需要更细粒度的让出主线程时，常见手段是 `MessageChannel`（不走 timer 队列，无 4ms clamp）、或较新的调度 API：

```js
// 概念示例
await scheduler.yield();   // 主动让出主线程，让浏览器有机会渲染与响应输入
```

【待验证】`scheduler.yield`（Prioritized Task Scheduling API）与 `AbortSignal.any` / `AbortSignal.timeout` 的浏览器支持度仍在演进，用前先查目标环境。

### 长任务与输入延迟

**长任务**（long task）的通用定义是**超过 50ms 的连续主线程占用**。它有两个直接后果：

- **渲染被推迟** → 掉帧、滚动卡顿
- **输入无法处理** → 用户点击后要等任务结束才有反馈，这直接抬高 **INP**（Interaction to Next Paint）指标

**机制层面的结论**：`INP` 不只是"事件处理函数要快"，而是**"从输入到下一次渲染之间，主线程有没有被别的东西占满"**。D0 第 5 章会展开这一指标。

---

## 4.5 迭代器与生成器：协议与状态机

### 两个协议，别混为一谈

| 协议 | 要求 | 谁满足 |
|---|---|---|
| **迭代器协议** | 对象有 `next()`，返回 `{ value, done }` | 迭代器本身 |
| **可迭代协议** | 对象有 `[Symbol.iterator]()`，返回一个迭代器 | 数组、字符串、Map、Set、`arguments`、`NodeList`、生成器 |

`for...of` 的实际动作是：**调用 `[Symbol.iterator]()` 拿迭代器，然后反复 `next()` 直到 `done` 为 `true`。**

这解释了"为什么这些都能吃可迭代对象"——它们都只依赖同一套协议：`for...of`、展开运算符 `[...x]`、解构、`Array.from`、`Promise.all` / `allSettled`、`Map` / `Set` 的构造器。

**普通对象不可迭代**（没有 `[Symbol.iterator]`），所以 `for...of` 一个对象会抛 `TypeError`。想遍历键用 `Object.keys` / `entries`。

### 生成器：把"状态机"写成同步代码

```js
function* ids() {
  let i = 0;
  while (true) yield i++;
}
const it = ids();
it.next();  // { value: 0, done: false }
```

三个必须记住的语义：

| 语义 | 说明 |
|---|---|
| **调用生成器函数不执行函数体** | 只返回一个迭代器对象 |
| **`yield` 是挂起点** | 执行到 `yield` 时函数**暂停**，把值交给调用方，局部状态保留 |
| **`next(v)` 把值送进去** | `v` 成为该次 `yield` 表达式的求值结果 |

**这三条合起来意味着：生成器是一个可以外部驱动的状态机。** 它把"手写 `next()` 维护内部状态"的麻烦变成"写同步代码 + 在挂起处打 `yield`"。迭代器在 D0 里大多是"读数据的接口"，而生成器是它的**产出工具**。

`yield*` 是委托：把迭代过程转交给另一个可迭代对象（常用于递归遍历、平铺嵌套结构）。

无限序列是生成器的天然用例——因为它是**惰性**的，不预先计算：

```js
function* naturals() { let n = 1; while (true) yield n++; }
const [a, b, c] = naturals();   // 只取三个，不会死循环
```

### 异步生成器

```js
async function* pages(url) {
  let next = url;
  while (next) {
    const r = await fetch(next);
    const data = await r.json();
    yield data;
    next = data.next;
  }
}

for await (const page of pages("/api/p1")) { /* … */ }
```

`for await...of` 会**依次等待**每个产出——这是"分页拉取"最自然的写法，也是流式处理的基础形态（见 本章 §4.6 的并发代价）。

---

## 4.6 并发控制与取消：Promise 组合子

### 四个组合子的语义差异

| 组合子 | 成功条件 | 失败条件 | 用途 |
|---|---|---|---|
| `Promise.all` | **全部**成功 | **任一**失败即失败 | 并行取多个必需数据 |
| `Promise.allSettled` | 永远成功 | 从不失败 | 需要每个结果（含失败） |
| `Promise.race` | 第一个**有结果**（成败皆可） | 第一个结果若是失败 | 竞速、超时 |
| `Promise.any` | 第一个**成功** | 全部失败才失败（抛 `AggregateError`） | 多镜像取最快可用 |

**注意 `all` 的一个反直觉行为**：任一失败时它立刻拒绝，但**其余 Promise 仍在继续执行**，不会自动取消。所以"失败即停止"需要你自己配取消信号（见下）。

### 串行 vs 并发：`await` 的位置决定一切

```js
// 串行：总耗时 = 三个请求之和
for (const id of ids) { results.push(await get(id)); }

// 并发：总耗时 ≈ 最慢的那个
const results = await Promise.all(ids.map(id => get(id)));
```

区别在于 `await` **在循环内**还是**在结束后**。前者每次都等前一个完成才发起下一个。

### 并发上限：为什么 `Promise.all` 不能直接用于大批量

`ids.map(...)` 会**立刻发起全部请求**。几百个并发请求会耗尽连接数、触发服务端限流。所以需要"并发池"：

```js
async function pool(tasks, limit = 5) {
  const ret = [];
  const running = new Set();
  for (const [i, task] of tasks.entries()) {
    const p = Promise.resolve().then(task).then(
      v => { ret[i] = v; running.delete(p); },
      e => { ret[i] = e; running.delete(p); }
    );
    running.add(p);
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.all(running);
  return ret;
}
```

机制要点：`ret[i] = v` 用**索引坐标**保证结果顺序与输入一致（这也解释了为什么 `Promise.all` 能保证顺序但 `race` 不能）。

### 取消：Promise 本身不可取消

**这是规范层面的限制**：Promise 一旦创建就无法从外部终止它的执行。所谓"取消"只能是**两件事的组合**：

1. **告诉副作用停止**（请求、定时器、文件读写）
2. **让后续的 `then` 不再有意义**（通常靠一个 rejected 的 Promise）

`AbortController` / `AbortSignal` 是**标准的信号机制**：`signal` 被越来越多的 Web API 直接接受。

```js
const controller = new AbortController();

// ① 让请求真的停止
fetch("/api", { signal: controller.signal }).catch(e => {
  if (e.name === "AbortError") { /* 正常路径，不是异常 */ }
});

// ② 也可以在外部取消
controller.abort();
```

**`AbortSignal` 的能力（部分需查支持度）：**

| 用法 | 说明 |
|---|---|
| `AbortSignal.timeout(ms)` | 到点自动中止，无需自己起定时器 |
| `AbortSignal.any([s1, s2])` | 任一信号中止即整体中止（"用户取消 + 超时"的组合） |
| 监听 `signal.addEventListener("abort", …)` | 让自定义异步操作也支持取消 |

### 超时的常见错误写法

```js
// 反例：超时后请求仍在进行，只是不再关心结果
await Promise.race([fetch(url), sleep(3000).then(() => { throw new Error("timeout"); })]);
```

`race` 只决定"谁的值先被采用"，**不会中止输掉的那个**。正确做法是**用信号取消**：

```js
await fetch(url, { signal: AbortSignal.timeout(3000) });
```

记住这条判断标准：**要"停止工作"就必须让信号到达执行者；`race` 只是停止等待。**

---

## 4.7 `fetch`：规范边界与错误陷阱

### 它只在"网络层失败"时拒绝

这是 `fetch` 与大多数人的直觉最大的一处偏差：

| 情况 | `fetch` 的行为 |
|---|---|
| DNS 失败、连接被拒、断网 | **Promise 拒绝**（`TypeError`） |
| HTTP **404 / 500** | **Promise 正常兑现** —— 它是"成功拿到了一个表示错误的响应" |
| CORS 被拒 | **Promise 拒绝**（表现为 `TypeError`，且**不提供细节**） |

所以：

```js
const r = await fetch("/api/x");
if (!r.ok) throw new Error(`HTTP ${r.status}`);   // ← 这一行不能省
const data = await r.json();
```

### 两阶段：头部到达即兑现，body 是流

`fetch()` 的 Promise 在**响应头到达**时就兑现了，**响应体还没下载完**。`Response.body` 是一个**流**，读取它要再 `await` 一次：

| 步骤 | 得到什么 |
|---|---|
| `await fetch(url)` | `Response`（此时只有状态码与头部） |
| `await r.json()` / `.text()` / `.arrayBuffer()` | 解析后的数据（需要等 body 下载完） |

**推论：`await fetch()` 成功 ≠ 请求成功 ≠ 数据可用。** 三个不同的失败点，各自需要判断。

### `Response.body` 只能消费一次

body 是流，读一次就到尽头。所以：

```js
const r = await fetch(url);
await r.json();          // 第一次：正常
await r.json();          // 抛 TypeError: body stream already read
```

需要读两次就先复制：`const r2 = r.clone();`（复制会缓存 body，代价是内存）。

### 常见陷阱清单

| # | 陷阱 | 现象 | 正解 |
|---|---|---|---|
| 1 | 不检查 `r.ok` | 把 404 页面当成功数据解析 | `if (!r.ok) throw` |
| 2 | 不 `await r.json()` | 拿到的是 `Promise` 不是对象 | 必须 await |
| 3 | 不传 `signal` | 组件已卸载，请求还在跑 | `AbortController` |
| 4 | 把 CORS 失败当网络错误 | 只看到 `TypeError`，无任何细节 | 看控制台报错，**无法用 catch 判断原因** |
| 5 | `POST` 不带 `Content-Type` | 服务端解析失败 | 显式设置 |
| 6 | 传对象却不 `JSON.stringify` | 服务端收到 `[object Object]` | 序列化后再传 |
| 7 | 忽略 `credentials` | 跨源请求不带 Cookie | `credentials: "include"` |
| 8 | 重复读 body | `body stream already read` | `r.clone()` 或只读一次 |
| 9 | 用 `fetch` 报上传进度 | 做不到 | 需要 `XMLHttpRequest` 或 `ReadableStream` |
| 10 | 认为"请求成功就不会抛错" | `await fetch()` 抛错时 `r` 不存在 | 在 `try` 内同时处理两阶段 |

### 与D0 第 1 章、D0 第 3 章的接回

`fetch` 是"**任务**"，它的回调进入 networking 任务源（本章 §4.4）。因此：

- 它**不会**被同层的 `try/catch` 捕获（D0 第 3 章 §3.7 的传播边界）。
- 它的回调**不保证**与用户交互回调的执行先后（本章 §4.4 的队列无优先序）。

以及一条来自D0 第 1 章的要求：**加载态与错误态必须显式设计**。用户需要知道"正在加载"还是"失败了"——这是可用性与可访问性问题（`aria-busy`、`role="alert"`），不只是视觉问题。

---

## 4.8 动手

| 任务 | 验收 |
|---|---|
| 用 `Object.create` + 手写 `[[Prototype]]` 关系模拟 `class` 继承 | 说出 `class` 与手写版本的 5 处差异 |
| 构造一次 `this` 丢失并修复（`bind` 与箭头函数各一次） | 说出为什么"取出来调用"就丢了调用者信息 |
| 写一个闭包计数器，再用 Performance / Memory 面板观察其环境不被回收 | 说出这类闭包在什么条件下才构成泄漏 |
| 用 `requestAnimationFrame` 与 `setTimeout(16)` 各写一次动画 | 说出 `rAF` 在 `update the rendering` 里的位置 |
| 连续嵌套 `setTimeout(fn, 0)` 10 层，测量实际间隔 | 说出 4ms clamp 的触发条件 |
| 用生成器实现一个无限自然数序列，只取前 5 个 | 说出"惰性"体现在哪一步 |
| 用 4 个组合子各写一次同场景（3 个请求其中 1 个会失败） | 说出四种失败行为的差异 |
| 实现一个并发上限为 3 的请求池 | 说出为什么 `Promise.all` 不能直接用于 100 个请求 |
| 用 `AbortController` 实现"用户取消"与"3 秒超时"取或 | 说出为什么 `race` 做超时会留下未取消的请求 |
| 用 `fetch` 请求一个不存在的路径 | 说出为什么它**不**抛错，以及正确的判断位置 |

**进阶挑战**：

1. 让 `Response.body` 被读取两次并捕获错误，再用 `clone()` 修复。
2. 写一个"微任务活锁"，并解释为什么它不会冻结事件循环却能冻结渲染。
3. 用 `for await...of` + `fetch` 写分页拉取，并说明它为什么是**串行**的、以及在什么条件下该改成并发。

---

## 4.9 本章常见误区

> **本节已合并为领域级速查表（2026-10-17）。** 本章的误区与事实在 **[D0 第 7 章 §7.11 · D0 常见误区速查表](d0-07-into-engineering.md)** 中按章查（第 1–6 章共用一张表）。
>
> **合并理由**：本章正文已把每个判断完整讲过，原表基本是正文的逐条摘要；六章各设一张这样的表，读者既读不完，也无从横向查阅。

---


## 本章小结

**八条最该记住的结论**

1. **属性查找是运行时沿 `[[Prototype]]` 递归**，不是复制。这解释了"改原型影响所有实例""链越深越慢""继承带来的隐性耦合"。
2. **`class` 是语法糖但有五处硬差异**（TDZ、严格模式、必须 `new`、方法不可枚举、`super` 依赖 `[[HomeObject]]`）。`new` 的第三步是"返回对象则替换实例"。
3. **闭包是 `[[Environment]]` 的直接推论**；它的代价是环境不被回收。**`this` 由调用形式决定**（四条规则 + 箭头函数的例外），"取出来调用"就丢掉隐式绑定。
4. **任务队列有多条且规范不保证它们之间的优先序**；而"微任务在每个任务后清空、且早于渲染"是规范写死的。这解释了确定性从哪来、不确定性从哪来。
5. **渲染时机由 rendering opportunity 决定，未必每轮发生**；`requestAnimationFrame` 在 `update the rendering` 内部、样式计算之前执行——这是它优于 `setTimeout` 做动画的机制原因。
6. **迭代器协议与可迭代协议是两个协议**；生成器是"把状态机写成同步代码"的工具，`yield` 挂起、`next(v)` 注入。
7. **取消需要信号到达执行者**。`Promise.race` 只停止等待；`AbortSignal` 才能停止工作。`Promise.all` 失败时其余请求不会被取消。
8. **`fetch` 只在网络层失败时拒绝**，`4xx/5xx` 是正常兑现；响应体是流且只能读一次——这两点构成绝大多数 `fetch` bug 的来源。

**与地图的衔接**

| 本章内容 | 节点 | 后续在哪用到 |
|---|---|---|
| 原型链、`[[Get]]`、`class` | `D0.L2.01` | D2（TS 的类与类型）、X2（框架的继承与组合）、D4（设计系统的组件抽象） |
| 闭包与内存、`this` | `D0.L2.02` | D5（测试中的 mock 与闭包陷阱）、D0 第 5 章（内存与泄漏） |
| 事件循环完整模型、渲染时机 | `D0.L2.03` | **D0 第 5 章（渲染管线与 INP）**、D5（E2E 的时序等待） |
| 迭代器与生成器 | `D0.L2.04` | D3（构建工具的插件流水线常基于迭代）、X2（流式渲染 / 数据流） |
| 组合子、并发池、取消 | `D0.L2.05` | D5（测试的异步等待）、D6（可观测性中的超时与重试） |
| `fetch` 边界与错误 | `D0.L2.06` | D6（错误监控与上报）、X2（BFF 层的错误契约） |

**下一章预告**：`D0 第 5 章 · 看懂浏览器与网络`——HTML 解析与容错、渲染管线的每个阶段与各自成本、重排与重绘的真实触发条件、合成层与 GPU、Performance 面板的读数方式，以及 HTTP 的报文结构、缓存模型与 DNS/TLS 的开销。

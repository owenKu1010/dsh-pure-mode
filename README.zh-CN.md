# 纯净模式 · DeepSeek Harness 的「本会话不挂载 skill」开关

[English](README.md) | **简体中文**

一个极小的 DSH bundle：在输入栏的权限控件旁加一个开关。开启后，**该会话完全不挂载 skill** ——
`skill` 工具消失，随每个请求一起发送的那份持久 skill 目录也一起消失。

用在该用它的地方：纯问答、写作、临时跑一条命令；或者不希望模型自己判断「目录里某条看起来适用」而擅自加载。

```
[ + ]  [ ⛨ 完全权限 ▾ ]  [ A|B ]  [ (叶子) 纯净模式 ]  [ ✦ 专家 ▾ ]  [ ⏻ PUA ]  [ 模型 ▾ ]
                                      ↑ 这个
```

| 状态 | 看到的样子 | 模型拿到的东西 |
| --- | --- | --- |
| **关**（默认） | 1px 品牌蓝描边、**无底色**、蓝色叶片、正常文字色 | 和原先完全一样 |
| **开** | 同一个描边胶囊被品牌蓝灌满、文字反色、实心叶片 + 圆点 | 没有 `skill` 工具，没有 skill 目录 |

再点一次即恢复，从下一个 step 起生效。

## 先说清楚：这和 dsh-purge 没有关系

名字都带「净化／清洗」的味道，容易误会，所以写在最前面：本插件**与 `dsh-purge` 无关**，
不替代它、不扩展它、也不依赖它。两者解决的问题完全不同：

| | dsh-purge | 纯净模式（本插件） |
| --- | --- | --- |
| 动的是什么 | 指令／提示词层的权威性：打补丁、注入 shim、写 override 文件 | 一个在线会话的工具可见性 |
| 改动落在哪 | profile 里的文件，组合时生效 | 只在该 Agent 的上下文里加一条工具限制 |
| 何时生效 | 需要重启组合 | 下一个 step 生效，不用重启 |
| 怎么撤销 | 回滚补丁／shim／override | 释放限制，工具立刻回来 |
| 作用范围 | 整个 profile | 单个会话 |

它除了 `$DSH_HOME/pure-mode/` 之外不写任何文件，也不读 purge 的状态、不改任何提示词文本。
两者可以装在同一个 profile 里共存，互不影响。

## 为什么需要它

每个会话的每个请求都在付两笔钱：

- `skill` 工具的 schema；
- 一条持久的 `<available_skills>` user 消息，逐个列出所有模型可调用的 skill 及其截断描述。

用得上的会话里，这份目录值这个价。用不上的会话里，它是持续的开销，还是一张「随时可以去加载点什么」的邀请函。
纯净模式就是「一个会话内把这个子系统整个关掉」的那个开关，不改补丁、不改 preset、不碰别的插件。

## 安装

已发布到 npm：**`dsh-pure-mode`**。这是一个标准 DSH bundle（`package.json` 里的 `dsh.bundle.patch`），
装进某个 profile，两条路任选：

**从 npm 装（推荐，不用克隆、不用构建）：**

1. 在 DSH 里打开 **Plugins → Add plugin**，填 `dsh-pure-mode`。
2. 确认 `dsh-pure-mode` 这一行是启用状态，然后**刷新页面**一次。

**从仓库装：**

1. 克隆到磁盘任意位置：`git clone https://github.com/owenKu1010/dsh-pure-mode.git`
2. 打开 **Plugins → Add plugin**，指向克隆下来的目录（本地目录安装）。
3. 确认 `dsh-pure-mode` 这一行是启用状态，然后**刷新页面**一次。

两条路都会把它当作 bundle 解析，插入一行名为 `pure-mode` 的插件；客户端那一半需要刷新一次页面才会出现在输入栏。

前提：组合里挂着随附的 skill 工具（`@deepseek-ai/dsh-tool-skill`，默认 base 组合自带）。除此之外没有别的依赖。

## 用法

- 开关**按会话**保存：每个会话保留自己的选择。
- 从没点过开关的会话，沿用**最近一次**切换留下的值 —— 新会话继承你上一个决定。
- 选择存在 `$DSH_HOME/pure-mode/state.json`，删掉这个文件就一切归零为关。
- **开**很便宜（只追加一条很小的空目录声明）；**关**要重发整份目录 —— 那才是费 token 的方向，
  能决定就尽量在第一条消息之前决定。
- `$DSH_HOME/pure-mode/client.log` 记录每个页面实际加载的客户端 bundle 版本（`build=v4`），
  这样「是不是旧标签页」是查出来的，不是猜出来的。

## 配置

默认只藏 `skill`。要把 skill 相关的其余工具也一并收走（例如技能管理器注册的 `create_skill`），
在 profile 补丁里整行重述 `config`：

```yaml
- id: pure-mode
  name: 'dsh-pure-mode'
  config:
    denyTools: [skill, create_skill]
```

名字必须是该 Agent 能看到的全局工具名。写错不会静默失败：开关会提示「工具隐藏失败」，
宿主日志里带着 `tools.restrict()` 给出的已知工具清单。

## 配套推荐：DSH Skills Manager（建议一起装）

纯净模式是**全有或全无**的开关。要**逐条**管理 skill —— 单个开/关、整个来源开/关、从仓库里浏览安装 ——
请配 **DSH Skills Manager**（作者 [MichengAI](https://github.com/MichengAI)）：

> **[github.com/MichengAI/dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)**
> `@michengai/dsh-skills-manager` · Apache-2.0 · 持续维护中

两者作用在不同层，天然互补：

| | 技能管理器 | 纯净模式 |
| --- | --- | --- |
| 管什么 | 单个 skill、单个来源 | 整个 `skill` 工具 |
| 怎么实现 | `ctx.skills` 注册表里的逐条调用策略 | `agent.ctx.tools.restrict()` |
| 关掉之后 | 每条 skill 保持各自状态 | 整块恢复 |

管理器会把「被你关掉的 skill」报告成 `{ modelInvocable: false, userInvocable: false }`，
所以它一开始就进不了目录、`skill` 工具拒绝加载、`/name` 手势也不认。纯净模式只藏工具，因此
**永远不会把你那边关掉的重新打开**：

- 纯净模式**开**：一个都不挂（包括管理器允许的）；
- 纯净模式**关**：回到「管理器允许什么就是什么」，你在那边关掉的照样不出现、也加载不了；
- 纯净模式开着时去管理器里开关 skill：状态照常写入，关掉纯净模式后按新结果生效。

也就是说：**纯净模式关掉 = 恢复原状，而这个原状已经扣掉了你在管理器里关掉的那些。**

## 实现（就这一段）

在该 Agent 自己的上下文上做一次工具限制，Agent 或插件消失时释放：

```js
agent.ctx.effect(
  () => agent.ctx.tools.restrict({ deny: ['skill'] }),
  'pure-mode: hide the skill tool for this session',
)
```

`@deepseek-ai/dsh-tool-skill` 每一步准备时会把「自己注册的那份 `skill` 定义」和「该 Agent 实际解析到的定义」
做同一性比较。所以被限制掉的工具会**同时**带走模型侧的 schema 和那条持久目录；而从没发布过目录的会话，
干脆一条都不会有。

客户端那一半没有任何权限：它只通过 `ctx.connection.fetch` 注册的、已认证的同源路由 `/api/pure-mode`
读写宿主保存的状态，由宿主决定是否施加限制。UI 是注册进 `conversation.input.left` 槽位的普通 React 组件，
只使用 `--dsw-alias-*` 主题 token。

## 注意事项

- **历史只追加、不回收。** 已经发出去的目录留在对话里继续计费到压缩为止；节省是从会话开头起算，不是回溯性的。
  开 → 关 → 开 这样的来回切，每次都会追加一条替换消息。
- **工具表变化会断开前缀缓存。** 工具定义在请求最前面，所以每次切换都可能让该轮不再复用既有 prompt 缓存。
- **`/skill-name` 手势仍然可用**（针对管理器允许的 skill）。手打 skill 名是用户动作，不是「挂载」，宿主不拦截。
- **作用面是工具，不是注册表。** 其他工具、MCP、插件都不受影响。
- **限制需要「可被限制」的注册。** 若某套组合把 skill 工具注册在 Agent 自身层（而不是祖先层），
  `tools.restrict()` 会拒绝；此时开关会明确报告失败，而不是假装成功。
- 已在 DSH `0.2.2-rc.3` + Windows（Electron 44 / Chromium 152）上验证。除公开服务
  （`tools` / `connection` / `agents`）外没有使用任何版本特定的接口，但其他版本未验证。

## 仓库结构

```
package.json        bundle 清单：dsh.bundle.patch + dsh.client
cordis.patch.yml    插入 `pure-mode` 这一行
index.js            宿主：状态、对账、tools.restrict、/api/pure-mode
client.js           客户端：输入栏开关
locale/{en,zh}.json 插件列表标题/描述 + 开关文案
icon.svg            插件图标
docs/DETAIL.md      插件详情页正文
```

## 许可

MIT，见 [LICENSE](LICENSE)。

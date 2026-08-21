# NovelCode DSH 部署与使用指南

日期：2026-08-21
适用版本：NovelCode DSH `0.1.0`、DeepSeek Harness `0.1.0-rc.8`

## 1. 使用场景

NovelCode DSH 是面向长篇小说的 DeepSeek Harness 产品壳。它负责会话、
工具、审批、任务生命周期和只读 Web 工作台；既有 Narrative V2/GBrain
继续负责小说领域行为，`.narrative/brain` Markdown 仍是唯一长期知识真源。

当前支持两种源码部署：

1. 本地工作站，通过浏览器访问回环地址；
2. 远程 Linux 主机，通过 SSH 端口转发访问回环地址。

当前不提供公网多租户、容器镜像或 npm 发布包。Web 载体没有面向公网的
认证层，不应直接暴露到 Internet。

## 2. 组件关系

一个可运行部署由四部分组成：

- DeepSeek Harness `0.1.0-rc.8`：通用 Agent runtime 和 Web Host；
- 本仓库：小说工具 Bundle、只读 Web Bundle、CLI、确定性领域组件和 Skills；
- Novel Workbench checkout：只读源码依赖，提供 Narrative V2 JSONL service；
- 小说 workspace：存放项目清单、Brain、草稿、revision 和 final ledger。

Novel Workbench checkout 和小说 workspace 必须是两个不同目录。本仓库不会
复制 Narrative V2 源码，也不会把小说正文放入 DSH 事件或 Web RPC。

## 3. 前置条件

- Git；
- Node.js `^22.19.0 || >=24.0.0`；
- pnpm `11.7.0`；
- Bun；
- 一个可读的 Novel Workbench checkout；
- 本机浏览器，或可用的 SSH 端口转发。

确认版本：

```bash
node --version
pnpm --version
bun --version
git --version
```

## 4. 获取并验证源码

```bash
git clone https://github.com/WOO-woo-Waf/novelcode-dsh.git
cd novelcode-dsh
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` 会执行类型检查、构建、63 项合成测试和本地文档链接检查。
测试不读取私人小说内容。

需要验证真实 Narrative V2 seam 时，先设置核心源码路径再执行 smoke：

```bash
export NOVELCODE_DSH_CORE_ROOT=/absolute/path/to/novel-workbench
export NOVELCODE_DSH_BUN_EXECUTABLE=bun
pnpm smoke:real-v2
pnpm smoke:golden-v2
pnpm smoke:host-v2
```

这些 smoke 在系统临时目录创建并删除合成小说，不修改核心源码 checkout。

## 5. 安装固定版本的 DSH

当前插件严格绑定 rc.8，不应让包管理器自动升级到其他 release candidate：

```bash
pnpm add --global @deepseek-ai/dsh@0.1.0-rc.8
dsh --version
```

如果不能使用全局 pnpm，也可以自行维护固定版本的 DSH 安装目录；后续所有
`dsh` 命令必须来自同一个 `0.1.0-rc.8` 安装。

## 6. 配置运行环境

每次启动 DSH Host 前至少提供：

```bash
export NOVELCODE_DSH_CORE_ROOT=/absolute/path/to/novel-workbench
export NOVELCODE_DSH_BUN_EXECUTABLE=bun
export DSH_BUNDLED_SKILL_DIR=/absolute/path/to/novelcode-dsh/packages/dsh-novel-author/skills
```

可选参数：

```bash
export NOVELCODE_DSH_REQUEST_TIMEOUT_MS=120000
export NOVELCODE_DSH_STDERR_LIMIT_BYTES=16384
```

也可以把这些非秘密变量交给 shell profile、进程监督器或私有启动脚本。
不要把模型 API key 写进本仓库、Cordis patch 或小说 workspace。模型 Provider
和凭证由 DSH Profile 管理。

## 7. 安装小说 Bundle

在本仓库根目录构建并安装两个本地 Bundle：

```bash
pnpm build
dsh plugin --profile web add "$PWD/packages/dsh-novel-author" "$PWD/packages/web"
pnpm noveldsh assets
```

安装后重启 `web` Profile。`@novelcode-dsh/novel-author` 提供五个小说工具、
审批和 sidecar；`@novelcode-dsh/web` 只提供 loopback RPC 和七工作面 UI，
不会新增写工具。

### 安装小说导演预设

用户预设默认位于 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/`。复制整个预设
目录，保留两个文件处于同一目录：

```bash
DSH_USER_HOME="${DSH_HOME:-$HOME/.dsh}"
mkdir -p "$DSH_USER_HOME/.agent-presets/novel-author"
cp packages/dsh-novel-author/presets/novel-author/agent.cordis.yml \
  "$DSH_USER_HOME/.agent-presets/novel-author/agent.cordis.yml"
cp packages/dsh-novel-author/presets/novel-author/preset.yml \
  "$DSH_USER_HOME/.agent-presets/novel-author/preset.yml"
```

`pnpm noveldsh assets` 会给出当前 checkout 中 Bundle、Preset 和 Skill 的绝对
路径，可用于排查安装位置。

## 8. 创建或接入小说 workspace

### 新小说

```bash
cd /absolute/path/to/novelcode-dsh
pnpm noveldsh workspace init /absolute/path/to/my-novel
pnpm noveldsh workspace doctor /absolute/path/to/my-novel
```

`workspace init` 只写入 `.novelcode/noveldsh.json` 所有权标记，不创建小说
canon、Brain 或正文。项目初始化仍须在 DSH 会话中通过受审批的
`narrative_project_init` 完成。

### 既有 Novel Workbench V2 小说

包含 `.narrative/v2/project.json` 的 workspace 可直接通过 gate，无需添加
NovelCode 标记。先运行只读检查：

```bash
cd /absolute/path/to/novelcode-dsh
pnpm noveldsh workspace doctor /absolute/path/to/existing-novel
```

损坏的 V2 manifest 会 fail-closed；不要用新标记掩盖损坏的项目状态。

## 9. 启动 Web 工作台

DSH 启动目录决定新会话默认 workspace，因此应从小说目录启动：

```bash
cd /absolute/path/to/my-novel
dsh web --no-open
```

浏览器打开 `http://127.0.0.1:3080`，然后：

1. 在 DSH 设置中配置模型 Provider；
2. 新建 Session，确认 workspace 是当前小说目录；
3. 选择“NovelCode 小说导演”Preset；
4. 先调用 `narrative_project_status`，不要直接生成正文；
5. 打开侧栏“小说工作台”检查七个工作面。

工作台只显示项目、素材、时间/人物知情/状态投影、剧情推演、风格、章节运行
和版本账本元数据，不返回素材、草稿、章节或终稿正文。

## 10. 推荐操作流程

### 10.1 项目初始化

在新书 Session 中要求 Agent：

```text
先执行项目状态和 doctor；如果尚未初始化，提出 Narrative V2 项目初始化方案，等待我的 DSH 原生审批后再执行。
```

### 10.2 素材与风格

```text
登记素材并分析来源；分别维护 what_to_write 和 how_to_write。先提出 Story Contract、Style Constitution 和知识候选，不要自动确认。
```

### 10.3 剧情规划与推演

```text
读取 confirmed canon、时间线、人物知情和当前状态。先做一致性检查，再在 branch sandbox 中推演多个分支；只把我选中的分支编译成 Blueprint proposal。
```

### 10.4 分段写作与审稿

```text
根据 confirmed Blueprint 编译 writing packet，按 segment 写入 workspace 文件；每段执行 handoff、连续性和 craft 评价。聊天中只返回路径、hash、问题和下一步。
```

### 10.5 批准与状态回写

```text
把作者接受的修改形成 approved revision；只从 approved revision 生成 StoryEvent、KnowledgeClaim、状态和伏笔 proposal。由我逐项审批后再进入 confirmed Brain。
```

任何模型参数中的 `author_confirmed` 都不构成授权。Story Contract、长期风格、
Blueprint、章节 revision 和 canon 变更必须经过 DSH 原生审批。

## 11. 验证部署

新 Session 应看到且只看到五个小说工具面：

```text
narrative_project
narrative_source
narrative_memory
narrative_plan
narrative_writing
```

同时确认：

- Skill catalog 中存在 `plot-simulation`、`state-recorder`、
  `style-director`、`continuity-reviewer`；
- “小说工作台”包含项目、素材、状态、推演、风格、章节、版本；
- 状态面能显示 baseline hash、StoryEvent、KnowledgeClaim 和状态投影；
- 拒绝一次高风险审批后，没有产生 confirmed artifact；
- 普通未绑定代码目录无法启动小说 sidecar。

## 12. 远程主机部署

Host 仍只监听远程主机的回环地址。在本地建立 SSH tunnel：

```bash
ssh -L 3080:127.0.0.1:3080 user@remote-host
```

在远程 shell 中进入小说 workspace，设置第 6 节环境变量，然后运行：

```bash
dsh web --no-open
```

本地浏览器访问 `http://127.0.0.1:3080`。不要使用反向代理把该端口直接发布
到公网，也不要尝试用 `--host 0.0.0.0` 绕过 DSH 的回环边界。

## 13. 故障处理

- `set NOVELCODE_DSH_CORE_ROOT...`：Host 没有读取到 Narrative V2 核心路径；
- `workspace cannot be resolved`：Session cwd 不存在或权限不足；
- `sidecar exited`：检查有界 stderr tail，并确认 Bun 和 service entry；
- 工具缺失：重新 `pnpm build`，确认两个 Bundle 位于同一 `web` Profile 后重启；
- 工作台缺失：确认 `packages/web/lib/index.js` 和 `lib/client.js` 均存在；
- Skill 缺失：用 `pnpm noveldsh assets` 核对 `DSH_BUNDLED_SKILL_DIR`；
- confirm 被拒：检查 DSH approval 服务和 Profile 策略，不能用模型字段代替；
- workspace 未绑定：执行 `workspace doctor`，新书再显式执行 `workspace init`；
- stale baseline：重新读取 confirmed Brain snapshot 后重新推演或编译，不要强行提交。

## 14. 升级、回滚与卸载

升级前停止 DSH，并备份小说 workspace。拉取代码后保持 DSH rc 版本不变：

```bash
cd /absolute/path/to/novelcode-dsh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm verify
pnpm build
dsh plugin --profile web add "$PWD/packages/dsh-novel-author" "$PWD/packages/web"
```

重启后先用合成或非关键 workspace 验证。不要同时运行两个 Host 写同一小说；
当前 per-workspace mutation queue 仅在单个 Host 进程内生效。

卸载：

```bash
dsh plugin --profile web remove @novelcode-dsh/novel-author @novelcode-dsh/web
```

随后删除用户 `.agent-presets/novel-author` 目录并重启 DSH。卸载不会删除小说
workspace、Brain、草稿、revision 或 final ledger；原 OpenCode 入口仍可使用同一
Narrative V2 数据。

## 15. 安全与数据边界

- 不要提交 `.env`、模型凭证、小说数据库、日志或私人 workspace；
- GBrain/PGLite/图/向量索引是可重建派生数据，不是第二 canon；
- DSH session event 只记录路径、hash、ID、计数和操作结果；
- Web RPC 只接受 opaque Workspace ID，并由 Host 在 loopback 内解析；
- 长正文始终保留在 workspace 文件，避免进入工具 JSON 和会话日志；
- 公开仓库中的测试 fixture 只能使用合成内容。

如需公网、多用户或多进程部署，必须先增加认证、租户隔离、跨进程锁、密钥
管理、审计和备份恢复能力；当前版本不应被描述为已具备这些生产能力。

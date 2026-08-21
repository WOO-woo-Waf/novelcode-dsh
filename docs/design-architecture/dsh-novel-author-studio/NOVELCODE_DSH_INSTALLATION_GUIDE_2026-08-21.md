# NovelCode DSH 安装与开发验证指南

日期：2026-08-21
适用状态：Phase 0-5 Headless 插件、Host orchestration、小说专项 Skills 与只读 Web Workbench

面向使用者的完整部署、启动、操作、升级和回滚流程见
[部署与使用指南](NOVELCODE_DSH_DEPLOYMENT_USAGE_GUIDE_2026-08-21.md)。本文重点保留开发验证细节。

## 1. 前置条件

- Node `^22.19.0 || >=24`；
- pnpm `11.7.0`；
- Bun 可执行；
- DeepSeek Harness `0.1.0-rc.8`；
- 可读的 Novel Workbench 源码 checkout；
- 一个独立的小说 workspace。不要把 Novel Workbench 仓库根本身当小说 workspace。

## 2. 构建

```bash
git clone https://github.com/WOO-woo-Waf/novelcode-dsh.git
cd novelcode-dsh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm verify
pnpm smoke:real-v2
pnpm smoke:golden-v2
pnpm smoke:host-v2
```

`smoke:real-v2` 只在系统临时目录初始化合成小说，结束后删除，不读取私人小说正文。

`smoke:golden-v2` 额外真实执行 invalid action fail-closed、Story Contract、Style Constitution、Memory OS StoryEvent proposal/review/confirm、branch simulation、Blueprint 编译与确认、writing packet、segment/handoff/evaluate、immutable chapter approval，以及绑定批准正文 hash/locator 的 StoryEvent、KnowledgeClaim、ForeshadowDebt proposals；同样只使用执行后删除的临时合成 workspace。

`smoke:host-v2` 使用真实 DSH Tool Runtime、ApprovalService 和 Narrative V2 sidecar，验证 confirmed Brain snapshot、实时 baseline hash、branch orchestration envelope、两个 proposal 和 Blueprint allowed-once 审批。

## 3. 配置 Host 环境

至少设置：

```bash
export NOVELCODE_DSH_CORE_ROOT=/absolute/path/to/novel-workbench
export NOVELCODE_DSH_BUN_EXECUTABLE=bun
export DSH_BUNDLED_SKILL_DIR=/absolute/path/to/novelcode-dsh/packages/dsh-novel-author/skills
```

可选：

```bash
export NOVELCODE_DSH_REQUEST_TIMEOUT_MS=120000
export NOVELCODE_DSH_STDERR_LIMIT_BYTES=16384
```

不要把 API key 写入 package、Cordis patch 或小说 workspace。模型 Provider 凭证仍由 DSH Profile 管理。

`DSH_BUNDLED_SKILL_DIR` 让 DSH 原生 `dsh-skill-filesystem` 发现插件包内四个版本化小说 Skills。实际安装路径可由以下命令查看：

```bash
pnpm noveldsh assets
```

读取输出中的 `skillsDirectory`，不要假设发布安装后仍位于源码路径。

## 4. 绑定小说工作区

新书目录先显式绑定到独立产品：

```bash
pnpm noveldsh workspace init /path/to/new-novel
pnpm noveldsh workspace doctor /path/to/new-novel
```

这只创建 `.novelcode/noveldsh.json` 产品标记，不会创建 Story Contract、Brain 页面、草稿或 canon。后续仍由经过审批的 `narrative_project_init` 初始化 Narrative V2。已有 `.narrative/v2/project.json` 的 Novel Workbench V2 小说无需补标记，可直接通过 gate。

未绑定的普通编码目录会在 sidecar 启动前被拒绝，避免把全局安装的小说工具误用于其他项目。

## 5. 安装本地插件

先构建，再把本地包加入专用 Web Profile：

```bash
dsh plugin --profile web add /absolute/path/to/novelcode-dsh/packages/dsh-novel-author
dsh plugin --profile web add /absolute/path/to/novelcode-dsh/packages/web
```

两个包内的 `cordis.patch.yml` 分别注册 `@novelcode-dsh/novel-author` 与
`@novelcode-dsh/web`。前者拥有五工具、审批和 sidecar；后者只拥有
loopback Workspace RPC 与 DSH client bundle，不增加工具或写入口。当前版本
均为私有本地包，不从 npm 获取。

如果本地 DSH 版本不是 `0.1.0-rc.8`，先停止，不要让 pnpm 自动选择另一个 rc。社区插件常见的 rc.6 API 不能作为兼容依据。

## 6. 安装小说导演预设

将以下两个文件复制到 DSH 用户预设目录的 `novel-author/`：

```text
packages/dsh-novel-author/presets/novel-author/agent.cordis.yml
packages/dsh-novel-author/presets/novel-author/preset.yml
```

然后在新建会话时选择“NovelCode 小说导演”，并把会话 cwd 绑定到一部小说的 workspace。

四个随包 Skills 为：`plot-simulation`、`state-recorder`、`style-director`、`continuity-reviewer`。它们只提供过程指令；没有确定性编译入口时会要求生成待运行输入，不会声称校验已执行。

优先把插件装入只用于 NovelCode 的独立 Profile。runtime workspace gate 已完成；
Web Workbench 会跟随当前 DSH Workspace，并对未绑定目录显示未绑定状态，不会读取目录正文。

## 7. 验证

新会话中应该只看到以下小说工具：

```text
narrative_project
narrative_source
narrative_memory
narrative_plan
narrative_writing
```

先调用 `narrative_project_status`。空 workspace 应报告尚未初始化，而不是创建旧 `.narrative/state`。需要新书时再明确调用 `narrative_project_init`。

DSH skill catalog 还应显示四个小说 Skills。看不到时检查 `DSH_BUNDLED_SKILL_DIR` 是否指向 `noveldsh assets` 报告的目录，并确认当前 preset 挂载了 `@deepseek-ai/dsh-skill-filesystem` 与 `@deepseek-ai/dsh-tool-skill`。

侧栏底部还应显示“小说工作台”。打开后应有项目、素材、状态、推演、
风格、章节、版本七个工作面。状态面显示 trusted baseline hash、StoryEvent
时间线、KnowledgeClaim 人物知情矩阵和确定性状态投影；版本面只显示
revision/hash/ledger 元数据，不显示章节正文。若入口缺失，确认
`packages/web/lib/client.js` 已构建、Web 包已加入同一 Profile，并重启 Host。

剧情推演前先调用 `narrative_memory_consistency_check`，确认结果包含 `memory_os_snapshot.baseline_canon_hash`。Branch 与章节状态 envelope 优先保存为小说 workspace 内的 JSON，再用现有 `payload_path` 调用；Host 会拒绝 workspace 外路径、调用方 baseline 和 workspace override。

验证高风险审批：

1. 提出 Story Contract 或 Blueprint candidate；
2. 提交 review；
3. 调用 confirm；
4. DSH 必须显示原生审批；
5. 拒绝后不得产生 confirmed artifact；
6. 参数改变后必须重新审批。

## 8. 故障处理

- `set NOVELCODE_DSH_CORE_ROOT...`：Host 没看到领域核心路径。
- `workspace cannot be resolved`：Session cwd 不存在或无权限。
- `sidecar exited`：检查 bounded stderr tail；不要把整份日志贴进会话。
- timeout/abort 后下一次调用会启动新 sidecar，这是安全设计。
- DSH 未显示工具：确认包已经 build，`lib/index.js` 存在，Profile 使用 rc.8，并重启 Host。
- DSH 未显示小说工作台：确认 `@novelcode-dsh/web` 已安装，包内同时存在
  `lib/index.js` 和 `lib/client.js`，且页面从 loopback Host 打开。
- confirm 被拒：确认 Profile 挂载 approval 服务且策略允许询问；模型自填 `author_confirmed` 无效。
- workspace 未绑定：先运行 `pnpm noveldsh workspace doctor <path>`；新书明确执行 `workspace init`，既有 V2 项目检查 `.narrative/v2/project.json`。

## 9. 卸载与回滚

```bash
dsh plugin --profile web remove @novelcode-dsh/novel-author
dsh plugin --profile web remove @novelcode-dsh/web
```

移除预设目录并重启 DSH。插件 dispose 会终止 sidecar；小说 workspace、Markdown Brain、draft、revision 和 final ledger 不被删除。OpenCode 入口仍可继续使用同一 Narrative V2 数据。

# NovelCode DSH Phase 5 Web Workbench Foundation 状态

日期：2026-08-21
状态：DSH 原生七工作面只读基础已完成；交互式 proposal 表单与审批 impact diff 待继续

## 1. 背景

Phase 4 已把 trusted Brain snapshot、branch -> Blueprint 和 approved revision ->
state candidates 接入现有 DSH 五工具面。作者仍只能从聊天工具结果理解小说状态，
难以同时观察时间、人物知情、状态投影、风格基础、章节运行和批准版本。

本阶段新增独立 `packages/web`，复用 DeepSeek Harness `0.1.0-rc.8` 的 client
module、Slot、Connection RPC 和 Workspace identity 合同。它不重写 Narrative V2，
不读取另一个数据库，也不改变现有审批路径。

## 2. 目标

- 在 DSH 原生 sidebar 中提供稳定、可发现的小说工作台入口；
- 用七个工作面映射 Novel Workbench 既有科研与产品结构；
- 从 confirmed Brain 重建时间线、人物知情和世界状态投影；
- 展示素材、Blueprint、Style Lab、writing run、approved revision 和 final ledger 状态；
- 浏览器只提交 opaque Workspace UUID，不接收或构造绝对路径；
- Host 只返回 compact metadata，不返回章节、canon 或参考素材正文；
- 保持五工具、35 action、JSONL sidecar 和 DSH 原生审批合同不变。

## 3. 非目标

- 不在 Web RPC 中创建 proposal、confirm、approve 或 export；
- 不用浏览器状态代替 `.narrative/brain`；
- 不让 GBrain/PGLite 变成 Web 真源；
- 不在本阶段实现正文编辑器、Story graph 布局或 branch compare 表单；
- 不从 Web 直接调用高风险写动作；
- 不修改 `/root/dev/novel-workbench`。

## 4. 架构

```text
DSH browser
  -> @novelcode-dsh/web client bundle
     -> sidebar.footer.action
     -> shell.overlay
     -> /novelcode-workbench snapshot/read
        { workspaceId }
          -> Host workspaceRegistry.get(UUID)
          -> canonical workspace path
          -> read-only compact projection
             -> V2 project/source metadata
             -> confirmed Brain snapshot
             -> deterministic state projection
             -> writing manifests/final ledger metadata
```

浏览器不能提交 filesystem path。Host RPC 使用 `authority: loopback`，只接受
`snapshot/read` 和严格的单字段 Workspace UUID payload。未知 Workspace、未绑定
Workspace、额外字段和写 endpoint 全部 fail-closed。

## 5. 七个工作面

| 工作面 | 当前只读投影 | 后续交互 |
|---|---|---|
| 项目 | V2 状态、基础路径、作者控制 gate、GBrain derived 状态 | 初始化/doctor 引导 |
| 素材 | registry 数量、角色、文件数、analysis revision 状态 | 登记与分析任务表单 |
| 状态 | baseline hash、时间线、人物知情矩阵、状态投影与冲突数 | 时间点/POV 筛选、diff |
| 推演 | Blueprint/branch/pending 页面数量、proposal-only 边界 | branch compare 与 envelope builder |
| 风格 | Style Constitution、Prose Profile、craft lifecycle、修订偏好数量 | evidence/counterevidence 与 judge 分歧 |
| 章节 | writing run、segment 进度、short blocker、批准状态 | writing packet 与 reviewer drill-down |
| 版本 | approved revision、content hash、final ledger 活动版本 | revision diff 与精确批量审批 |

UI 明确提示：所有确认、批准与终稿变更仍在 DSH 会话的原生审批卡完成。
Web 工作台没有隐藏的 mutation RPC。

## 6. Trusted read projection

[`packages/web/src/snapshot.ts`](../../../packages/web/src/snapshot.ts) 读取：

- `.narrative/v2/project.json`；
- `.narrative/v2/source-intake/registry.json`；
- `.narrative/analysis/v2/**` 的 source analysis manifest；
- `.narrative/brain/**/*.md` 的 frontmatter metadata；
- Host orchestration 已验证的 confirmed StoryEvent/KnowledgeClaim；
- `.narrative/drafts/**/manifest.json`；
- `.narrative/v2/final-append-ledger.json`。

它不读取 draft、approved chapter、final novel 或 source 文件正文。Writing run 只返回
run/blueprint/chapter/status/segment/revision/hash；final ledger 只返回
chapter/revision/hash/active。

confirmed Memory OS 页面 malformed 时，状态面整体标为 `invalid` 并隐藏所有
event/knowledge/state 行，避免显示一个静默缺项的伪完整 canon。页面 metadata、
source manifest 或 final ledger 的局部故障则进入 bounded warnings。

## 7. 传输与体积边界

- 单个结构化文件最多读取 2 MiB；
- timeline 最多 200 条；
- knowledge matrix 最多 500 条；
- state projection 最多 300 个 key；
- writing run 最多 100 个；
- final ledger 最多 200 条；
- 状态字符串最多 256 字符，嵌套 JSON 最深三层并限制数组/对象宽度；
- 截断会进入 warnings，不会假装数据完整。

这些边界让 Web 快照保持导航用途。需要正文时仍由作者在 workspace 文件中打开，
不会把长文本复制到 browser RPC 或 DSH session event。

## 8. DSH client 生命周期

浏览器 controller：

- 跟随 current Session 所属 Workspace，若无当前会话则使用 recent Workspace；
- Workspace 切换时 abort 旧请求，不允许旧快照覆盖新书；
- 断线时显示 closed state；Host 恢复或 `connection/reset` 后可刷新；
- 插件 dispose 时停止 Session/Workspace observer 并 abort 请求；
- 通过 `sidebar.footer.action` 和 `shell.overlay` 两个 additive Slot 注册，不替换
  DSH sidebar、conversation 或 details 的 owner。

## 9. 开源复用边界

本阶段对照：

- DeepSeek Harness `141eb6f`：rc.8 client module、Slot、Connection RPC、Workspace 合同；
- AI-Novel-Writer plugin `6ae77d6`：sidebar + overlay 装配与 loopback Host RPC 测试形态。

NovelCode 重新实现自己的投影、controller、UI 和测试。没有复制 AI-Novel-Writer
的 `.vela` 数据模型、小说资产格式或示例正文，也没有引入其 rc.6 runtime。

## 10. 改动范围

新增：

- `packages/web` Host/client package；
- read-only snapshot schema、scanner、RPC、controller、selection observer、UI 与 CSS；
- synthetic snapshot、malformed-memory、RPC、controller、Slot registration 和 package tests。

更新：

- `apps/noveldsh` 资产报告增加 `webPluginPackage`；
- 安装指南增加独立 Web 包安装与卸载；
- root README 与总设计更新当前实现状态。

保持不变：

- Novel Workbench 源码和私人小说 workspace；
- Narrative V2/GBrain 数据模型；
- 5 tools / 35 actions；
- approval capability 与 `proposal_only` 晋升边界；
- Brain 唯一知识真源和 GBrain derived-only 定位。

## 11. 验证计划与当前结果

定向验证：

```bash
pnpm --filter @novelcode-dsh/web typecheck
pnpm --filter @novelcode-dsh/web test
pnpm --filter @novelcode-dsh/web build
```

覆盖：

- 合成 V2 workspace 的七面 compact projection；
- draft sentinel 不进入 snapshot；
- malformed confirmed Memory OS 整体 fail-closed；
- marker-only workspace 不虚构 V2 状态；
- Host RPC 只接受 loopback channel、UUID 和只读 endpoint；
- Workspace 切换 abort stale controller read；
- sidebar/overlay Slot 随 fiber 注册和卸载；
- package 声明 rc.8 client module 且不注册模型工具。

最终结果：

- `pnpm verify`：全部 typecheck/build、63 项测试和 18 个本地 Markdown 链接通过；
- `pnpm smoke:real-v2`：真实 sidecar 初始化与 status 通过；
- `pnpm smoke:golden-v2`：Story/Style/Memory/branch/Blueprint/writing/revision 完整闭环通过；
- `pnpm smoke:host-v2`：真实 DSH Approval、trusted snapshot 与 `proposal_only` orchestration 通过；
- `pnpm pack --dry-run`：Web 包包含 Host `lib/index.js`、browser `lib/client.js`、类型声明、patch 与 README；
- `noveldsh assets`：同时定位 novel-author 与 web 两个产品包。

## 12. 风险与下一步

- DSH client module API 仍是 rc，必须继续锁 `0.1.0-rc.8`；
- 当前快照按打开/刷新重建，超长 Brain 后续需要增量索引和可观测耗时；
- UI 的 Blueprint/branch 页面当前只计数，尚未呈现结构化 world delta 与 viability；
- 原生审批卡显示工具参数，但还没有 proposal/current、canon delta 和 revision 的统一 impact diff；
- temporal/epistemic schema 仍是 NovelCode Host 适配层，尚未进入 Narrative V2 原生 schema；
- 多 Host single-writer、crash/restart 和百万字级浏览器性能仍需故障注入。

下一切片优先实现“branch compare + versioned envelope builder + approval impact preview”，
仍通过现有五工具与原生审批执行，不增加 Web 写后门。

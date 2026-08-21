# NovelCode DSH Phase 2 Memory OS 与剧情推演状态

日期：2026-08-21
状态：已完成；后续 branch/Blueprint 与章节状态闭环见 Phase 3 状态文档

## 1. 变更背景

Phase 0/1 已证明 DSH 可以通过五个稳定工具面、作者审批和 workspace-scoped JSONL sidecar 复用现有 Narrative V2。下一阶段不再接通用 RAG，而是补足长篇小说真正缺失的动态状态：故事时间、人物知情、世界状态投影、伏笔债务、归并谱系、剧情分支和修订学习。

本阶段仍遵守两条硬边界：`.narrative/brain` 是唯一小说知识真源；推演结果在作者选择并经过现有 proposal/review/confirm 流程前不能成为 canon。

## 2. 已完成工作

### 2.1 Memory OS 领域合同

[`packages/memory-model`](../../../packages/memory-model/) 已实现：

- 双时间 `StoryEvent`、有效窗口和证据定位；
- 人物级 `KnowledgeClaim` 与 knows/believes/suspects/disbelieves/unknown；
- confirmed-only `StateProjection` 和 previous-value 冲突检测；
- `ForeshadowDebt`、`EpisodeSummary`、`BranchHypothesis`、`RevisionPreference`；
- episode member lineage audit；
- 修订偏好只有在 confirmed、至少两条证据、至少两次重复且有条件时才可执行。

### 2.2 Branch sandbox

[`packages/simulation`](../../../packages/simulation/) 是纯内存推演内核，完成：

- 已确认事件与人物知情的稳定 baseline SHA-256；
- stale canon 检测；
- candidate-only 事件重放，输入对象不会被改成 confirmed；
- 缺失/前向原因、事件顺序、状态前置条件和人物越权知情检查；
- previous-value 与 missing-next 投影冲突；
- 声明 world delta 与实际 replay delta 对照；
- 未解决 branch conflicts、costs、foreshadow impacts 和确定性候选排序；
- 只有 viable 且 baseline 未过期的结果才能生成 `novelcode-branch-proposal-v1` seed。

该包没有文件、数据库或工具写入能力，不能自行选择、确认或晋升分支。

### 2.3 复用现有 Brain 生命周期

[`packages/memory-adapter`](../../../packages/memory-adapter/) 把 StoryEvent、KnowledgeClaim、ForeshadowDebt、EpisodeSummary 和可行 branch seed 映射成现有 `narrative_memory_propose` 输入：

- StoryEvent -> `canon_event` / L1 candidate；
- KnowledgeClaim、EpisodeSummary、branch seed -> `narrative_memory` / L3_MEMORY candidate；
- ForeshadowDebt -> `foreshadowing` / L1 candidate；
- adapter 不产生 `confirmation`，也不直接写 `.narrative/brain`；
- 大对象后续可写 workspace-local JSON，再通过现有 `payload_path` 传递。

真实 `smoke:golden-v2` 已证明 adapter 产生的 StoryEvent 能通过 Narrative V2 proposal、pending review 和 author confirm 生命周期，而不是形成第二真源。

### 2.4 DSH 作者审批

`@novelcode-dsh/novel-author` 现已用真实 rc.8 `ApprovalService` 验证：

- `allowed-once` 后才执行高风险 action；
- 模型伪造 confirmation 被删除，runtime 注入 `author_confirmed`；
- 用户拒绝时 sidecar action 不执行；
- exact capability 消费后不能重放；
- approval asked/decided 和小说 operational event 均保持 log-only。

## 3. 阶段结束时未完成、现已在 Phase 3 完成

- Narrative V2 schema pack 尚未原生声明 StoryEvent/KnowledgeClaim 的全部字段；当前由兼容 adapter 放入现有 page `data`。
- branch seed 已由独立 compiler 转成带场景、segment、信息边界的 Blueprint proposal，并并行保存 provenance candidate。
- chapter approval 后已能对照 immutable revision hash 与行级 locator，生成 state-delta、人物知情和伏笔 candidate；语义自动抽取与 Web 批量审批仍待实现。
- 多 Agent 最小权限角色、恢复测试、Web timeline/knowledge matrix/branch compare 尚未实现。
- sidecar crash/restart、并发写入和长篇故障注入矩阵仍待补齐。

## 4. 与原计划的偏差

原计划先直接扩展 Narrative V2 action/schema。为了遵守“新项目不影响 Novel Workbench”和“先复用、后迁移”，本阶段先实现纯领域内核与向现有 `narrative_memory_propose` 的兼容适配。这个顺序可以提前验证时间、知情和推演语义，同时不修改原项目；正式 schema 变更仍必须在后续独立评审后进入 Narrative V2。

## 5. 残余风险

- 当前 baseline hash 对完整 confirmed 对象敏感；非语义 metadata 变化也会使分支失效，安全但可能增加重算。
- `stateKey` 继承 Memory OS 的 `entityId:fieldPath` 约定，后续 schema 应限制或转义分隔符。
- candidate knowledge 在 sandbox 内只用于推演；如果没有正文证据和作者确认，不能进入 writing packet。
- 分支 score 只是确定性排序辅助，不能替代作者选择或多头文学评价。

## 6. 下一步

1. 为 Narrative V2 提交独立、可回滚的 schema pack 扩展设计，不直接改本仓库之外的代码。
2. 将已完成的 branch/Blueprint compiler 通过现有五工具面安全暴露，不新增未评审 action。
3. 为已完成的 state recorder 增加可评测的合成抽取器与 Web 批量审批。
4. 建设 DSH Web 的 timeline、人物知情矩阵、状态 diff 和分支对比工作面。
5. 完成 crash/restart、百万字级恢复、并发 reviewer 和最终 ledger 验收。

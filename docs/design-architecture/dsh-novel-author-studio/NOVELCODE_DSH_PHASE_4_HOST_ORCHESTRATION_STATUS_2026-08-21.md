# NovelCode DSH Phase 4 Host Orchestration 状态

日期：2026-08-21
状态：现有五工具面的 deterministic Host orchestration 已完成；Web 表单与语义抽取器待继续

## 1. 背景

Phase 3 已实现 branch -> Blueprint 与 approved revision -> state candidate 两个确定性编译器，但它们仅作为库和 headless smoke 存在。模型如果自行提供 confirmed baseline 或声称已经运行编译器，会削弱 stale-canon、正文证据与 workspace 隔离保证。

本阶段把两个编译器接入 DSH Host，同时保持已有产品合同：五个模型工具、35 个 Narrative V2 actions、Narrative V2 JSONL sidecar 和 `.narrative/brain` 唯一真源都不改变。

## 2. 目标与非目标

目标：

- Host 从 confirmed Markdown Brain 构造可信 Memory OS snapshot；
- 给模型一个可通过 `payload`/`payload_path` 使用的版本化 envelope；
- branch 重放、stale 检查、Blueprint 编译和 state evidence binding 在 Host 内确定性执行；
- 所有输出继续走现有 Narrative V2 proposal/review/confirm；
- 同一小说 workspace 的状态变更在 snapshot 与 sidecar 写入之间串行化。

非目标：

- 不增加 `narrative_simulate` 等第六工具或新 action；
- 不接受模型提交的 confirmed baseline events/knowledge；
- 不直接改 Novel Workbench；
- 不让 GBrain、session event 或 orchestration JSON 成为 canon；
- 不自动 confirm provenance、Blueprint 或章节状态；
- 不在本阶段实现 LLM 正文语义抽取或 Web UI。

## 3. Trusted Memory OS snapshot

[`packages/host-orchestration`](../../../packages/host-orchestration/) 直接读取当前 session workspace 的 `.narrative/brain`：

- 忽略 `staging/`、`archive/` 和无 frontmatter 的普通说明文档；
- 只接受 frontmatter lifecycle/approval_state 为 `confirmed` 的页面；
- 只解析 `story-event/v1` 与 `knowledge-claim/v1`；
- 从结构化 data 重建 StoryEvent、KnowledgeClaim 和 evidence refs；
- confirmed Memory OS 页面字段损坏时 fail-closed，不静默漏掉 canon；
- 检查事件/知情 ID 唯一性；
- 用与 branch sandbox 相同的稳定算法计算 `baselineCanonHash`。

Memory Adapter 现在把结构化 `evidence_refs` 同时写进 page data，旧页面仍可从 frontmatter evidence 兼容读取。`narrative_memory_consistency_check` 的 Host 结果追加 compact `memory_os_snapshot`：只含 hash、事件数、人物知情数和来源页数，不把 canon 正文复制进 session。

## 4. Branch -> Blueprint envelope

入口仍是：

```json
{
  "action": "narrative_blueprint_propose",
  "payload_path": ".novelcode/orchestration/branch-chapter-002.json"
}
```

文件根对象使用：

```json
{
  "schema": "novelcode-branch-blueprint-orchestration-v1",
  "branch": {},
  "candidateEvents": [],
  "candidateKnowledge": [],
  "constraints": [],
  "throughSequence": 12,
  "chapter": {}
}
```

Host 明确拒绝 `baselineEvents`、`baselineKnowledge` 和过期 `branch.baselineCanonHash`。执行顺序：

```text
lock workspace mutation queue
  -> read confirmed Brain snapshot
  -> deterministic simulateBranch
  -> reject non-viable/stale branch before writes
  -> compile branch provenance candidate
  -> compile existing Narrative V2 Blueprint candidate
  -> sidecar narrative_memory_propose
  -> sidecar narrative_blueprint_propose
```

成功结果返回实时 baseline hash、branch provenance proposal id、Blueprint proposal id 和 `promotion_boundary=proposal_only`。若 provenance 已成功但 Blueprint sidecar 失败，结果明确返回 partial completed IDs；已有项保持 candidate，不伪装事务回滚或 canon。

## 5. Approved revision -> state envelope

入口仍是：

```json
{
  "action": "narrative_memory_propose",
  "payload_path": ".novelcode/orchestration/chapter-001-state.json"
}
```

文件根对象使用：

```json
{
  "schema": "novelcode-approved-revision-state-orchestration-v1",
  "manifestPath": ".narrative/drafts/.../manifest.json",
  "approvedRevisionPath": ".narrative/exports/.../revision.txt",
  "approvedContentSha256": "...",
  "throughStorySequence": 12,
  "storyEvents": [],
  "knowledgeClaims": [],
  "foreshadowDebts": []
}
```

Host 强制使用 session workspace，拒绝 envelope 中的 `workspaceRoot`。State Recorder 重新读取 approved manifest/revision，验证全文 hash、segment、行范围、excerpt hash 和人物知情时间，然后逐项调用现有 `narrative_memory_propose`。结果只包含 proposal IDs、revision path/hash 与 promotion boundary。

## 6. Workspace 串行化

[`WorkspaceOperationQueue`](../../../packages/dsh-novel-author/src/workspace-queue.ts) 对会改变状态或依赖一致 snapshot 的 action 按 canonical workspace 串行：

- 同一部小说的 snapshot、编译和 proposal 写入不会与另一个 mutation 交叉；
- 不同小说 workspace 可以并行；
- 等待队列期间收到 abort 时，操作不会开始；
- memory search、graph、review、project/source status 仍保持只读并发。

队列只协调当前 NovelCode DSH Host 进程。多个独立 DSH 进程同时写一部小说仍不受协调，生产部署必须保持 single-writer 或增加跨进程锁。

## 7. 审批与事件

Orchestration envelope 本身只创建 candidates，因此不会制造 confirmation。后续 `narrative_blueprint_confirm`、`narrative_memory_confirm`、章节批准和终稿仍由 existing AuthorCapability + DSH `ApprovalService` 保护。

一次 orchestration 对 session 只写一条 compact operational event，包含 action、success、artifact paths 和 metric keys；不会把 branch bodies、正文或 canon snapshot 写入事件日志。

## 8. 验证

自动化覆盖：

- snapshot 从 confirmed StoryEvent/KnowledgeClaim 重建并计算 hash；
- 忽略 Brain README，拒绝 malformed confirmed Memory OS 页面；
- 拒绝 caller baseline、stale branch、路径逃逸和 workspace override；
- branch/state envelope 经过现有 DSH 工具注册层；
- 同 workspace 串行、跨 workspace 并行与 queued abort；
- 真实 DSH + 真实 Narrative V2 Host smoke：baseline confirm -> Host snapshot -> branch envelope -> 两个 proposals -> Blueprint DSH approval/confirm。

执行命令：

```bash
pnpm verify
pnpm smoke:real-v2
pnpm smoke:golden-v2
pnpm smoke:host-v2
```

## 9. 影响范围

新增 `packages/host-orchestration`；`@novelcode-dsh/novel-author` 内部 bundle 该包并增加 workspace mutation queue；Memory Adapter 增加 evidence round-trip；Skills、system prompt、smoke 和文档更新。

保持不变：Novel Workbench 源码、Narrative V2 action/type schema、五模型工具、JSONL wire、Brain lifecycle、GBrain derived status、原小说项目。

## 10. 残余风险与下一步

- 多 Host 进程没有跨进程 single-writer 锁；
- 多 proposal sidecar 调用只能报告部分成功，当前 Narrative V2 没有通用 batch action；
- envelope 仍由模型或 UI提供 candidate semantics；下一阶段需要合成数据驱动的抽取器与 eval，不允许绕过 evidence binding；
- Web 尚未提供 branch compare、timeline、knowledge matrix、state diff 和 envelope 表单；
- 需要给 proposal review 增加 revision/hash、world delta、信息边界和 partial-state 可视化；
- 继续完成 crash/restart、并发进程、长篇恢复和 final ledger 故障注入。

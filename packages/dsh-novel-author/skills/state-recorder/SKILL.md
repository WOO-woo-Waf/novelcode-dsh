---
name: state-recorder
description: 章节由作者批准后，从不可变正文 revision 提取 StoryEvent、人物 KnowledgeClaim、伏笔状态等候选，并绑定正文证据时使用。
whenToUse: 用户批准章节、要求更新人物/世界状态、维护谁知道什么，或把正文变化沉淀到 Memory OS 时。
metadata:
  product: novelcode-dsh
  version: 1
user-invocable: true
disable-model-invocation: false
---

# State Recorder

只处理 `narrative_chapter_approve` 生成的 immutable revision。开始前核对 writing manifest 的 `status=approved`、revision path、revision id 和全文 SHA-256；任一不一致都停止。

每条候选必须绑定：revision id、全文 hash、chapter/segment、行范围和 excerpt SHA-256。locator 越界、只指向空白、segment 不属于 manifest、excerpt hash 不匹配时不得 propose。

准备 `novelcode-approved-revision-state-orchestration-v1` envelope，包含 manifestPath、approvedRevisionPath、approvedContentSha256、throughStorySequence 与下列候选；禁止提供 workspaceRoot。优先写入 workspace JSON，再通过 `narrative_memory_propose` 的 `payload_path` 执行。

按正文实际发生内容生成：

- StoryEvent：故事时间、叙事位置、参与者、原因和状态 effects；
- KnowledgeClaim：人物自己的 stance、获得时间、可见范围和产生该知情的本章事件；
- ForeshadowDebt：planted/reinforced/misdirected/payoff/resolved 等状态变化；
- 必要时生成 EpisodeSummary 或修订观察，但不得从一次修改直接晋升长期风格规则。

人物知情时间不得早于来源事件，也不得晚于本章状态边界。所有对象保持 candidate，经 `narrative_memory_propose` 进入现有 proposal/review/confirm；不得自动 confirm，也不得把 GBrain/PGLite 写成新真源。

成功结果必须回传相同 revision hash、proposal ids 和 `promotion_boundary=proposal_only`。若当前部署没有识别该 envelope，只能生成 workspace-local 候选输入并标记待校验；不得手工伪造“证据已绑定”。

---
name: plot-simulation
description: 在长篇小说中比较剧情分支、检查因果与状态前置条件、人物知情边界，并把可行分支转成待审 Blueprint 时使用。
whenToUse: 用户要求推演后续剧情、比较多条路线、检查角色为何能这样行动，或从选中分支生成章节蓝图时。
metadata:
  product: novelcode-dsh
  version: 1
user-invocable: true
disable-model-invocation: false
---

# Plot Simulation

先用 `narrative_project` 检查 workspace，再用 `narrative_memory` 只读取 confirmed canon、时间线、人物 KnowledgeClaim、伏笔和当前帧。不得把草稿、向量索引命中或 branch candidate 当成 canon。

每个分支必须显式记录：baseline canon hash、候选事件、原因、世界状态 delta、代价、冲突、伏笔影响和人物知情前置条件。遇到以下任一情况即判为不可执行：baseline 已过期、原因缺失或来自未来、previous state 不匹配、人物在当时不知道行动所需信息、声明 delta 与重放结果不同、存在未解决硬冲突。

先调用 `narrative_memory_consistency_check`，读取 Host 生成的 `memory_os_snapshot.baseline_canon_hash`。准备 `novelcode-branch-blueprint-orchestration-v1` envelope，包含 branch、candidateEvents、可选 candidateKnowledge/constraints、throughSequence 和 chapter；禁止传入 baselineEvents/baselineKnowledge。优先把 envelope 写入 workspace JSON，再用 `payload_path` 调用 `narrative_blueprint_propose`。

只有 Host 重新读取 confirmed Brain、确定性模拟结果为 viable 且 baseline 仍一致时，才会产生两个并行 candidate：

1. `narrative_memory_propose` 保存分支 provenance，保持 proposal-only；
2. `narrative_blueprint_propose` 保存 Narrative V2 接受的章节与 segment 字段。

每个 world delta 必须由一个且仅一个 segment 的 `required_changes` 负责；每个 segment 必须声明 POV 和 `reader_knows`、`pov_knows`、`withheld` 信息边界。随后提交 review，Blueprint confirm 必须等待 DSH 原生作者审批。

成功结果必须包含 `orchestration_schema`、实时 baseline hash、两个 proposal id 和 `promotion_boundary=proposal_only`。若当前部署没有识别该 envelope，只能说明“待运行”；不得在聊天中声称模拟或 stale-canon 校验已经通过。

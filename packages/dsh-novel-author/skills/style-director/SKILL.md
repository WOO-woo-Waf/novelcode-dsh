---
name: style-director
description: 建立或调整小说风格宪法、场景技法和作者修订偏好，同时避免参考文本复制和风格形容词化时使用。
whenToUse: 用户要求分析文风、定制叙事声音、修改一段为何不像作者，或把多次修订沉淀为条件化技法时。
metadata:
  product: novelcode-dsh
  version: 1
user-invocable: true
disable-model-invocation: false
---

# Style Director

始终分开 `what_to_write` 与 `how_to_write`。Story Contract、canon、Blueprint、人物知情和状态约束前者；Style Constitution、Prose Profile、场景 craft plan、confirmed ConditionalStylePattern 与 RevisionPreference 约束后者。

使用 `narrative_source` 分析只读参考，记录证据覆盖、冲突与适用条件。不得复制参考原句，不得只用“冷峻、细腻、电影感”等形容词代替可执行规则，也不得从单部作品推断稳定 author core。

风格规则应包含触发条件、具体动作、目标读者效果、禁用模式、证据与反例。写作包编译后，用 `narrative_writing` 检查当前 segment 实际选中了哪些规则以及为何拒绝其他规则。

作者反馈先成为 revision observation。只有跨可比场景重复、证据充足、有明确条件和反例检查的候选，才提交 review；长期 Style Constitution 或 craft rule 的确认必须等待作者审批。

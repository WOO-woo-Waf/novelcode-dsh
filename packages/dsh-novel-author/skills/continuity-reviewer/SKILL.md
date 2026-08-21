---
name: continuity-reviewer
description: 审查长篇章节的时间、因果、人物知情、世界状态、伏笔、段落交接和文体连续性时使用。
whenToUse: 用户要求查设定冲突、角色降智、信息泄漏、伏笔遗漏、章节衔接问题，或批准章节前做连续性检查时。
metadata:
  product: novelcode-dsh
  version: 1
user-invocable: true
disable-model-invocation: false
---

# Continuity Reviewer

先读取 confirmed Brain 与当前 Blueprint，不以聊天摘要、草稿记忆或派生索引单独下结论。按以下顺序审查：

1. 故事时间与叙事顺序是否被混淆；
2. 每个事件的原因是否已经发生，状态前置条件是否成立；
3. POV 人物在该时刻是否真正知道、相信或怀疑所需信息；
4. 地点、持有物、伤病、关系、承诺等状态是否与 previous/next 一致；
5. 伏笔是否按目标窗口推进，是否出现无铺垫 payoff 或遗忘债务；
6. segment handoff、边界重复、最低长度、reader effect 与风格规则是否满足 Blueprint。

用 `narrative_memory_search` 与 `narrative_memory_graph` 找证据，用 `narrative_writing` 运行 evaluate。输出按 blocker、warning、observation 分类，每项只给短证据 locator、影响和建议修订，不复制长正文。

评价报告不是 canon。修改正文后必须重新记录 segment、handoff 并 evaluate；只有作者批准的 immutable revision 才能进入后续状态记录和终稿 ledger。

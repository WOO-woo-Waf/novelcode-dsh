# NovelCode DSH Phase 3 分支蓝图与章节状态闭环状态

日期：2026-08-21
状态：已完成；现有五工具面的 Host 接入见 Phase 4 状态文档

## 1. 背景与目标

Phase 2 已建立故事时间、人物知情、世界状态投影和 branch sandbox，但“推演结果如何安全进入写作”和“批准正文如何反向维护长期状态”仍缺少确定性边界。本阶段完成两条闭环：

1. viable branch simulation -> provenance candidate + Narrative V2 Blueprint candidate；
2. author-approved immutable revision -> evidence-bound Memory OS candidates。

目标不是替换 Narrative V2/GBrain，也不是增加通用 RAG。`.narrative/brain` 继续是唯一 durable novel truth；新组件只编译现有 action 的输入，不写 Brain、不提交 review、不 confirm。

## 2. 非目标与冻结合同

- 不修改 `/root/dev/novel-workbench`；
- 不新增第六个模型工具；
- 不改变冻结的 35 个 Narrative V2 actions；
- 不把 branch、state projection、JSONL 输出或 DSH session history 变成第二真源；
- 不自动从正文调用模型抽取状态；首期由调用方提供候选，确定性层只验证证据与时间边界；
- 不在本阶段建设通用向量库或替换 GBrain derived index。

## 3. Branch -> Blueprint compiler

[`packages/blueprint-compiler`](../../../packages/blueprint-compiler/) 接收 `BranchProposalSeed`、对应的 `BranchSimulationResult`、当前 baseline canon hash 与作者拥有的章节/segment 设计。

编译前 fail-closed 检查：

- simulation 必须 viable，branch id 必须一致；
- seed、simulation、当前 canon 的 baseline hash 必须完全一致；
- seed world delta 必须与确定性重放结果一致；
- Blueprint 至少一个 segment，每个 segment 有 POV 和非空信息边界；
- 每个 world delta 必须由一个且仅一个 segment 的 `requiredChanges` 显式认领；
- segment 字符预算、ID 和 delta 引用必须合法。

输出分成两个 proposal，避免依赖 Narrative V2 会裁剪的未知 Blueprint 字段：

- `narrative_memory_propose`：保存 baseline hash、branch id、候选事件、world delta、代价、伏笔影响和 planned Blueprint id；
- `narrative_blueprint_propose`：只包含现有 `blueprintPayload()` 接受的字段。

二者都不携带 `confirmation`。provenance 即使被提出，也不能替代 Blueprint review 或作者选择。

## 4. Approved revision -> state candidates

[`packages/state-recorder`](../../../packages/state-recorder/) 读取现有 writing manifest 和 immutable approved export，验证：

- manifest schema、`status=approved`、revision path/id/hash；
- 调用方期望 hash 与 manifest 一致；
- 磁盘正文 SHA-256 与 manifest 一致；
- 所有路径留在小说 workspace，realpath 后也不能越界；
- chapter/segment locator 存在，行范围有效且不只指向空白；
- excerpt SHA-256 与选中正文一致；
- StoryEvent 不晚于章节状态边界；
- KnowledgeClaim 引用本章来源事件，获得时间不早于来源事件且不晚于边界，visibility 包含知情主体；
- 所有 candidate ID 唯一，生命周期保持 candidate。

通过后，StoryEvent、KnowledgeClaim 和 ForeshadowDebt 被转成现有 `narrative_memory_propose` 输入。证据采用：

```text
<revision-id>@<approved-content-sha256>#chapter:<NNN>/segment:<id>/lines:<start>-<end>/excerpt-sha256:<hash>
```

组件只有读取正文与生成内存对象的权限，不写文件、不 confirm。章节批准与状态确认因此仍是两个可审查步骤；后续 Web 可以把它们组合成一个精确绑定的批量审批卡，但不能省略能力校验。

## 5. DSH 小说专项 Skills

[`packages/dsh-novel-author/skills`](../../../packages/dsh-novel-author/skills/) 随插件包交付四个 DSH 原生 Agent Skills：

- `plot-simulation`：branch 因果、状态与知情约束，以及 Blueprint 编译边界；
- `state-recorder`：批准 revision 的正文证据绑定和候选生成；
- `style-director`：保留 Novel Workbench 的 Style Constitution、Prose Profile、条件化技法和修订学习成果；
- `continuity-reviewer`：时间、因果、人物知情、状态、伏笔、segment handoff 与 craft 连续性审查。

Skills 是可版本化过程知识，不是 canon，也不增加工具权限。若确定性编译器尚未暴露给当前部署，Skill 明确要求只生成待运行输入，不得伪称校验已完成。

## 6. 真实合成验收

[`scripts/smoke-golden-v2.mjs`](../../../scripts/smoke-golden-v2.mjs) 现在执行完整合成流程：

```text
project init
  -> Story Contract / Style Constitution confirm
  -> baseline StoryEvent confirm
  -> branch simulate / viable seed
  -> branch provenance propose
  -> Blueprint compile / propose / review / confirm
  -> writing packet / segment / handoff / evaluate
  -> immutable chapter approve
  -> StoryEvent + KnowledgeClaim + ForeshadowDebt propose
```

测试只使用临时合成小说，结束后删除。三个章节后状态对象只 propose，不自动 review/confirm，验证了 promotion boundary。

## 7. 影响范围与保持不变

新增 `blueprint-compiler`、`state-recorder` 与四个 packaged Skills；扩展 Memory Adapter 的可选 planned Blueprint linkage、Golden smoke、资产发现和文档。Narrative V2/GBrain 源码、35-action/5-tool 合同、JSONL wire、AuthorCapability 与现有小说 workspace 均保持不变。

Novel Workbench 工作树仍只有用户原有 `.gitignore` 修改，本阶段未写入该仓库。

## 8. 残余风险与下一步

- state candidate 的语义抽取仍由上游 Agent/规则提供；需要新增可评测的合成抽取器，不能让 LLM 输出绕过证据校验；
- approved chapter 的行 locator 能验证正文片段，但 Narrative V2 当前没有在最终合成文本中保存精确 segment offset；后续应在 manifest 增加可回滚 schema 扩展设计；
- `entityId:fieldPath` delta ref 仍继承分隔符约定，正式 schema 应限制或转义；
- compiler 已通过版本化 Host orchestration envelope 接入现有五工具面，没有新增 action；
- 继续建设 Web timeline、knowledge matrix、state diff、branch compare 和绑定 revision/hash 的批量审批卡；
- 补 sidecar crash/restart、并发审查、百万字恢复与 final ledger 故障注入。

## 9. 验证计划

- `pnpm verify`：类型、构建、全部单元测试与 Markdown 链接；
- `pnpm smoke:real-v2`：真实 Narrative V2 初始化与 sidecar；
- `pnpm smoke:golden-v2`：上述完整闭环；
- `pnpm pack --dry-run`：确认 preset 与四个 `SKILL.md` 进入插件包；
- 对比 Novel Workbench `git status`，确认无本阶段写入。

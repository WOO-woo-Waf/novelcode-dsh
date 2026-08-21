# NovelCode DSH Author Studio 产品与技术设计

日期：2026-08-21
状态：四项核心决策已由产品所有者批准；Phase 0/1 与 Phase 2 纯领域基础已实现，扩展验收进行中
产品：NovelCode DSH Author Studio（NovelCode 小说创作工作台）

## 1. 决策摘要

本产品只替换通用 Agent Harness，不重写小说领域核心：

1. DeepSeek Harness 接管 session、agent loop、tool runtime、模型、权限、沙箱、子 Agent、任务和 Web 装配。
2. 现有 Narrative V2 继续拥有小说分析、知识、规划、写作、评价、批准和终稿行为。
3. `.narrative/brain` Markdown 继续作为唯一小说知识真源；GBrain/PGLite/图/全文/向量都是可重建派生层。
4. 新产品位于独立仓库，不修改或嵌入原 Novel Workbench 源码。
5. 第一阶段用 workspace-scoped JSONL sidecar 跨越 Node/DSH 与 Bun/Narrative V2 边界。
6. 下一轮领域重点是时间、人物知情、状态投影、剧情推演和作者修订学习，不再引入第二套通用 RAG 真源。
7. DSH 小说社区项目以锁提交研究和选择性复用为主，不 fork 为产品底座。

## 2. 背景

普通 AI 小说产品通常只有提示词、角色卡、章节文件和向量检索。它们能生成正文，却很难长期回答：

- 当前 canon 到底是什么；
- 某个事实何时成立、何时失效；
- 每个人物分别知道、相信、怀疑或误解什么；
- 某个动作怎样改变人物、关系、物品、势力和伏笔；
- 当前场景在特定 POV、压力、关系和读者效果下应该怎样写；
- 作者反复修改了哪些写法，这些偏好何时适用；
- 聊天压缩、模型更换或进程重启后怎样恢复到同一创作状态。

Novel Workbench 已解决最困难的基础部分：GBrain-first 真源、显式知识生命周期、Source Intelligence、what/how 隔离、章节 Blueprint、segment writing packet、Style Lab、不可变批准章和 final ledger。新产品的任务是把这些成果变成 DSH 原生、模块化、可独立发布的小说产品，并补足动态小说状态。

## 3. 目标

- 从构思、资料、设定、推演、规划、分段写作、审稿、作者修改到终稿形成一个可恢复闭环。
- 让小说状态和风格控制成为可检查、可追溯、可批准的产品对象，而不是聊天中的隐含记忆。
- 支持长篇、百万字级项目中持续变化的人物、时间线、知情范围、关系和伏笔。
- 支持从作者多作品和真实修订中学习条件化风格，同时设置复制风险边界。
- 通过 DSH 插件、Profile、Skill、Agent 和 Web slot 构建小说专用产品，不维护 DSH fork。
- 保持五个稳定模型工具面，避免把 35 个 action 展开成难以使用的工具噪声。

## 4. 非目标

- 不把 Graphiti、Mem0、Letta、另一个 PGlite 或向量数据库设为 canon。
- 不把 DSH session、conversation compaction 或 Agent 私有记忆当小说知识真源。
- 不让模型自动确认 L1、长期 craft、Blueprint、章节或终稿。
- 不在 tool JSON、Session Event、日志或设计 fixture 中保存长正文。
- 不承诺单部作品可以证明“作者稳定风格”，也不以复制原句实现“像作者”。
- 第一阶段不重写 Narrative V2 的 Bun 文件、spawn 和 hash 实现。
- 不复制许可证缺失、AGPL 或许可含混项目的实现代码。

## 5. 已吸收的 Novel Workbench 科研成果

新产品把以下成果定义为不可回退的产品合同：

### 5.1 小说知识与状态

- L1/L2/L3 是生命周期与注入层，不是模糊的语义分类。
- durable memory 必须经历 `observation -> candidate -> pending_review -> confirmed -> superseded/archived`。
- 默认检索只返回 confirmed，craft 不进入 ordinary memory route。
- Story Contract 管“写什么”，Style Constitution 管“怎么写”。
- writer 只写文件；recorder 只产生候选；作者决定 canon、长期规则、Blueprint 和终稿。
- Source registry 和参考小说不是当前小说 canon；跨小说引用保持只读、有 hash、有 scope。

### 5.2 中文 Source Intelligence

- 支持 UTF-8/BOM/UTF-16/GB18030。
- 章节标题优先、段落安全分块、无标题 topic hint。
- 十万字级采用 chunk -> chapter synthesis -> global synthesis，支持中断恢复、hash 复用和 revision diff。
- 分析结果必须带 provenance；materialize 只生成 candidate。

### 5.3 作者风格研究

正式定义保留为：作者在可比叙事条件下，对语言形式、叙事话语、表现方式、情节组织、注意与评价所作出的稳定而有区分度的选择分布，以及这些选择造成的读者体验。

风格分解为：

```text
观测文本风格
= 作者稳定核心
+ 作品 overlay
+ 创作时期与版本
+ 题材/类型
+ 叙述者与 POV
+ 角色话语声线
+ 场景模式和事件功能
+ 关系/信息/空间/压力条件
+ 编辑与平台影响
+ 分析误差
```

产品必须保留以下风格本体：

- `linguistic_expression`：中文字符、词汇、分句、话题链、标点、段落、修辞和衔接；
- `narrative_discourse`：叙述者、聚焦、距离、时间、话语呈现、信息控制和潜文本；
- `representation_craft`：人物、对白、动作、心理、身体、环境、空间和物象怎样被表现；
- `plot_and_composition`：事件粒度、因果显隐、铺垫、回收、升压、缓释和闭合方式；
- `authorial_attention_cognition_ethics`：作者让 POV 注意什么、如何归因和评价；
- `aesthetic_reader_effect`：理解、注意、临场、情感、距离、悬念、惊讶、余味等；
- `variation_and_revision`：作者核心、作品/人物/场景变体和修改偏好。

`StyleObservation` 和 `ConditionalStylePattern` 必须有条件、实现方式、功能假设、证据、反证、分母、置信度、层级和版本。氛围不是 mood tag，而是感官、空间、POV 注意、人物判断、关系压力、信息差、事件压力、节奏和意象历史的动态组合。

### 5.4 已实现的 Style Lab 合同

- 单作品不能生成 `author_core`；同一作者至少两部作品才有资格提出稳定核心候选。
- `what_to_write` 与 `how_to_write` 在 segment instruction 中分开。
- confirmed structured pattern 才能执行；observation 只是证据。
- 场景条件、参与者集合、关系结构、目标效果和表现通道决定 pattern 是否命中。
- POV/叙述者/人物 voice 比作者平均规则更具体，优先级更高。
- AtmospherePattern 必须包含效果曲线和至少三种互动机制。
- 原始作者反馈只形成 revision observation；结构化候选仍需审查确认。
- 后续必须增加多头 style judge、熟悉/普通读者盲评和复制风险 gate。

## 6. 产品工作面

### 6.1 项目台

展示工作区、Story Contract、Style Constitution、当前卷章场景、待审知识、伏笔债务、写作进度、模型路线、sidecar/GBrain readiness 和任务队列。

### 6.2 素材实验室

登记主稿、续写材料、风格参考、研究资料和局部片段；展示分块、覆盖率、证据、综合、revision diff 和 candidate materialization。

### 6.3 Story Brain

以人可检查的卡片、时间轴、关系图和 diff 展示人物、地点、物品、势力、世界规则、事件、关系、知情状态、伏笔和 lifecycle。

### 6.4 剧情推演室

在独立 sandbox 中进行场景模拟、正反向设定推理和反事实探索。候选分支只有被作者选中后才能成为 Blueprint candidate；推演结果不能直接改变 canon。

### 6.5 Style Lab

展示 measurement、observation、evidence/counterevidence、Prose Profile、条件化 pattern、voice overlay、RevisionPreference、reader effect、judge 分歧和复制风险。

### 6.6 章节工坊

确认 Blueprint 后编译完整 segment packet，按顺序写作、handoff、检查边界与重叠、评价连续性和 craft，吸收作者反馈，再生成不可变批准 revision。

### 6.7 版本与终稿

按内容 hash 保存批准章；切换 active revision 不覆盖历史；final ledger 只引用已批准 revision，导出和重复组装幂等。

## 7. 总体架构

```text
DSH Author Profile / Web
├── Narrative Director + scoped specialist agents
├── Skills / commands / workbench client
├── sessions / approval / sandbox / jobs / compaction
└── @novelcode-dsh/novel-author
    ├── five narrow tools
    ├── author approval gate
    ├── log-only novel session events
    └── ctx.novel
        └── workspace-scoped JSONL provider
            └── Bun Narrative V2 service
                ├── Source Intelligence
                ├── Markdown Brain + lifecycle
                ├── GBrain/PGLite/graph/vector derived views
                ├── Blueprint / writing / evaluation
                ├── Style Lab / craft compiler
                └── immutable revisions / final ledger
```

### 7.1 代码边界

```text
apps/noveldsh/              dedicated product CLI and workspace binding
packages/contracts/          frozen action and wire vocabulary
packages/jsonl-provider/     Node child-process lifecycle and JSONL transport
packages/dsh-novel-author/   ctx.novel, tools, policy, prompt, session events
packages/memory-model/       temporal/epistemic contracts and deterministic projection
packages/memory-adapter/     Memory OS objects to existing Brain proposals
packages/simulation/         pure branch sandbox and causal simulation
packages/blueprint-compiler/ viable branch to V2 Blueprint candidates
packages/state-recorder/     approved revision to evidence-bound state candidates
packages/host-orchestration/ trusted Brain snapshot and five-tool envelopes
packages/web/                DSH client workbench + loopback read-only projection
packages/dsh-novel-author/presets/novel-author/ product role composition
packages/dsh-novel-author/skills/ versioned DSH fiction skills
```

## 8. JSONL sidecar contract

- 每个 canonical workspace 最多一个 sidecar，工作目录就是小说作用域。
- DSH 不向模型开放 workspace 参数，使用 Session header 中不可变的 `cwd`。
- stdin 每行一个 `{ id, action, ...input }`；stdout 每行一个 `{ id, result }`。
- 请求可并发，通过不可预测 ID 相关联。
- stderr 只保留有上限的诊断尾部，不进入模型或 Session Event。
- 超时或取消会终止整个 workspace sidecar，因为当前 JSONL 服务没有逐请求取消协议；防止取消后的写操作继续运行。
- sidecar 重启不影响小说真源，Narrative V2 从 workspace 文件恢复。
- 正文通过 workspace path 传递，wire 只携带 compact JSON。

## 9. 五个模型工具面

| 工具 | actions | 权限边界 |
|---|---:|---|
| `narrative_project` | 3 | 初始化、状态和 doctor |
| `narrative_source` | 10 | 素材分析、只读参考、旧记录元数据 |
| `narrative_memory` | 13 | Brain、检索、图、生命周期、Story/Style 契约 |
| `narrative_plan` | 2 | Blueprint proposal/confirm |
| `narrative_writing` | 7 | writing packet、segment、评价、反馈、批准和导出 |

旧 V1 的宽 `narrative` 和 56-action 面不进入新产品 Profile。

## 10. DSH 生命周期

```text
plugin mount
-> resolve configuration
-> register ctx.novel, tools, policy, prompt, events

session/turn
-> use immutable session cwd as project binding
-> inject compact project/navigation context when available

tools/pre-execute
-> validate tool/action ownership
-> require the NovelCode DSH marker or an existing V2 project manifest
-> apply workspace/mode/path policy
-> request author approval for high-risk actions

tool execute
-> consume exact call-bound capability
-> runtime injects author_confirmed
-> execute ctx.novel through sidecar

tool completion
-> append ids/paths/metric keys/state transition only
-> never copy payload bodies or prose into session events

turn stopping
-> report unrecorded segment/handoff/blocker
-> never auto-confirm knowledge or chapters
```

## 11. 作者审批设计

模型提供的 `payload.confirmation` 一律删除。高风险调用在 `tools/pre-execute` 中生成只存在于 runtime 的 pending capability，绑定：

- DSH `callId`；
- session id；
- action；
- 规范化参数 hash；
- 过期时间。

用户批准后同一次精确调用进入 execute，capability 被一次性消费，runtime 才注入 `author_confirmed`。参数变化、callId 变化、session 变化、过期或二次消费全部失败。

后续 Web 审批卡必须显示 proposal/current diff、artifact path、content hash、canon delta、影响范围和可回滚 revision。章节批准可一次签署精确绑定的正文 revision 与 state delta，减少逐条审批负担。

## 12. Narrative Memory OS 下一阶段

### 12.1 双时间事件

`StoryEvent` 至少区分：

- `story_time`：故事世界发生时间；
- `narrative_time`：文本揭示/叙述位置；
- `valid_from/valid_to`：事实在世界中何时有效；
- `recorded_at`：系统何时提取或确认；
- participants、causes、effects、evidence、scope、revision。

### 12.2 人物知情模型

`KnowledgeClaim` 保存 subject、claim、stance（knows/believes/suspects/disbelieves/unknown）、confidence、acquired_at、valid_until、evidence 和 visibility scope。writing packet 必须按 POV 和时间过滤，防止人物知道不该知道的信息。

### 12.3 世界状态投影

事件保持不可变；`StateProjection` 在指定章/场景/时间点重放实体字段变化，回答人物位置、身体/心理状态、物品归属、资源、能力、关系和势力局势。投影是派生层，可重建，不反向成为真源。

### 12.4 伏笔与叙事承诺

`ForeshadowDebt`/`NarrativePromise` 跟踪 planted、reinforced、misdirected、partial payoff、resolved、abandoned，保存最早/目标/逾期窗口、相关人物和预期读者效果。

### 12.5 Episodic consolidation

segment -> scene -> chapter -> arc 分层归并；每个摘要保存 `member_ids`、coverage、conflicts、unassigned_items 和 source hashes。归并不能删除底层成员或替代 confirmed canon。

### 12.6 Branch sandbox

`BranchHypothesis` 保存基线 canon hash、假设、候选事件、状态 delta、代价、冲突、伏笔影响和评价。沙箱只能读取 confirmed canon；选中后生成 proposal，不能直接晋升。

### 12.7 RevisionPreference

保存 AI 原稿 locator、作者定稿 locator、修改类型、理由/推断、场景条件、前后效果、重复证据和反例。单次修改只产生 observation；跨可比场景重复后才成为 craft candidate。

## 13. Agent 与 Skill

- Narrative Director：意图路由、任务分配、最终协调，不直接维护真源。
- Source Analyst：分块分析、证据和综合。
- Lorekeeper：时间、人物知情、世界状态、因果和伏笔。
- Planner：story/arc/chapter/scene/segment 规划和推演。
- Writer：只读 writing packet，只写 draft path。
- Continuity Reviewer：时间、位置、知情、关系、设定和边界。
- Craft Reviewer：条件化风格、对白、人物表现、氛围和读者效果。
- State Recorder：从批准文本产生有证据的 delta candidate。

Skill 是版本化过程知识，不是 canon。通用小说方法存在插件 Skill；题材/项目/作者专属 Skill 按书配置并保留来源、版本和适用条件。

## 14. 开源复用策略

优先吸收：

1. AI-Novel-Writer 的 DSH 工程、审批卡和测试资格门；
2. PRTSPro 的推演、`world_delta` 和候选分支语义；
3. akira 项目的 lorebook/context/diff/一致性测试；
4. ddedook 的一本一工作区内容 UI 和项目 Skill 编辑；
5. dsh-tool-writing 的 thread/evolution/decision/usage 外围能力；
6. Graphiti 的双时间与 provenance 语义；
7. MemoryBooks 的可恢复 consolidation 和孤立条目检查；
8. Novel Workbench 已审计的 Re3/DOC/DOME/LongWriter 等算法思想。

任何实质代码复用前必须锁提交、检查许可证、记录 NOTICE、隔离适配层并补行为测试。新生 DSH 项目大多基于 rc.6，不能把它们的内部 API 当 rc.8 合同。

## 15. 实施阶段

### Phase 0：合同冻结

- 冻结 35 actions、5 tools、high-risk 集合和 compact result contract。
- 使用纯合成小说 fixture，不复制私人 workspace。
- 建立 OpenCode direct 与 DSH sidecar artifact/hash/transition parity 规范。

### Phase 1：Headless DSH

- 完成独立 repo、`ctx.novel`、workspace sidecar、五工具面、审批 capability、operational events。
- 接入真实 Narrative V2 service 做合成 E2E。

### Phase 2：Memory OS

- 增加 temporal event、KnowledgeClaim、StateProjection、ForeshadowDebt、consolidation 和 chapter state-delta bundle。
- 先扩展 Narrative V2 action/schema，再通过不变的 `ctx.novel` 暴露。

当前独立产品已完成纯领域合同、确定性投影、proposal adapter 和真实 Brain lifecycle smoke；尚未改动 Narrative V2 原生 schema，也未把派生投影设为第二真源。

### Phase 3：推演与多 Agent

- branch sandbox、候选比较、因果/状态审查、最小权限 Agents、恢复测试。

当前已完成纯 branch sandbox、基线 hash、前向因果、状态前置条件、人物知情、world delta、候选排序和 proposal seed；最小权限多 Agent 与 Web 推演工作台仍未实施。

### Phase 4：DSH Web

- 七个工作面、审批 diff、Story graph、timeline、knowledge matrix、run/revision UI。

当前已完成七工作面的只读基础、timeline、knowledge matrix、state projection 与
run/revision inspection；branch/envelope 表单、Story graph 和审批 impact diff 继续迭代。

### Phase 5：默认入口

- 长篇与故障恢复验收、DSH/OpenCode parity、profile 安装与升级、OpenCode adapter 进入维护状态。

## 16. 备选方案与否决理由

- 直接 in-process import Narrative V2：Node/Bun 边界和全局依赖风险过高，待文件/进程端口抽象后再评估。
- fork DSH：产生长期 fork tax，违背插件化目标。
- fork 某个社区小说插件：会丢失现有领域核心，并继承早期数据模型和 rc.6 API。
- 用 Graphiti/Mem0 替换 GBrain：引入第二真源、自动事实失效和不可审计提取风险。
- 把 35 actions 全部注册为工具：增加模型选择噪声，破坏领域边界。
- 用 prompt 模拟审批：模型可以自证授权，不满足作者控制。

## 17. 风险与约束

- DSH 仍是 developer preview，必须锁 `0.1.0-rc.8@141eb6f` 并隔离 API。
- Sidecar 取消粒度目前是进程级；后续协议需要 request cancellation/ack。
- 新的 temporal/epistemic schema 必须先进入 Brain lifecycle，不能只存在图数据库。
- 长篇状态提取存在误判，自动结果必须先成为 observation。
- 多 Agent 并行可能制造冲突；连续 segment 默认串行，独立分析/reviewer 才可并行。
- 作者风格评价不能由单一 judge 或 embedding 决定，必须保留分歧、证据和复制风险。
- 社区项目许可证与 README 宣称可能不一致，复用前重新核验。

## 18. 验证计划

- 35 action 唯一且只属于一个工具面。
- 非匹配 tool/action 在 sidecar 前拒绝。
- 每个 workspace 使用不同 sidecar；同 workspace 复用同进程。
- invalid JSON、进程退出、超时和取消不会留下未结算请求。
- 模型提供的 confirmation 被删除；只有 exact capability 可注入确认。
- capability 单次消费、参数变化、session 变化和过期测试。
- Session Event 不包含 result payload、正文或 canon body。
- direct/sidecar 对同一合成输入产生相同 success、artifact path、hash、metrics 和 lifecycle transition。
- 删除派生 PGLite 后从 Markdown Brain 重建。
- craft 不泄漏 ordinary memory；candidate 不进入默认写作包。
- 人物知情、双时间、状态投影和分支沙箱使用反例测试。
- Style Lab 使用跨作品切分、同题材负例、revision preference、读者效果和复制风险测试。

## 19. 已确认事项与后续产品选择

架构四项决策已确认。后续仍需由产品所有者在 Web 阶段选择品牌文案、默认题材包、首个公开发行平台和是否开放跨项目作者偏好库；这些选择不阻断 Headless 与 Memory OS 实现。

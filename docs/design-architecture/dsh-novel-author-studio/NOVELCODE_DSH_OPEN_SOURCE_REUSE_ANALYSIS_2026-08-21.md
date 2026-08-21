# NovelCode DSH 开源生态复用分析

日期：2026-08-21
状态：固定提交调研基线

## 1. 结论

DSH 小说生态已经出现项目工作台、世界书、PGlite canon、章节库、风格分析、剧情推演、多 Agent、写作面板和百万字一致性实验，但成熟度仍低：除 AI-Novel-Writer 的主项目外，主要 DSH 小说仓库大多在 2026 年 8 月中旬刚建立，常用 DSH `rc.6`，star 和维护历史不足以证明长期稳定性。

NovelCode 应复用插件工程、UI 信息架构、推演机制和外围算法，不应复用其小说真源或把产品建立在其中一个仓库上。

## 2. 复用优先级

### A：可进入近期实现评审

- AI-Novel-Writer DSH plugin：独立锁文件、较完整测试、审批卡和 Web workbench；只在 MIT 子目录边界内评审。
- akira399/dsh-novel-writer：MIT，模块划分、lorebook、context assembler、diff/undo 和一致性测试适合逐模块评审。
- ddedook/dsh-novel：MIT，DSH rc 插件安装、一本一工作区、内容页和本书 Skill 适合 UI/装配参考。
- Graphiti：Apache-2.0，只吸收双时间、episode provenance 和事实失效语义；先实现为 Brain schema，再决定派生 adapter。

### B：机制借鉴，暂不复制代码

- PRTSPro/novel-workbench：推演和 world delta 很强，但根许可证不明确。
- siweina/dsh-novel-writer：本地中文 embedding 和句式/语用分析有价值，但许可证未由仓库文件可靠建立。
- MemoryBooks：AGPL；只借鉴 checkpoint/member_ids/unassigned_items。
- dsh-tool-writing：MIT，但独立密钥、多章并发和自有数据布局不直接适合 NovelCode；借鉴 thread/evolution/decision/usage。

### C：只做对照

- Mem0、Letta、Cognee、LightRAG、HippoRAG：通用 Agent memory/RAG，与 GBrain 职责重叠。用于 benchmark、召回和记忆管理对照，不进入首期依赖。
- SillyTavern：角色聊天和 lorebook 生态强，适合导入兼容与角色交互研究，不适合作为长篇 canon。
- novelWriter：成熟人工写作编辑器，适合章节树、标签、统计、拼写和导出交互对照，不是 Agent memory backend。

## 3. 能力映射

| NovelCode 目标 | 首要参考 | 吸收方式 | 不吸收内容 |
|---|---|---|---|
| DSH plugin qualification | AI-Novel-Writer | 构建、preset、approval、snapshot/e2e 测试 | 桌面 `.vela` 数据模型 |
| 剧情推演 | PRTSPro | candidate branch、world_delta、机械依据校验 | 单一 `state.json` 真源 |
| Lorebook/上下文 | akira、SillyTavern | matcher、注入预算、导入映射 | lorebook 直接等同 canon |
| 内容工作台 | ddedook、NovelClaw | 侧栏、实体详情、关系、时间线、run inspection | PGlite/粗标签替代 Brain/Style Lab |
| 长程线程与演化 | dsh-tool-writing | thread graph、evolution diff、staleness | 自动写入 confirmed 状态 |
| 可恢复记忆归并 | MemoryBooks | member lineage、checkpoint、孤立条目 | AGPL 实现和聊天摘要充当 canon |
| 时间事实 | Graphiti | valid time/record time/provenance | LLM 自动 invalidation 直接改真源 |
| 风格优化 | 现有 Novel Workbench 研究 | 条件化本体、RevisionPreference、多头评价 | 风格标签、原文片段复制、单一 embedding 分数 |

## 4. 许可证规则

- README、package `license` 和根 LICENSE 不一致时，按未澄清处理。
- GPL/AGPL 项目默认只借鉴公开思想和交互，不复制实现。
- MIT/Apache/BSD 代码复用仍需固定 commit、路径、版权头、NOTICE 和修改记录。
- 论文有代码不等于代码有许可证；DOME 一类无根许可证项目只吸收论文级思想。
- 任何开源复用不得携带示例小说正文、角色卡私有内容或训练语料。

## 5. 重新审计触发条件

- DSH 从 rc 升为稳定版本；
- 参考项目发布首个稳定 release；
- 项目增加/改变 LICENSE；
- 决定复制而非重新实现某个模块；
- 参考项目的数据模型将进入持久化格式；
- 产品准备公开或商业分发。

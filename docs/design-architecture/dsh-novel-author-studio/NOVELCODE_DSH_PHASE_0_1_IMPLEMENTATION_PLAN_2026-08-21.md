# NovelCode DSH Phase 0/1 实施与验收计划

日期：2026-08-21
状态：Phase 0 与 Headless 基础已交付；完整 Golden workflow 验收继续执行

## 1. 目标

在不修改 Novel Workbench 的前提下，完成一个可独立安装、可测试的 DSH Host 插件基础，使 DSH Session 能通过 `ctx.novel` 调用现有 Narrative V2。

## 2. 当前交付

- 独立 Git 项目和 Node 22+/pnpm 11 工程基线；
- `@novelcode-dsh/contracts`：35-action/5-tool/high-risk 合同；
- `@novelcode-dsh/jsonl-provider`：每 workspace 一个 Bun sidecar；
- `@novelcode-dsh/novel-author`：`ctx.novel`、工具、system prompt、approval gate、session events；
- `apps/noveldsh`：独立产品 CLI、preset 定位、显式 workspace marker 与既有 V2 兼容门；
- `@novelcode-dsh/memory-model`：双时间、人物知情、状态投影、伏笔、归并、分支和修订学习合同；
- 合成 transport、capability、event 和 contract 测试；
- 正式产品设计和固定提交参考清单。

## 3. Phase 0 Golden Contract

Golden fixture 不能包含私人小说内容。最小合成故事只使用中性对象：两个人物、一个地点、一件物品、两个事件、一个人物不可知秘密、一条伏笔、一个 Blueprint 和两个短占位 segment 文件。

每个 action 比较：

| 维度 | 必须一致 |
|---|---|
| success/failure | 是 |
| summary 的语义状态 | 是；不要求宿主前缀文本相同 |
| artifact workspace-relative path | 是 |
| artifact content hash | 是 |
| metrics | 是 |
| lifecycle before/after | 是 |
| approved revision hash/ledger | 是 |
| payload 中不稳定 timestamp/pid | 规范化后比较 |

## 4. Phase 1 工作项

1. 对真实 Bun service 做 `project_status`/invalid-action/readiness smoke；已完成。
2. 建立合成 V2 workspace：init -> Story/Style proposal -> review -> confirm -> Memory OS event -> Blueprint -> writing prepare；已完成。
3. DSH `tools/pre-execute` 审批集成测试，覆盖 allowed-once、拒绝、runtime confirmation 注入和消费后重放；已完成。
4. 增加 sidecar crash/restart、timeout、abort、stderr bound 和并发 correlation 测试。
5. 打包构建 JS/d.ts，避免发布 `.ts` source entry。
6. 增加本地 Profile 安装、卸载、升级和 doctor 指南。

当前基础验收：`pnpm verify`、真实 V2 init/status smoke、完整 Golden workflow、插件 dry-run pack、五工具注册、DSH allowed-once/拒绝、workspace gate 和 34 项无私人小说内容的自动化测试均已通过。第 4 项 crash/restart 全矩阵仍属于扩展验收，不能以当前 workflow smoke 代替。

## 5. 验收门

- `pnpm verify` 全部通过。
- DSH rc.8 加载插件后只出现五个 narrative 工具。
- 没有 Session cwd 的调用安全拒绝。
- 两个 workspace 不共享进程、状态或请求。
- 高风险调用在无 approval、参数变化、过期、重放时全部失败。
- Session JSONL 不包含 tool result payload、素材正文、草稿正文或 Brain 页面正文。
- 关闭插件后所有 sidecar 终止，无孤儿进程。
- 原 Novel Workbench `git status` 与实施前一致。

## 6. 回滚

新产品是独立 repo。回滚只需从 DSH profile 移除 `@novelcode-dsh/novel-author` 并停止其进程；小说 workspace、Brain 和 Narrative V2 不需要迁移或回写。OpenCode 入口可以继续使用同一领域核心。

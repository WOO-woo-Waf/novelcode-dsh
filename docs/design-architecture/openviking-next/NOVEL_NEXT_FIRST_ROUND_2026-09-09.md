# 小说 next：首轮实现、使用与人工内容验证

日期：2026-09-09。用户决定：DSH + OpenViking 资源/指导 + Narrative V2。
唯一产品目标是写好小说：原稿续写的连贯/人物表现、条件化文风、长篇状态维护同时需要。
内容质量由作者参与判断，不用检索命中和自动测试冒充效果。

## 1. 本轮实现边界

- 新工作树 /root/dev/novelcode-dsh-next，分支 feature/openviking-next，基于旧小说 DSH 的 361be0f。
- 固定 DSH 0.1.3-alpha.2，适配 Web Session/Workspace 控制接口；旧入口依赖不动。
- OpenViking 薄 HTTP 客户端：上传、资源摄取、状态、查找、读取，未改其上游。
- 用原有 narrative_memory_connect 的 payload 接入素材/指导，仍只有五个模型工具。
- writing_prepare 后生成增强 instruction 文件并将 manifest 的读取路径指向它，原始 instruction 保留。
- 本书材料进入 what_to_write；文风参考与作者指导进入 how_to_write。原有 canon、条件化 patterns、角色信息边界和 handoff 保留。
- 每段附加正文默认上限 6000 字符（不是 token），本书材料/指导/参考分配预算；没有全量会话自动记忆。
- 素材面板增加用途/章节/索引回执预览，参考 Novel Studio 的可见、可检查交互；没有搬它的状态库和 Skill。
- 不增加通用审批平台、SSO、多租户、第二个记忆后端。保留已有作者确认动作。
- 不改 novel-workbench 源码；通过既有 JSONL 调用领域服务。

## 2. 简单责任分工

| 部分 | 做什么 |
|---|---|
| Narrative V2 | 正式故事状态、人物所知、蓝图、风格规则、稿件和终稿 |
| OpenViking | 原文/参考/指导的资源索引和按需取用 |
| DSH | 导演对话、工具、可选独立审稿子 Agent、会话和 UI |
| 薄组合层 | 场景查询、用途区分、有限上下文、增强包与实际读取路径 |

首轮保持已有 GBrain 兼容路径，不迁移旧状态，也不全量同步 Brain 到 OpenViking。
下一轮看作者实际稿件反馈再减少重复检索或改变预算，先不重做已有状态模型。

## 3. 安装和启动

所有操作在 next 目录；不改全局 DSH，也不把旧 profile 拷来混用。

~~~bash
cd /root/dev/novelcode-dsh-next
rtk pnpm install --frozen-lockfile
rtk pnpm build
rtk node scripts/start-next.mjs --check
rtk node scripts/start-next.mjs
~~~

默认 next DSH 使用 runtime/dsh、novel-next profile、端口 3088；旧小说和审核目录不受影响。
启动后在新 UI 配置主模型，创建小说 workspace，选择“NovelCode Next 小说导演”。
默认只读领域源码根是 /root/dev/novel-workbench，可通过 NOVELCODE_DSH_CORE_ROOT 指定。
使用全新测试小说目录；不要让旧/新入口同时写同一部小说。

OpenViking 默认端口 1938，单独安装/配置；本轮不复制其他项目凭据：

~~~bash
rtk python3 -m venv runtime/openviking-venv
rtk runtime/openviking-venv/bin/pip install 'openviking @ git+https://github.com/volcengine/OpenViking.git@230abf054d3174ce747bcfc98c171d8efa8ec2c4'
~~~

联网安装遵循本机代理约定。先按 config/openviking-next.example.json 创建私有
runtime/openviking/ov.conf，填写自己的模型/embedding配置和正确维度；此目录被忽略。
源码安装可能需要编译依赖，安装成功不等于 embedding/VLM 路线可用，首次须跑上游 doctor。

~~~bash
rtk runtime/openviking-venv/bin/openviking-server doctor --config runtime/openviking/ov.conf
rtk bash scripts/start-openviking-next.sh
~~~

如上游版本 doctor 参数有变化，以该固定安装的 --help 为准；正式启动脚本使用 --config/--host/--port，配置 with_bot=false。固定 Python 入口没有 Docker 包装器的 --without-bot 参数。
OpenViking 原服务 AGPL，示例 Apache；当前未复制其实现，后续分发仍按实际组件许可处理。
这些是准备步骤；未配置真实模型时，不能宣称已经完成真实语义检索或内容质量验证。

## 4. 作者第一轮怎么用

准备三个文件：本书原稿/相关章节、文风参考、你明确写下的短指导。
先按原有 Source Intelligence 分析主稿，确认故事/风格契约与一个章节蓝图。
然后对导演说：

~~~text
将 source/main.txt 作为本书材料、source/style.md 作为文风参考、
source/guidance.md 作为我的指导导入 OpenViking。继续用 Narrative V2
维护本书状态。先写这一章的一个场景，保持人物表现、连贯和文风，
不要为了展示设定而解释背景。写完让我看正文和实际使用的材料清单。
~~~

对应工具示例（由导演调用，无须作者手工管理 API）：

~~~json
{
  "action": "narrative_memory_connect",
  "payload": {
    "backend": "openviking",
    "operation": "import",
    "paths": ["source/style.md"],
    "kind": "reference",
    "chapter": 1
  }
}
~~~

kind 为 source/reference/guidance；chapter 可省略表示可跨章检索。
只导入文件，不自动递归扫描整工作区。本书原文不是自动确认的 canon，参考书也不提供本书情节。
再次同内容导入会复用已 ready 回执；文件修改后重新导入。旧内容 hash 不一致不会自动引用。

检查状态使用同一 action，payload={backend:"openviking",operation:"status"}；
pending 需检查状态完成后再写；素材面板仅显示本地回执，不冒充实时健康。

写作时调用原 narrative_writing_prepare，必须读返回的增强 instruction_path。
原始路径保存在 native_instruction_path，可用于对照。后续 segment_record/handoff
仍走现有工具；出错时显式降级到原生包，并说明没有使用 OpenViking。
每次准备会生成新的写作 run，不能用重复 prepare 代替恢复同一 run。

作者纠正仍走现有反馈/候选链。简短通用指导可保存在 guidance.md 后重新导入；
它作为可读建议使用，不变成系统自动提炼的永久人物事实。

## 5. 人工验证：第一轮只评正文

先选三个代表场景：人物对白/关系推进、动作与悬念、心理/氛围。
每个场景用相同蓝图和模型做原包与增强包两稿，隐藏标签后阅读。
每次两稿使用独立 run/输出文件，不同时在同一 run 登记两份结果。
再做一次“你纠正后，新会话写下一段”的测试。

| 项目 | 作者记录 |
|---|---|
| 连贯与因果 | 是否自然承接原文，有没有跳步、重复解释、无因变化 |
| 人物表现 | 行动有无动机、对白是否区分人物、是否符合其所知 |
| 条件化文风 | 当前场景是否合适，不只像几个标点/形容词 |
| 长篇状态 | 人物/物品/关系/伏笔是否延续，是否剧透未来信息 |
| 阅读质量 | 哪些具体句段好/差，节奏、张力、细节是否有效 |
| 使用等级 | 可直接用 / 小修 / 大修 / 重写 |
| 修改负担 | 修改分钟数、主要改动、是否再次发生同类问题 |
| 倾向 | A好 / B好 / 相当；理由指向具体段落 |

三个维度同时评价，不能用“状态无误”抵消“正文不好读”。
模型审稿只帮助找问题，最终取舍由作者。小样本只用于找下一轮改进点，不宣称统计提升。
建议下一轮把最不满意的 3 个段落和你的修改稿交回来，优先修生成/上下文问题，而非堆组件。

## 6. 技术验证与真实效果分开

可复现离线检查：

~~~bash
rtk pnpm typecheck
rtk pnpm test
rtk env NOVELCODE_DSH_CORE_ROOT=/root/dev/novel-workbench node scripts/smoke-openviking-v2.mjs
~~~

smoke 使用真实 Narrative V2 和合成 OpenViking HTTP，测试 multipart/查询/回读、增强包、
预算、原生状态/hand-off保留，以及增强后继续登记正文。不调用模型。
真实 OpenViking 的 embedding/摘要/检索效果、你实际小说的正文质量仍待配置和人工验证。

## 7. 现阶段有意不做

不自动提炼全部会话、不一键确认设定、不自动接管旧书、不安装多个记忆系统。
不把社区 Novel Studio 全量 fork；目前只结合预览和明确作者控制的优点。
没有新建复杂 Agent 团队；导演、writer、独立复核按任务使用现有 DSH 能力。
审核产品保持当前版本；其未来路线仅形成方案，不在本轮开发。

## 8. 本轮实际验证记录

- pnpm verify：通过（类型检查、构建、86 项测试、24 个本地 Markdown 链接）。
- real Narrative V2 + synthetic OpenViking smoke：23 项检查、14 次领域工具调用、两段增强包，每段附加文本 6000 字符；增强后继续 segment_record 成功，模型调用 0。
- DSH alpha.2 短暂真实 Web：独立 profile，随机端口；令牌握手 303、页面 HTTP 200，未见插件树加载错误，测试进程已关闭。
- Shell/Node 启动脚本语法与 git diff --check：通过。
- 旧 novelcode-dsh、novel-workbench、document-review-workbench 工作区未修改。
- 未验证：真实 OpenViking 安装/服务与 embedding/VLM；浏览器视觉验收；真实小说生成与作者盲评。
- 初次 Web 检查遇到 fs-ext 原生模块缺失，后续模块已可加载并通过真实启动；干净机器重装仍应核验原生依赖，不能只看 pnpm install 成功。

首轮没有自动提交 Git，也没有复制已有模型凭据。联网约定仅由 global-context 网络源加载，未写跨项目记忆。

# NovelCode DSH

## OpenViking next（2026-09-09）

本工作树是 DSH 0.1.3-alpha.2 + OpenViking 资源/指导 + Narrative V2 的首轮实现。
以连贯、人物表现、条件化文风和长篇状态同时服务正文质量；不替换小说领域核心。
使用 [首轮启动与人工验证指南](docs/design-architecture/openviking-next/NOVEL_NEXT_FIRST_ROUND_2026-09-09.md)。
启动：`node scripts/start-next.mjs`，独立配置 `runtime/dsh`、端口 3088；OpenViking 默认 1938。
下文 rc.8 为历史基线说明，不是 next 安装指令。

NovelCode DSH is an independent DeepSeek Harness product for long-form fiction
analysis, planning, state maintenance, style control, segmented drafting,
review, and immutable manuscript assembly.

> Developer preview. The current release is source-deployed and pinned to
> DeepSeek Harness `0.1.0-rc.8`. It requires a separate Novel Workbench checkout
> for the Narrative V2 JSONL service; that checkout is never vendored here.

The product replaces the generic Harness layer only. It does not rewrite the
existing Narrative V2/GBrain domain core. During the first migration phase, a
workspace-scoped Node provider starts the existing Bun JSONL service and exposes
five stable model-facing tools through DSH:

- `narrative_project`
- `narrative_source`
- `narrative_memory`
- `narrative_plan`
- `narrative_writing`

## Status

Phase 0-5 product foundation:

- frozen 35-action V2 contract;
- workspace-scoped JSONL sidecar provider;
- DSH `ctx.novel` service and five tool surfaces;
- high-risk author approval policy;
- dedicated `apps/noveldsh` product CLI and workspace ownership gate;
- log-only novel session event vocabulary;
- pure temporal/epistemic memory contracts and deterministic state projection;
- pure branch sandbox with causal, state, POV-knowledge, stale-canon, and candidate-ranking checks;
- Memory OS adapters that enter the existing Brain proposal/review lifecycle;
- viable branch to provenance/Blueprint candidate compilation;
- approved revision to evidence-bound state candidate compilation;
- four packaged DSH fiction workflow Skills;
- trusted confirmed-Brain snapshot and live baseline hash;
- versioned branch/Blueprint and approved-revision/state Host envelopes on the existing five tools;
- per-workspace mutation serialization;
- dedicated rc.8 Web client package with loopback-only Workspace RPC;
- seven-surface read-only workbench for project, sources, temporal memory,
  plot, style, chapter runs, and immutable revisions;
- timeline, character-knowledge matrix, deterministic state projection, and
  final-ledger inspection without manuscript bodies;
- synthetic contract tests with no private novel content.

Interactive branch/envelope forms, approval impact diffs, Narrative V2-native
temporal schema expansion, multi-agent role composition, and long-form recovery
qualification follow the reviewed implementation plan under
`docs/design-architecture/dsh-novel-author-studio/`.

Primary documents:

- [Product and architecture design](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_NOVEL_AUTHOR_STUDIO_DESIGN_2026-08-21.md)
- [Deployment and usage guide](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_DEPLOYMENT_USAGE_GUIDE_2026-08-21.md)
- [Phase 0/1 implementation plan](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_PHASE_0_1_IMPLEMENTATION_PLAN_2026-08-21.md)
- [Open-source reuse analysis](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_OPEN_SOURCE_REUSE_ANALYSIS_2026-08-21.md)
- [Installation and verification guide](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_INSTALLATION_GUIDE_2026-08-21.md)
- [Phase 2 memory and simulation status](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_PHASE_2_MEMORY_SIMULATION_STATUS_2026-08-21.md)
- [Phase 3 Blueprint and state loop status](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_PHASE_3_BLUEPRINT_STATE_LOOP_STATUS_2026-08-21.md)
- [Phase 4 Host orchestration status](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_PHASE_4_HOST_ORCHESTRATION_STATUS_2026-08-21.md)
- [Phase 5 Web workbench foundation status](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_PHASE_5_WEB_WORKBENCH_STATUS_2026-08-21.md)

## Quick start

```bash
git clone https://github.com/WOO-woo-Waf/novelcode-dsh.git
cd novelcode-dsh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm verify
pnpm add --global @deepseek-ai/dsh@0.1.0-rc.8
export NOVELCODE_DSH_CORE_ROOT=/absolute/path/to/novel-workbench
export DSH_BUNDLED_SKILL_DIR="$PWD/packages/dsh-novel-author/skills"
dsh plugin --profile web add "$PWD/packages/dsh-novel-author" "$PWD/packages/web"
pnpm noveldsh workspace init /path/to/new-novel
pnpm noveldsh workspace doctor /path/to/new-novel
cd /path/to/new-novel
dsh web --no-open
```

Open `http://127.0.0.1:3080`, configure the model provider in DSH, create a
session whose workspace is the novel directory, and select the NovelCode novel
director preset after installing it as described in the
[deployment and usage guide](docs/design-architecture/dsh-novel-author-studio/NOVELCODE_DSH_DEPLOYMENT_USAGE_GUIDE_2026-08-21.md).

The marker created by `workspace init` only binds an empty directory to this
product; it is not novel memory or canon. Existing Novel Workbench V2 projects
with `.narrative/v2/project.json` are accepted without a marker.

The source checkout configured by `NOVELCODE_DSH_CORE_ROOT` is read-only. Novel
workspaces are selected by each DSH session's immutable `cwd`; the provider starts
one sidecar per active workspace and terminates it when the plugin is disposed.

## Deployment boundary

- Supported now: a local workstation, or a remote host accessed through an SSH
  tunnel, with DSH bound to loopback.
- Run only one writing Host against a novel workspace. The current queue is
  process-local and does not coordinate multiple DSH processes.
- Do not expose the Web port directly to the public Internet. DSH's current Web
  carrier is a loopback development surface, not an authentication gateway.
- Model credentials remain in DSH settings or private environment files. Never
  commit them to this repository or a novel workspace.

## License

[MIT](LICENSE). Third-party projects listed in [the reference
manifest](references/README.md) are not vendored and retain their own licenses.

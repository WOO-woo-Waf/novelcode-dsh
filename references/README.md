# External Reference Manifest

This project does not vendor third-party working trees. Reference projects are
inspected at fixed commits and used for architecture, interaction, tests, or
algorithm comparison. Any later code reuse requires a fresh license audit and a
source notice.

| Project | Repository | Inspected commit | License finding | Intended use |
|---|---|---|---|---|
| DeepSeek Harness | `https://github.com/deepseek-ai/deepseek-harness` | `141eb6fef83422698aef7a981029e843e8161534` | MIT | Runtime, plugin, tool, session, approval, and Web contracts; pinned at `0.1.0-rc.8` |
| AI Novel Writer DSH plugin | `https://github.com/EthanYoQ/AI-Novel-Writer` | `6ae77d61b0895cd0fc64b63950b3178461ad82ea` | Root GPL-3.0; `plugins/dsh-ai-novel-writer` separately declares MIT | Approval cards, tested DSH plugin packaging, workbench layout |
| PRTSPro novel-workbench | `https://github.com/PRTSPro/novel-workbench` | `e1534cfb3a9adfa71f93e4e4616d2ccda4ce1050` | Package says BSD-3-Clause; no root license found | Branch simulation, `world_delta`, workspace gate, floating workbench; no code copy until clarified |
| dsh-tool-writing | `https://github.com/x2802490130-prog/dsh-tool-writing` | `59d2abf175317996d26931220d3f38a76eea775b` | MIT | Thread graph, evolution diff, hybrid retrieval, decision points, usage accounting |
| dsh-novel-writer | `https://github.com/akira399/dsh-novel-writer` | `3b389313113a2665500fa8624c88bff9b5e933d8` | MIT | Lorebook, context assembly, revision diff/undo, gated workflow, consistency simulation |
| dsh-novel | `https://github.com/ddedook/dsh-novel` | `8367905aef6421cc38c6c9455492dcdf67b594f6` | MIT | Per-book content UI, editable book skills, DSH install/build pattern; its database does not replace GBrain |
| siweina dsh-novel-writer | `https://github.com/siweina/dsh-novel-writer` | `f172c04a97cb07f771327ee5479551e3bc7d0931` | README claims MIT; repository metadata/tree did not establish a license | Local Chinese embedding, sentence analysis, pragmatic checks; research only until clarified |
| SillyTavern MemoryBooks | `https://github.com/aikohanasaki/SillyTavern-MemoryBooks` | `6b59df8d2a1614c3dacf9996a7df6e7ead47cb81` | AGPL-3.0 | Consolidation checkpoints, member lineage, unassigned-item reporting; mechanism only |
| Graphiti | `https://github.com/getzep/graphiti` | `993e081a6d7948a0d8851c12a5fbdbeb49fed862` | Apache-2.0 | Bi-temporal facts, episode provenance, invalidation semantics; optional derived provider later |
| Mem0 | `https://github.com/mem0ai/mem0` | `4fa483907704735ba0bec030e3c946ee1614b50e` | Apache-2.0 | Generic memory evaluation and extraction comparison, not a canon dependency |
| Letta | `https://github.com/letta-ai/letta` | `87fd37aab68c7bdd0d66fe63751553756f6af3e5` | Apache-2.0 | Agent memory-block and context-management comparison, not a fiction truth store |

The Novel Workbench research also audits Re3, DOC, LongWriter, DOME,
ReasoningNCP, LongLM-Eyas, awesome-novel-skill, NovelClaw, and MemoryBooks at
fixed commits. The new product preserves those conclusions rather than cloning
their source.

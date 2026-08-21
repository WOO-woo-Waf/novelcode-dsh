# NovelCode DSH Agent Instructions

This repository is the independent DeepSeek Harness product shell for NovelCode.
It must not vendor, rewrite, or mutate the source checkout configured by
`NOVELCODE_DSH_CORE_ROOT`.

## Product boundaries

- DeepSeek Harness owns sessions, the agent loop, tools, approvals, jobs, and Web composition.
- Narrative V2 owns fiction-domain behavior and remains behind the JSONL service seam.
- `.narrative/brain` Markdown remains the only durable novel-knowledge source of truth.
- GBrain/PGLite/graph/vector data are disposable derived indexes.
- Long prose stays in workspace files; tools return paths, hashes, counts, warnings, and next steps.
- DSH session events contain operational references only, never copied manuscript or canon bodies.

## Development

- Use Node 22+ and pnpm 11.
- Prefix shell commands with `rtk`.
- Keep DSH packages pinned to the tested release candidate.
- Add synthetic fixtures only. Never copy private novel workspaces, source chapters, drafts, logs, or databases here.
- All file edits use `apply_patch`.

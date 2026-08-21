# `@novelcode-dsh/web`

This package is the read-only DSH Web projection for NovelCode. It adds a
sidebar entry and a seven-surface workbench without adding model tools,
Narrative V2 actions, or another knowledge store.

The Host half accepts only an opaque DSH Workspace UUID over a loopback-only
RPC. It resolves the canonical workspace through `workspaceRegistry` and
returns compact project, source, timeline, character-knowledge, state,
planning, style, writing-run, and revision metadata. Manuscript and canon
bodies are never returned by this channel.

The browser half contributes to the native `sidebar.footer.action` and
`shell.overlay` slots. All state-changing decisions remain in the ordinary DSH
conversation and its native one-shot approval card.

```bash
pnpm --filter @novelcode-dsh/web build
pnpm --filter @novelcode-dsh/web test
dsh plugin --profile web add /absolute/path/to/novelcode-dsh/packages/web
```

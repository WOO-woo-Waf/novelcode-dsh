# `@novelcode-dsh/noveldsh`

This is the dedicated NovelCode DSH product assembly. It does not store canon
or replace Narrative V2/GBrain. Its CLI creates or validates the small product
ownership marker used before exposing a workspace to the novel tools.
`noveldsh assets` also reports the separate `@novelcode-dsh/web` package used
for the DSH-native seven-surface workbench.

```bash
pnpm --filter @novelcode-dsh/noveldsh build
pnpm noveldsh workspace init /path/to/novel
pnpm noveldsh workspace doctor /path/to/novel
pnpm noveldsh assets
```

An existing workspace containing `.narrative/v2/project.json` is accepted
without a marker, so existing Novel Workbench V2 novels remain compatible.

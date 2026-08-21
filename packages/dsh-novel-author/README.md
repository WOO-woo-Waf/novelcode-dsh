# @novelcode-dsh/novel-author

The first-party DSH host plugin for NovelCode. It provides `ctx.novel`, starts
one Narrative V2 JSONL sidecar per session workspace, registers the five V2
tool surfaces, requests approval for author-controlled transitions, and writes
log-only operational session events.

It does not contain a second novel database and does not copy manuscript or
canon bodies into DSH session history.

The package also ships four native DSH Skills under `skills/`: plot simulation,
state recording, style direction, and continuity review. They are process
instructions only and do not grant tools, write canon, or bypass author approval.

Versioned orchestration envelopes are recognized inside the existing
`narrative_blueprint_propose` and `narrative_memory_propose` actions. The Host
rebuilds the live Memory OS baseline from confirmed Brain Markdown and never
accepts caller-supplied confirmed events or knowledge.

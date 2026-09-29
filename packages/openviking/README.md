# OpenViking HTTP adapter

Small independently authored TypeScript client; no OpenViking server code or SDK
implementation is embedded. Runtime dependencies: Node 22+ only.

The contract was checked against the research workspace's pinned
`references/openviking-20260907` checkout (2026-09-08 observation), specifically
`openviking/server/routers/{resources,search,content,system,tasks}.py` and
`sdk/python/openviking_sdk/client.py`. The exact upstream commit is recorded in
`agent-harness-landscape/references/sources.lock.yaml`.

```ts
import { OpenVikingClient } from '@novelcode-dsh/openviking';

const client = new OpenVikingClient({ endpoint: 'http://127.0.0.1:19339' });
const root = 'viking://resources/novel-example';
const ingestion = await client.addResource('/synthetic/chapter.md', {
  targetUri: `${root}/source/chapter-v1`,
  wait: false,
});
// A successful enqueue is not a ready resource.
if (ingestion.task_id) await client.resourceStatus(ingestion.task_id);
const hits = await client.find('人物当下目标与上一场戏的约定', root, 5);
if (hits[0]) await client.read(hits[0].uri, { limit: 80 });
```

- A local file is multipart-uploaded before ingestion; directories are rejected
  explicitly. Resource manifests should sync each file separately.
- HTTP(S) resources use the remote-source `path` contract directly.
- `targetUri` maps to exact upstream `to`; `parentUri` maps to `parent`. They are
  mutually exclusive. The caller chooses a stable per-novel resource root.
- Default ingestion is asynchronous. `state: ready` requires a completed task
  or the successful synchronous completion shape, never just HTTP 200.
- `health()` checks the upstream liveness endpoint, not embedding/retrieval quality.
- Every method accepts an optional `AbortSignal`; each HTTP request has its own
  deadline (`timeoutMs`, default 30 seconds). Long synchronous ingestion may need
  both a larger client timeout and upstream `timeoutSeconds`.
- This package does not write Narrative V2 state or make retrieved resources canon.
- Offline tests use synthetic local files and mocked HTTP responses only. They
  verify protocol behavior, not live OpenViking/model quality.

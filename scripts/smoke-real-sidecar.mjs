import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  JsonlSidecarProvider,
  sidecarLaunchFromEnv,
} from "../packages/jsonl-provider/lib/index.js"

const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-real-"))
const coreRoot = process.env.NOVELCODE_DSH_CORE_ROOT
if (!coreRoot) {
  throw new Error("set NOVELCODE_DSH_CORE_ROOT to a readable Novel Workbench checkout")
}
const provider = new JsonlSidecarProvider({
  launch: sidecarLaunchFromEnv({
    ...process.env,
    NOVELCODE_DSH_CORE_ROOT: resolve(coreRoot),
  }),
  requestTimeoutMs: 30_000,
})

try {
  const actions = process.argv.includes("--init")
    ? [
      { action: "narrative_project_init", project_id: "synthetic-smoke", project_title: "Synthetic Smoke" },
      { action: "narrative_project_status" },
    ]
    : [{ action: "narrative_project_status" }]
  const reports = []
  for (const request of actions) {
    const result = await provider.execute(request, { workspace })
    if (typeof result.success !== "boolean" || result.summary.length === 0) {
      throw new Error("real Narrative V2 sidecar returned an invalid result")
    }
    if (process.argv.includes("--init") && !result.success) {
      throw new Error(`${request.action} failed: ${result.summary}`)
    }
    reports.push({
      action: request.action,
      success: result.success,
      artifactCount: result.artifacts.length,
      metricKeys: Object.keys(result.metrics).sort(),
    })
  }
  process.stdout.write(`${JSON.stringify({
    transport: "ready",
    reports,
  })}\n`)
} finally {
  provider.close()
  await rm(workspace, { recursive: true, force: true })
}

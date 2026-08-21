#!/usr/bin/env node
import { inspectWorkspace, initializeWorkspace } from "./workspace.js"
import { resolveProductAssets } from "./assets.js"

async function main(argv: string[]): Promise<number> {
  const [command, action, path = process.cwd(), ...extra] = argv
  if (command === "workspace" && action === "init" && extra.length === 0) {
    console.log(JSON.stringify(await initializeWorkspace(path), null, 2))
    return 0
  }
  if (command === "workspace" && action === "doctor" && extra.length === 0) {
    const report = await inspectWorkspace(path)
    console.log(JSON.stringify(report, null, 2))
    return report.eligible ? 0 : 2
  }
  if (command === "assets" && action === undefined) {
    console.log(JSON.stringify(resolveProductAssets(), null, 2))
    return 0
  }
  console.error("Usage: noveldsh workspace <init|doctor> [path]\n       noveldsh assets")
  return 64
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

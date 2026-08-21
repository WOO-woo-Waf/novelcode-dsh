import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import {
  NOVELCODE_DSH_WORKSPACE_MARKER,
  NOVELCODE_DSH_WORKSPACE_SCHEMA,
  NOVELCODE_V2_PROJECT_MANIFEST,
  isNovelCodeDshWorkspaceMarker,
  type NovelCodeDshWorkspaceMarker,
} from "@novelcode-dsh/contracts"

export interface WorkspaceInspection {
  workspace: string
  marker: "valid" | "missing" | "invalid"
  narrativeV2: boolean
  eligible: boolean
}

const MARKER: NovelCodeDshWorkspaceMarker = {
  schema: NOVELCODE_DSH_WORKSPACE_SCHEMA,
  product: "novelcode-dsh",
  scope: "single-novel",
}

export async function initializeWorkspace(path: string): Promise<WorkspaceInspection> {
  const requested = resolve(path)
  await mkdir(requested, { recursive: true })
  const workspace = await realpath(requested)
  const inspection = await inspectWorkspace(workspace)
  if (inspection.marker === "invalid") {
    throw new Error(`refusing to overwrite invalid workspace marker: ${NOVELCODE_DSH_WORKSPACE_MARKER}`)
  }
  if (inspection.marker === "missing") {
    const target = join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER)
    await mkdir(resolve(target, ".."), { recursive: true })
    try {
      await writeFile(target, `${JSON.stringify(MARKER, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
  }
  return await inspectWorkspace(workspace)
}

export async function inspectWorkspace(path: string): Promise<WorkspaceInspection> {
  const workspace = await realpath(resolve(path))
  const [marker, narrativeV2] = await Promise.all([
    inspectMarker(workspace),
    pathExists(join(workspace, NOVELCODE_V2_PROJECT_MANIFEST)),
  ])
  return {
    workspace,
    marker,
    narrativeV2,
    eligible: marker === "valid" || narrativeV2,
  }
}

async function inspectMarker(workspace: string): Promise<WorkspaceInspection["marker"]> {
  try {
    const value = JSON.parse(await readFile(join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER), "utf8")) as unknown
    return isNovelCodeDshWorkspaceMarker(value) ? "valid" : "invalid"
  } catch (error) {
    return isNotFound(error) ? "missing" : "invalid"
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST"
}

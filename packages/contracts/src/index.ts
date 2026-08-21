export const NARRATIVE_PROJECT_ACTIONS = [
  "narrative_project_init",
  "narrative_project_status",
  "narrative_project_doctor",
] as const

export const NARRATIVE_SOURCE_ACTIONS = [
  "narrative_source_register",
  "narrative_source_prepare",
  "narrative_source_status",
  "narrative_source_record_analysis",
  "narrative_source_diff",
  "narrative_source_synthesis_prepare",
  "narrative_source_materialize",
  "narrative_reference_export",
  "narrative_reference_import",
  "narrative_legacy_metadata_export",
] as const

export const NARRATIVE_MEMORY_ACTIONS = [
  "narrative_memory_connect",
  "narrative_memory_search",
  "narrative_memory_graph",
  "narrative_memory_consistency_check",
  "narrative_memory_propose",
  "narrative_memory_observe",
  "narrative_memory_promote",
  "narrative_memory_submit_review",
  "narrative_memory_retire",
  "narrative_memory_review",
  "narrative_memory_confirm",
  "narrative_story_contract_propose",
  "narrative_style_constitution_propose",
] as const

export const NARRATIVE_PLAN_ACTIONS = [
  "narrative_blueprint_propose",
  "narrative_blueprint_confirm",
] as const

export const NARRATIVE_WRITING_ACTIONS = [
  "narrative_writing_prepare",
  "narrative_segment_record",
  "narrative_segment_handoff",
  "narrative_evaluate",
  "narrative_feedback_absorb",
  "narrative_chapter_approve",
  "narrative_chapter_export",
] as const

export const NARRATIVE_V2_ACTIONS = [
  ...NARRATIVE_PROJECT_ACTIONS,
  ...NARRATIVE_SOURCE_ACTIONS,
  ...NARRATIVE_MEMORY_ACTIONS,
  ...NARRATIVE_PLAN_ACTIONS,
  ...NARRATIVE_WRITING_ACTIONS,
] as const

export const NARRATIVE_HIGH_RISK_ACTIONS = [
  "narrative_memory_confirm",
  "narrative_memory_retire",
  "narrative_blueprint_confirm",
  "narrative_chapter_approve",
  "narrative_chapter_export",
] as const satisfies readonly NarrativeV2Action[]

export type NarrativeProjectAction = (typeof NARRATIVE_PROJECT_ACTIONS)[number]
export type NarrativeSourceAction = (typeof NARRATIVE_SOURCE_ACTIONS)[number]
export type NarrativeMemoryAction = (typeof NARRATIVE_MEMORY_ACTIONS)[number]
export type NarrativePlanAction = (typeof NARRATIVE_PLAN_ACTIONS)[number]
export type NarrativeWritingAction = (typeof NARRATIVE_WRITING_ACTIONS)[number]
export type NarrativeV2Action = (typeof NARRATIVE_V2_ACTIONS)[number]
export type NarrativeHighRiskAction = (typeof NARRATIVE_HIGH_RISK_ACTIONS)[number]

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const NOVELCODE_DSH_WORKSPACE_MARKER = ".novelcode/noveldsh.json" as const
export const NOVELCODE_DSH_WORKSPACE_SCHEMA = "novelcode-dsh-workspace/v1" as const
export const NOVELCODE_V2_PROJECT_MANIFEST = ".narrative/v2/project.json" as const

export interface NovelCodeDshWorkspaceMarker {
  schema: typeof NOVELCODE_DSH_WORKSPACE_SCHEMA
  product: "novelcode-dsh"
  scope: "single-novel"
}

export function isNovelCodeDshWorkspaceMarker(value: unknown): value is NovelCodeDshWorkspaceMarker {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const marker = value as Record<string, unknown>
  return marker.schema === NOVELCODE_DSH_WORKSPACE_SCHEMA
    && marker.product === "novelcode-dsh"
    && marker.scope === "single-novel"
}

export interface NarrativeToolInput {
  action: NarrativeV2Action
  cwd?: string
  project_id?: string
  project_title?: string
  language?: string
  embedding_model?: string
  embedding_dimensions?: number
  source_paths?: string[]
  query?: string
  feedback?: string
  payload_path?: string
  payload?: Record<string, unknown>
  session_id?: string
  opencode_session_id?: string
  [key: string]: unknown
}

export interface NarrativeToolResult {
  success: boolean
  summary: string
  artifacts: string[]
  metrics: Record<string, number>
  warnings?: string[]
  next?: string[]
  payload?: JsonValue
}

export type NarrativeToolName =
  | "narrative_project"
  | "narrative_source"
  | "narrative_memory"
  | "narrative_plan"
  | "narrative_writing"

const actions = new Set<string>(NARRATIVE_V2_ACTIONS)
const highRiskActions = new Set<string>(NARRATIVE_HIGH_RISK_ACTIONS)

export function isNarrativeV2Action(value: unknown): value is NarrativeV2Action {
  return typeof value === "string" && actions.has(value)
}

export function isHighRiskNarrativeAction(value: unknown): value is NarrativeHighRiskAction {
  return typeof value === "string" && highRiskActions.has(value)
}

export function actionBelongsToTool(tool: NarrativeToolName, action: NarrativeV2Action): boolean {
  switch (tool) {
    case "narrative_project":
      return (NARRATIVE_PROJECT_ACTIONS as readonly string[]).includes(action)
    case "narrative_source":
      return (NARRATIVE_SOURCE_ACTIONS as readonly string[]).includes(action)
    case "narrative_memory":
      return (NARRATIVE_MEMORY_ACTIONS as readonly string[]).includes(action)
    case "narrative_plan":
      return (NARRATIVE_PLAN_ACTIONS as readonly string[]).includes(action)
    case "narrative_writing":
      return (NARRATIVE_WRITING_ACTIONS as readonly string[]).includes(action)
  }
}

import type { NarrativeToolResult, NarrativeV2Action } from "@novelcode-dsh/contracts"

export const NOVEL_SESSION_EVENT_TYPES = [
  "novel/project-bound",
  "novel/source-job",
  "novel/memory-transition",
  "novel/blueprint-transition",
  "novel/writing-run-prepared",
  "novel/segment-recorded",
  "novel/evaluation-completed",
  "novel/author-approved",
  "novel/chapter-revision",
  "novel/final-ledger-updated",
] as const

export type NovelSessionEventType = (typeof NOVEL_SESSION_EVENT_TYPES)[number]

export interface NovelOperationalEventData {
  action: NarrativeV2Action
  success: boolean
  artifacts: string[]
  metricKeys: string[]
}

declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap {
    "novel/project-bound": NovelOperationalEventData
    "novel/source-job": NovelOperationalEventData
    "novel/memory-transition": NovelOperationalEventData
    "novel/blueprint-transition": NovelOperationalEventData
    "novel/writing-run-prepared": NovelOperationalEventData
    "novel/segment-recorded": NovelOperationalEventData
    "novel/evaluation-completed": NovelOperationalEventData
    "novel/author-approved": NovelOperationalEventData
    "novel/chapter-revision": NovelOperationalEventData
    "novel/final-ledger-updated": NovelOperationalEventData
  }
}

export function eventForAction(action: NarrativeV2Action): NovelSessionEventType | undefined {
  if (action.startsWith("narrative_project_")) return "novel/project-bound"
  if (action.startsWith("narrative_source_") || action.startsWith("narrative_reference_")) {
    return "novel/source-job"
  }
  if (action.startsWith("narrative_memory_")
    || action === "narrative_story_contract_propose"
    || action === "narrative_style_constitution_propose") {
    return "novel/memory-transition"
  }
  if (action.startsWith("narrative_blueprint_")) return "novel/blueprint-transition"
  if (action === "narrative_writing_prepare") return "novel/writing-run-prepared"
  if (action === "narrative_segment_record" || action === "narrative_segment_handoff") {
    return "novel/segment-recorded"
  }
  if (action === "narrative_evaluate" || action === "narrative_feedback_absorb") {
    return "novel/evaluation-completed"
  }
  if (action === "narrative_chapter_approve") return "novel/chapter-revision"
  if (action === "narrative_chapter_export") return "novel/final-ledger-updated"
  return undefined
}

export function operationalEventData(
  action: NarrativeV2Action,
  result: NarrativeToolResult,
): NovelOperationalEventData {
  return {
    action,
    success: result.success,
    artifacts: [...result.artifacts],
    metricKeys: Object.keys(result.metrics).sort(),
  }
}

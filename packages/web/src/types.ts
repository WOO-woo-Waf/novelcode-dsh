import type { JsonValue } from "@novelcode-dsh/contracts"

export const NOVEL_WORKBENCH_SNAPSHOT_SCHEMA = "novelcode-workbench-snapshot-v1" as const

export type WorkbenchLifecycle =
  | "observation"
  | "candidate"
  | "pending_review"
  | "confirmed"
  | "superseded"
  | "archived"
  | "missing"
  | "invalid"

export interface LifecycleCounts {
  observation: number
  candidate: number
  pending_review: number
  confirmed: number
  superseded: number
  archived: number
  other: number
}

export interface WorkbenchTimelineEvent {
  id: string
  eventType: string
  sequence: number
  label?: string
  chapterIndex: number
  sceneId?: string
  participants: string[]
  causes: string[]
  effectKeys: string[]
}

export interface WorkbenchKnowledgeClaim {
  id: string
  claimId: string
  subjectId: string
  stance: "knows" | "believes" | "suspects" | "disbelieves" | "unknown"
  confidence: number
  acquiredAtSequence: number
  validUntilSequence?: number
  visibilityScope: string[]
}

export interface WorkbenchStateValue {
  key: string
  value: JsonValue
}

export interface WorkbenchWritingRun {
  runId: string
  blueprintId: string
  chapterIndex: number
  chapterTitle: string
  status: "drafting" | "evaluated" | "approved"
  segments: number
  recordedSegments: number
  shortSegments: number
  updatedAt: string
  approvedRevisionId?: string
  approvedContentSha256?: string
}

export interface WorkbenchFinalEntry {
  chapterIndex: number
  revision: string
  hash: string
  active: boolean
}

export interface NovelWorkbenchSnapshot {
  schema: typeof NOVEL_WORKBENCH_SNAPSHOT_SCHEMA
  generatedAt: string
  workspace: {
    bound: true
    mode: "marker_only" | "v2"
  }
  project: {
    status: "marker_only" | "ready" | "degraded" | "invalid"
    projectId?: string
    title?: string
    language?: string
    createdAt?: string
    missingPaths: string[]
    authorGates: {
      storyContract: WorkbenchLifecycle
      styleConstitution: WorkbenchLifecycle
      activeBlueprint: WorkbenchLifecycle
      proseProfile: WorkbenchLifecycle
    }
    derivedIndex: "connected" | "not_initialized"
  }
  sources: {
    registered: number
    active: number
    files: number
    roleCounts: Record<string, number>
    analysisRevisions: number
    analysisStatusCounts: Record<string, number>
  }
  openviking?: {
    entries: Array<{ path: string; kind: string; state: string; uri: string; chapter?: number }>
    ready: number
    pending: number
  }
  memory: {
    status: "ready" | "empty" | "invalid"
    baselineCanonHash: string
    markdownPages: number
    lifecycleCounts: LifecycleCounts
    events: WorkbenchTimelineEvent[]
    knowledge: WorkbenchKnowledgeClaim[]
    state: {
      throughSequence: number
      values: WorkbenchStateValue[]
      appliedEvents: number
      conflicts: number
    }
  }
  planning: {
    blueprintPages: number
    confirmedBlueprints: number
    branchPages: number
    pendingPages: number
  }
  style: {
    craftPages: number
    confirmedPages: number
    pendingPages: number
    revisionPreferencePages: number
  }
  writing: {
    runs: WorkbenchWritingRun[]
    statusCounts: Record<string, number>
  }
  versions: {
    approvedRevisions: number
    finalEntries: WorkbenchFinalEntry[]
    activeFinalChapters: number
  }
  warnings: string[]
}

export function emptyLifecycleCounts(): LifecycleCounts {
  return {
    observation: 0,
    candidate: 0,
    pending_review: 0,
    confirmed: 0,
    superseded: 0,
    archived: 0,
    other: 0,
  }
}

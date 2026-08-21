import { readdir, readFile, realpath } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import type {
  EntityStateTransition,
  EvidenceRef,
  KnowledgeClaim,
  KnowledgeStance,
  NarrativeLocator,
  StoryEvent,
  StoryTime,
  ValidityWindow,
} from "@novelcode-dsh/memory-model"
import { baselineCanonHash } from "@novelcode-dsh/simulation"

const DATA_PATTERN = /<!-- novelcode:data:begin -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- novelcode:data:end -->/u
const KNOWLEDGE_STANCES = new Set<KnowledgeStance>(["knows", "believes", "suspects", "disbelieves", "unknown"])

export interface ConfirmedMemorySnapshot {
  events: StoryEvent[]
  knowledge: KnowledgeClaim[]
  baselineCanonHash: string
  sourcePaths: string[]
}

export async function loadConfirmedMemorySnapshot(workspace: string): Promise<ConfirmedMemorySnapshot> {
  const root = await realpath(workspace)
  const brain = join(root, ".narrative", "brain")
  const files = await markdownFiles(brain)
  const events: StoryEvent[] = []
  const knowledge: KnowledgeClaim[] = []
  const sourcePaths: string[] = []
  for (const file of files.sort()) {
    const selected = relative(brain, file).split(sep)
    if (selected.includes("staging") || selected.includes("archive")) continue
    const page = parsePage(await readFile(file, "utf8"), workspaceRelative(root, file))
    if (page === undefined) continue
    if (page.frontmatter.lifecycle !== "confirmed" && page.frontmatter.approval_state !== "confirmed") continue
    const schema = page.data?.memory_os_schema
    if (schema === "story-event/v1") {
      events.push(storyEvent(page))
      sourcePaths.push(page.path)
    } else if (schema === "knowledge-claim/v1") {
      knowledge.push(knowledgeClaim(page))
      sourcePaths.push(page.path)
    }
  }
  assertUnique(events.map((item) => item.id), "confirmed StoryEvent IDs")
  assertUnique(knowledge.map((item) => item.id), "confirmed KnowledgeClaim IDs")
  return {
    events,
    knowledge,
    baselineCanonHash: baselineCanonHash(events, knowledge),
    sourcePaths: sourcePaths.sort(),
  }
}

interface ParsedPage {
  frontmatter: Record<string, unknown>
  data?: Record<string, unknown>
  path: string
}

function storyEvent(page: ParsedPage): StoryEvent {
  const data = requiredRecord(page.data, `${page.path} data`)
  return {
    id: requiredString(page.frontmatter.id, `${page.path} id`),
    eventType: requiredString(data.event_type, `${page.path} event_type`),
    lifecycle: "confirmed",
    storyTime: storyTime(data.story_time, `${page.path} story_time`),
    narrativePosition: narrativeLocator(data.narrative_position, `${page.path} narrative_position`),
    validity: validityWindow(data.validity, `${page.path} validity`),
    participants: stringArray(data.participants, `${page.path} participants`),
    causes: stringArray(data.causes, `${page.path} causes`),
    effects: transitions(data.effects, `${page.path} effects`),
    evidence: evidenceRefs(data.evidence_refs, page.frontmatter.evidence, page.path),
    recordedAt: requiredString(data.recorded_at, `${page.path} recorded_at`),
  }
}

function knowledgeClaim(page: ParsedPage): KnowledgeClaim {
  const data = requiredRecord(page.data, `${page.path} data`)
  const stance = requiredString(data.stance, `${page.path} stance`)
  if (!KNOWLEDGE_STANCES.has(stance as KnowledgeStance)) throw new Error(`${page.path} has invalid knowledge stance`)
  const confidence = requiredNumber(data.confidence, `${page.path} confidence`)
  if (confidence < 0 || confidence > 1) throw new Error(`${page.path} confidence must be between 0 and 1`)
  const validUntil = optionalNonNegativeInteger(data.valid_until_sequence, `${page.path} valid_until_sequence`)
  return {
    id: requiredString(page.frontmatter.id, `${page.path} id`),
    claimId: requiredString(data.claim_id, `${page.path} claim_id`),
    subjectId: requiredString(data.subject_id, `${page.path} subject_id`),
    stance: stance as KnowledgeStance,
    confidence,
    lifecycle: "confirmed",
    acquiredAt: storyTime(data.acquired_at, `${page.path} acquired_at`),
    ...(validUntil === undefined ? {} : { validUntilSequence: validUntil }),
    evidence: evidenceRefs(data.evidence_refs, page.frontmatter.evidence, page.path),
    visibilityScope: stringArray(data.visibility_scope, `${page.path} visibility_scope`),
  }
}

function parsePage(text: string, path: string): ParsedPage | undefined {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u)
  if (match === null) return undefined
  const frontmatter = Object.fromEntries(match[1]!.split(/\r?\n/u).flatMap((line) => {
    const separator = line.indexOf(":")
    if (separator < 1) return []
    const key = line.slice(0, separator).trim()
    const raw = line.slice(separator + 1).trim()
    try {
      return [[key, raw.length === 0 ? "" : JSON.parse(raw) as unknown]]
    } catch {
      return [[key, raw]]
    }
  }))
  const dataMatch = text.match(DATA_PATTERN)
  const data = dataMatch === null ? undefined : requiredRecord(JSON.parse(dataMatch[1]!), `${path} data`)
  return { frontmatter, ...(data === undefined ? {} : { data }), path }
}

async function markdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
    throw error
  })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = join(root, entry.name)
    if (entry.isDirectory()) return markdownFiles(target)
    return entry.isFile() && entry.name.endsWith(".md") ? [target] : []
  }))
  return nested.flat()
}

function evidenceRefs(primary: unknown, fallback: unknown, path: string): EvidenceRef[] {
  if (Array.isArray(primary)) return primary.map((item, index) => evidenceRef(item, `${path} evidence_refs[${index}]`))
  if (!Array.isArray(fallback)) throw new Error(`${path} requires evidence_refs or frontmatter evidence`)
  return fallback.map((item, index) => parseEvidenceString(requiredString(item, `${path} evidence[${index}]`), path))
}

function evidenceRef(value: unknown, label: string): EvidenceRef {
  const item = requiredRecord(value, label)
  return {
    sourceId: requiredString(item.sourceId, `${label}.sourceId`),
    revisionHash: requiredString(item.revisionHash, `${label}.revisionHash`),
    locator: requiredString(item.locator, `${label}.locator`),
  }
}

function parseEvidenceString(value: string, path: string): EvidenceRef {
  const hashAt = value.lastIndexOf("@")
  const locatorAt = value.indexOf("#", hashAt + 1)
  if (hashAt < 1 || locatorAt <= hashAt + 1 || locatorAt === value.length - 1) {
    throw new Error(`${path} contains an invalid Memory OS evidence reference`)
  }
  return { sourceId: value.slice(0, hashAt), revisionHash: value.slice(hashAt + 1, locatorAt), locator: value.slice(locatorAt + 1) }
}

function storyTime(value: unknown, label: string): StoryTime {
  const input = requiredRecord(value, label)
  const sequence = requiredNonNegativeInteger(input.sequence, `${label}.sequence`)
  const calendar = optionalString(input.calendar, `${label}.calendar`)
  const timeLabel = optionalString(input.label, `${label}.label`)
  return { sequence, ...(calendar === undefined ? {} : { calendar }), ...(timeLabel === undefined ? {} : { label: timeLabel }) }
}

function narrativeLocator(value: unknown, label: string): NarrativeLocator {
  const input = requiredRecord(value, label)
  const arcId = optionalString(input.arcId, `${label}.arcId`)
  const sceneId = optionalString(input.sceneId, `${label}.sceneId`)
  const segmentId = optionalString(input.segmentId, `${label}.segmentId`)
  return {
    ...(arcId === undefined ? {} : { arcId }),
    chapterIndex: requiredPositiveInteger(input.chapterIndex, `${label}.chapterIndex`),
    ...(sceneId === undefined ? {} : { sceneId }),
    ...(segmentId === undefined ? {} : { segmentId }),
    order: requiredNonNegativeInteger(input.order, `${label}.order`),
  }
}

function validityWindow(value: unknown, label: string): ValidityWindow {
  const input = requiredRecord(value, label)
  const toSequence = optionalNonNegativeInteger(input.toSequence, `${label}.toSequence`)
  return {
    fromSequence: requiredNonNegativeInteger(input.fromSequence, `${label}.fromSequence`),
    ...(toSequence === undefined ? {} : { toSequence }),
  }
}

function transitions(value: unknown, label: string): EntityStateTransition[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((selected, index) => {
    const item = requiredRecord(selected, `${label}[${index}]`)
    if (item.operation !== "set" && item.operation !== "unset") throw new Error(`${label}[${index}] has invalid operation`)
    return {
      entityId: requiredString(item.entityId, `${label}[${index}].entityId`),
      fieldPath: requiredString(item.fieldPath, `${label}[${index}].fieldPath`),
      operation: item.operation,
      ...(item.previous === undefined ? {} : { previous: item.previous as never }),
      ...(item.next === undefined ? {} : { next: item.next as never }),
    }
  })
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, label)
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((item, index) => requiredString(item, `${label}[${index}]`))
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
  return value
}

function requiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
  return value
}

function requiredPositiveInteger(value: unknown, label: string): number {
  const selected = requiredNonNegativeInteger(value, label)
  if (selected === 0) throw new Error(`${label} must be positive`)
  return selected
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : requiredNonNegativeInteger(value, label)
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

function workspaceRelative(root: string, target: string): string {
  const selected = relative(root, resolve(target))
  if (selected === ".." || selected.startsWith(`..${sep}`)) throw new Error("Memory OS page escaped workspace")
  return selected.split(sep).join("/")
}

import type { JsonValue } from "@novelcode-dsh/contracts"
import type {
  ConsolidationAudit,
  EpisodeSummary,
  KnowledgeClaim,
  StateProjection,
  StoryEvent,
} from "./types.js"

export function projectConfirmedState(
  events: readonly StoryEvent[],
  throughSequence: number,
): StateProjection {
  assertSequence(throughSequence)
  const values: Record<string, JsonValue> = {}
  const conflicts: StateProjection["conflicts"] = []
  const appliedEventIds: string[] = []

  const eligible = events
    .filter((event) => event.lifecycle === "confirmed"
      && event.storyTime.sequence <= throughSequence
      && event.validity.fromSequence <= throughSequence
      && (event.validity.toSequence === undefined || event.validity.toSequence >= throughSequence))
    .toSorted((left, right) => left.storyTime.sequence - right.storyTime.sequence
      || left.narrativePosition.order - right.narrativePosition.order
      || left.id.localeCompare(right.id))

  for (const event of eligible) {
    let applied = false
    for (const transition of event.effects) {
      const key = stateKey(transition.entityId, transition.fieldPath)
      const actual = values[key]
      if (transition.previous !== undefined && !jsonEquals(actual, transition.previous)) {
        conflicts.push({
          eventId: event.id,
          entityId: transition.entityId,
          fieldPath: transition.fieldPath,
          expected: transition.previous,
          ...(actual === undefined ? {} : { actual }),
          reason: "previous_mismatch",
        })
        continue
      }
      if (transition.operation === "set") {
        if (transition.next === undefined) {
          conflicts.push({
            eventId: event.id,
            entityId: transition.entityId,
            fieldPath: transition.fieldPath,
            reason: "missing_next_value",
          })
          continue
        }
        values[key] = cloneJson(transition.next)
      } else {
        delete values[key]
      }
      applied = true
    }
    if (applied || event.effects.length === 0) appliedEventIds.push(event.id)
  }

  return { throughSequence, values, appliedEventIds, conflicts }
}

export function visibleKnowledgeAt(
  claims: readonly KnowledgeClaim[],
  subjectId: string,
  throughSequence: number,
): KnowledgeClaim[] {
  assertSequence(throughSequence)
  const latestByClaim = new Map<string, KnowledgeClaim>()
  for (const claim of claims) {
    if (claim.lifecycle !== "confirmed"
      || claim.subjectId !== subjectId
      || claim.acquiredAt.sequence > throughSequence
      || (claim.validUntilSequence !== undefined && claim.validUntilSequence < throughSequence)) continue
    const current = latestByClaim.get(claim.claimId)
    if (current === undefined
      || current.acquiredAt.sequence < claim.acquiredAt.sequence
      || current.acquiredAt.sequence === claim.acquiredAt.sequence && current.id.localeCompare(claim.id) < 0) {
      latestByClaim.set(claim.claimId, claim)
    }
  }
  return [...latestByClaim.values()].toSorted((left, right) => left.claimId.localeCompare(right.claimId))
}

export function auditConsolidation(
  summary: EpisodeSummary,
  availableMemberIds: readonly string[],
): ConsolidationAudit {
  const available = new Set(availableMemberIds)
  const seen = new Set<string>()
  const duplicateMemberIds = new Set<string>()
  const unknownMemberIds = new Set<string>()
  for (const id of summary.memberIds) {
    if (seen.has(id)) duplicateMemberIds.add(id)
    seen.add(id)
    if (!available.has(id)) unknownMemberIds.add(id)
  }
  const omittedMemberIds = availableMemberIds.filter((id) => !seen.has(id)).sort()
  return {
    duplicateMemberIds: [...duplicateMemberIds].sort(),
    unknownMemberIds: [...unknownMemberIds].sort(),
    omittedMemberIds,
    valid: duplicateMemberIds.size === 0
      && unknownMemberIds.size === 0
      && omittedMemberIds.length === 0
      && summary.unassignedItems.length === 0,
  }
}

export function revisionPreferenceExecutable(input: {
  lifecycle: string
  repeatedEvidenceCount: number
  evidence: readonly unknown[]
  conditions: Readonly<Record<string, unknown>>
}): boolean {
  return input.lifecycle === "confirmed"
    && Number.isSafeInteger(input.repeatedEvidenceCount)
    && input.repeatedEvidenceCount >= 2
    && input.evidence.length >= 2
    && Object.keys(input.conditions).length > 0
}

export function stateKey(entityId: string, fieldPath: string): string {
  return `${entityId}:${fieldPath}`
}

function assertSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("story sequence must be a non-negative integer")
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right)
}

function cloneJson<T extends JsonValue>(value: T): T {
  return structuredClone(value)
}

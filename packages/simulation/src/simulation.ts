import { createHash } from "node:crypto"
import type { JsonValue } from "@novelcode-dsh/contracts"
import {
  projectConfirmedState,
  stateKey,
  visibleKnowledgeAt,
  type EntityStateTransition,
  type KnowledgeClaim,
  type StateProjection,
  type StoryEvent,
} from "@novelcode-dsh/memory-model"
import type {
  BranchConstraint,
  BranchProposalSeed,
  BranchSimulationInput,
  BranchSimulationResult,
  BranchViolation,
} from "./types.js"

export function baselineCanonHash(
  events: readonly StoryEvent[],
  knowledge: readonly KnowledgeClaim[],
): string {
  const confirmedEvents = events
    .filter((event) => event.lifecycle === "confirmed")
    .toSorted(compareEvents)
  const confirmedKnowledge = knowledge
    .filter((claim) => claim.lifecycle === "confirmed")
    .toSorted((left, right) => left.id.localeCompare(right.id))
  return createHash("sha256")
    .update(stableJson({ events: confirmedEvents, knowledge: confirmedKnowledge }))
    .digest("hex")
}

export function simulateBranch(input: BranchSimulationInput): BranchSimulationResult {
  if (input.branch.status !== "sandbox") {
    throw new Error("only sandbox branches can be simulated")
  }
  assertSequence(input.throughSequence)
  const baselineHash = baselineCanonHash(input.baselineEvents, input.baselineKnowledge)
  const baseline = projectConfirmedState(input.baselineEvents, input.throughSequence)
  const violations: BranchViolation[] = []
  const candidates = input.candidateEvents.toSorted(compareEvents)

  for (const conflict of baseline.conflicts) {
    violations.push({
      kind: "projection_conflict",
      hard: true,
      eventId: conflict.eventId,
      message: `confirmed baseline contains ${conflict.reason} for ${stateKey(conflict.entityId, conflict.fieldPath)}`,
    })
  }
  for (const conflict of input.branch.conflicts) {
    violations.push({
      kind: "declared_conflict",
      hard: true,
      message: `branch declares an unresolved conflict: ${conflict}`,
    })
  }

  if (input.branch.baselineCanonHash !== baselineHash) {
    violations.push({
      kind: "stale_baseline",
      hard: true,
      message: "branch baseline hash no longer matches confirmed canon",
    })
  }
  validateCandidateIdentity(input, candidates, violations)

  const values = structuredClone(baseline.values)
  const appliedEventIds = [...baseline.appliedEventIds]
  const conflicts = [...baseline.conflicts]
  const stateBeforeEvent = new Map<string, Record<string, JsonValue>>()
  const baselineById = new Map(
    input.baselineEvents
      .filter((event) => event.lifecycle === "confirmed")
      .map((event) => [event.id, event]),
  )
  const priorCandidateIds = new Set<string>()

  for (const event of candidates) {
    stateBeforeEvent.set(event.id, structuredClone(values))
    if (event.lifecycle !== "candidate") {
      violations.push({
        kind: "candidate_lifecycle",
        hard: true,
        eventId: event.id,
        message: `sandbox event ${event.id} must remain candidate`,
      })
    }
    for (const cause of event.causes) {
      const baselineCause = baselineById.get(cause)
      if (!priorCandidateIds.has(cause)
        && (baselineCause === undefined || compareEvents(baselineCause, event) >= 0)) {
        violations.push({
          kind: "missing_or_forward_cause",
          hard: true,
          eventId: event.id,
          message: `event ${event.id} references missing or forward cause ${cause}`,
        })
      }
    }
    priorCandidateIds.add(event.id)
    if (!eventApplies(event, input.throughSequence)) continue
    let applied = event.effects.length === 0
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
        violations.push({
          kind: "projection_conflict",
          hard: true,
          eventId: event.id,
          message: `event ${event.id} expected a different previous value for ${key}`,
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
          violations.push({
            kind: "projection_conflict",
            hard: true,
            eventId: event.id,
            message: `event ${event.id} has a set transition without a next value for ${key}`,
          })
          continue
        }
        values[key] = structuredClone(transition.next)
      } else {
        delete values[key]
      }
      applied = true
    }
    if (applied) appliedEventIds.push(event.id)
  }

  evaluateConstraints(input, candidates, stateBeforeEvent, violations)
  const projected: StateProjection = {
    throughSequence: input.throughSequence,
    values,
    appliedEventIds,
    conflicts,
  }
  const worldDelta = difference(baseline.values, values)
  if (!sameTransitions(input.branch.stateDelta, worldDelta)) {
    violations.push({
      kind: "state_delta_mismatch",
      hard: true,
      message: "declared branch stateDelta does not match simulated world delta",
    })
  }
  const hardViolations = violations.filter((item) => item.hard).length
  const softViolations = violations.length - hardViolations
  const score = clamp(
    100
      - hardViolations * 30
      - softViolations * 5
      - conflicts.length * 10
      - input.branch.costs.length * 3
      + Math.min(input.branch.foreshadowImpacts.length * 2, 10),
    0,
    100,
  )
  return {
    branchId: input.branch.id,
    baselineCanonHash: baselineHash,
    viable: hardViolations === 0,
    baseline,
    projected,
    worldDelta,
    violations,
    metrics: {
      hardViolations,
      softViolations,
      projectionConflicts: conflicts.length,
      costs: input.branch.costs.length,
      foreshadowImpacts: input.branch.foreshadowImpacts.length,
      declaredConflicts: input.branch.conflicts.length,
      score,
    },
  }
}

export function rankBranchCandidates(results: readonly BranchSimulationResult[]): BranchSimulationResult[] {
  return [...results].sort((left, right) =>
    Number(right.viable) - Number(left.viable)
      || left.metrics.hardViolations - right.metrics.hardViolations
      || left.metrics.projectionConflicts - right.metrics.projectionConflicts
      || right.metrics.score - left.metrics.score
      || left.branchId.localeCompare(right.branchId))
}

export function createBranchProposalSeed(
  branch: BranchSimulationInput["branch"],
  result: BranchSimulationResult,
): BranchProposalSeed {
  if (branch.id !== result.branchId) throw new Error("branch and simulation result identity differ")
  if (!result.viable) throw new Error("a non-viable branch cannot become a proposal seed")
  if (branch.baselineCanonHash !== result.baselineCanonHash) {
    throw new Error("a stale branch cannot become a proposal seed")
  }
  return {
    schema: "novelcode-branch-proposal-v1",
    sourceBranchId: branch.id,
    baselineCanonHash: result.baselineCanonHash,
    hypothesis: branch.hypothesis,
    candidateEventIds: [...branch.candidateEventIds],
    worldDelta: structuredClone(result.worldDelta),
    costs: [...branch.costs],
    foreshadowImpacts: [...branch.foreshadowImpacts],
  }
}

function validateCandidateIdentity(
  input: BranchSimulationInput,
  candidates: readonly StoryEvent[],
  violations: BranchViolation[],
): void {
  const declared = [...input.branch.candidateEventIds].sort()
  const actual = candidates.map((event) => event.id).sort()
  const unique = new Set(actual)
  if (unique.size !== actual.length || stableJson(declared) !== stableJson(actual)) {
    violations.push({
      kind: "candidate_identity_mismatch",
      hard: true,
      message: "branch candidateEventIds must uniquely match candidate events",
    })
  }
}

function evaluateConstraints(
  input: BranchSimulationInput,
  candidates: readonly StoryEvent[],
  stateBeforeEvent: ReadonlyMap<string, Record<string, JsonValue>>,
  violations: BranchViolation[],
): void {
  const allEvents = [...input.baselineEvents.filter((event) => event.lifecycle === "confirmed"), ...candidates]
  const events = new Map(allEvents.map((event) => [event.id, event]))
  const candidateKnowledge = (input.candidateKnowledge ?? []).map((claim) => {
    if (claim.lifecycle !== "candidate") {
      violations.push({
        kind: "candidate_lifecycle",
        hard: true,
        message: `sandbox knowledge ${claim.id} must remain candidate`,
      })
    }
    return { ...claim, lifecycle: "confirmed" as const }
  })
  const knowledge = [...input.baselineKnowledge, ...candidateKnowledge]
  for (const constraint of input.constraints ?? []) {
    if (constraint.kind === "event_order") {
      const before = events.get(constraint.beforeEventId)
      const after = events.get(constraint.afterEventId)
      if (before === undefined || after === undefined || compareEvents(before, after) >= 0) {
        constraintViolation(violations, constraint, "event_order", "required event order is not satisfied")
      }
      continue
    }
    const event = events.get(constraint.eventId)
    if (event === undefined) {
      constraintViolation(violations, constraint, constraint.kind === "knowledge_required" ? "knowledge_leakage" : "state_precondition", "constraint target event is missing")
      continue
    }
    if (constraint.kind === "state_precondition") {
      const state = stateBeforeEvent.get(event.id)
      const actual = state?.[stateKey(constraint.entityId, constraint.fieldPath)]
      const matchesExistence = constraint.mustExist === undefined
        || constraint.mustExist === (actual !== undefined)
      const matchesValue = constraint.expected === undefined || jsonEquals(actual, constraint.expected)
      if (!matchesExistence || !matchesValue) {
        constraintViolation(violations, constraint, "state_precondition", "event state precondition is not satisfied")
      }
      continue
    }
    const visible = visibleKnowledgeAt(knowledge, constraint.subjectId, event.storyTime.sequence)
    const claim = visible.find((item) => item.claimId === constraint.claimId)
    if (claim === undefined || !constraint.allowedStances.includes(claim.stance)) {
      constraintViolation(violations, constraint, "knowledge_leakage", `subject ${constraint.subjectId} lacks required knowledge at event ${event.id}`)
    }
  }
}

function constraintViolation(
  violations: BranchViolation[],
  constraint: BranchConstraint,
  kind: BranchViolation["kind"],
  message: string,
): void {
  violations.push({ kind, hard: true, constraintId: constraint.id, message })
}

function eventApplies(event: StoryEvent, throughSequence: number): boolean {
  return event.storyTime.sequence <= throughSequence
    && event.validity.fromSequence <= throughSequence
    && (event.validity.toSequence === undefined || event.validity.toSequence >= throughSequence)
}

function difference(
  before: Readonly<Record<string, JsonValue>>,
  after: Readonly<Record<string, JsonValue>>,
): EntityStateTransition[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const transitions: EntityStateTransition[] = []
  for (const key of [...keys].sort()) {
    const previous = before[key]
    const next = after[key]
    if (jsonEquals(previous, next)) continue
    const separator = key.indexOf(":")
    const entityId = separator < 0 ? key : key.slice(0, separator)
    const fieldPath = separator < 0 ? "" : key.slice(separator + 1)
    transitions.push(next === undefined
      ? { entityId, fieldPath, operation: "unset", ...(previous === undefined ? {} : { previous }) }
      : {
          entityId,
          fieldPath,
          operation: "set",
          ...(previous === undefined ? {} : { previous }),
          next,
        })
  }
  return transitions
}

function sameTransitions(left: readonly EntityStateTransition[], right: readonly EntityStateTransition[]): boolean {
  return stableJson([...left].sort(compareTransitions)) === stableJson([...right].sort(compareTransitions))
}

function compareTransitions(left: EntityStateTransition, right: EntityStateTransition): number {
  return left.entityId.localeCompare(right.entityId) || left.fieldPath.localeCompare(right.fieldPath)
}

function compareEvents(left: StoryEvent, right: StoryEvent): number {
  return left.storyTime.sequence - right.storyTime.sequence
    || left.narrativePosition.order - right.narrativePosition.order
    || left.id.localeCompare(right.id)
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortValue(child)]))
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return left === undefined ? right === undefined : right !== undefined && stableJson(left) === stableJson(right)
}

function assertSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("throughSequence must be a non-negative integer")
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

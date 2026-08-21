import { createHash } from "node:crypto"
import type { NarrativeHighRiskAction } from "@novelcode-dsh/contracts"

export interface AuthorCapabilityInput {
  callId: string
  sessionId?: string
  action: NarrativeHighRiskAction
  arguments: unknown
}

interface PreparedCapability {
  sessionId?: string
  action: NarrativeHighRiskAction
  fingerprint: string
  expiresAt: number
}

export class AuthorCapabilityStore {
  private readonly pending = new Map<string, PreparedCapability>()

  constructor(
    private readonly ttlMs: number = 5 * 60_000,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error("author capability ttlMs must be a positive integer")
    }
  }

  prepare(input: AuthorCapabilityInput): void {
    this.sweep()
    this.pending.set(input.callId, {
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      action: input.action,
      fingerprint: fingerprint(input.arguments),
      expiresAt: this.now() + this.ttlMs,
    })
  }

  consume(input: AuthorCapabilityInput): boolean {
    this.sweep()
    const capability = this.pending.get(input.callId)
    this.pending.delete(input.callId)
    return capability !== undefined
      && capability.expiresAt >= this.now()
      && capability.action === input.action
      && capability.sessionId === input.sessionId
      && capability.fingerprint === fingerprint(input.arguments)
  }

  get size(): number {
    this.sweep()
    return this.pending.size
  }

  private sweep(): void {
    const now = this.now()
    for (const [callId, capability] of this.pending) {
      if (capability.expiresAt < now) this.pending.delete(callId)
    }
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]),
  )
}

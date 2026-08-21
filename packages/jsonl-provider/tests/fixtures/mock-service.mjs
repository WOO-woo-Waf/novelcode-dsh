import { createInterface } from "node:readline"

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
for await (const line of lines) {
  const request = JSON.parse(line)
  if (request.action === "narrative_project_doctor") {
    process.stderr.write("doctor-ready\n")
  }
  process.stdout.write(`${JSON.stringify({
    id: request.id,
    result: {
      success: true,
      summary: `${request.action}:${process.cwd()}`,
      artifacts: [],
      metrics: { request_count: 1 },
      payload: {
        session_id: request.session_id ?? null,
        ...(request.action === "narrative_memory_propose" && typeof request.payload?.id === "string"
          ? { proposal_id: request.payload.id }
          : {}),
        ...(request.action === "narrative_blueprint_propose" && typeof request.payload?.blueprint_id === "string"
          ? { proposal_id: request.payload.blueprint_id }
          : {}),
        ...(request.payload?.proposal_id === undefined ? {} : { proposal_id: request.payload.proposal_id }),
        ...(request.payload?.confirmation === undefined ? {} : { confirmation: request.payload.confirmation }),
      },
    },
  })}\n`)
}

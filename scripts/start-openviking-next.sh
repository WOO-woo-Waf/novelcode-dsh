#!/usr/bin/env bash
set -euo pipefail
NOVEL_NEXT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOVEL_OV_CONFIG="${NOVELCODE_OPENVIKING_CONFIG:-$NOVEL_NEXT_ROOT/runtime/openviking/ov.conf}"
NOVEL_OV_BIN="${NOVELCODE_OPENVIKING_BIN:-$NOVEL_NEXT_ROOT/runtime/openviking-venv/bin/openviking-server}"
if [[ ! -f "$NOVEL_OV_CONFIG" ]]; then
  echo "Missing novel OpenViking config: $NOVEL_OV_CONFIG" >&2
  echo "See docs/design-architecture/openviking-next/NOVEL_NEXT_FIRST_ROUND_2026-09-09.md" >&2
  exit 1
fi
if [[ ! -x "$NOVEL_OV_BIN" ]]; then
  echo "Install the pinned OpenViking server into runtime/openviking-venv first." >&2
  exit 1
fi
cd "$NOVEL_NEXT_ROOT"
exec "$NOVEL_OV_BIN" --config "$NOVEL_OV_CONFIG" --host 127.0.0.1 --port "${NOVELCODE_OPENVIKING_PORT:-1938}"

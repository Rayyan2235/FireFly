---
created: '2026-10-10'
project: firefly
tags:
  - project/firefly
  - adr
  - decision
type: adr
status: accepted
source: 'yard-recovery-handoff-2026-10-10'
---
# ADR 0004 — Strict mutation tools and an explicit command lifecycle

## Status

Accepted (handoff "AGREED", 2026-10-10). Exact state names and retry budgets still open.

## Decision

Every mutation tool validates current prerequisites itself, at execution time, inside the same protected mutation. Earlier filtering is never sufficient. `reserve_door` checks job compatibility, permission to switch, availability, ownership, and current state; `request_resume` checks the entire release procedure.

Commands carry explicit lifecycle states (proposed, queued, sent, acknowledged, completed, rejected, cancel-requested, cancelled, unknown/timed-out) and a stable request identity.

## Why

The model chooses tool arguments, so the tools are the safety boundary. A model response built from stale context must not bypass a newer correction.

## Consequences

- Queued and not sent → cancel locally. Sent without acknowledgment → status uncertain; request status/cancel, keep holds until reconciled. Acknowledged/executing → request a controller hold; show hold-requested separately from held.
- Timeouts mean uncertainty, never success or cancellation. Retries never duplicate execution.
- A restarted process or reconnecting client reconciles state before resuming commands.
- Do not depend on an intervention countdown: missing a 4-second window can't make an invalid action valid.

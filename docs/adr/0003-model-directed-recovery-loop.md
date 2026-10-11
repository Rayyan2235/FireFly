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
# ADR 0003 — Model-directed recovery loop with deterministic guards

## Status

Accepted (handoff "AGREED", 2026-10-10).

## Decision

A real language model drives each incident's recovery loop: observe → assess → choose action → execute a validated tool → inspect result → continue, adapt, or escalate → verify outcome. One runner per active exception; runners share model configuration and tool definitions.

Deterministic code owns eligibility, authority, reservations, command identities, task ownership, state transitions, release gates, and event ordering. Routine dispatch for the six background trucks is deterministic.

## Why

Muhammad wants the agent to choose and adapt actions — not classify an image and then run a fixed script. Deterministic software can be autonomous, but this product specifically demonstrates model-directed tool use. Putting rules in deterministic code keeps a model mistake from becoming an invalid world change.

## Consequences

- Do not build a second elaborate model agent just to claim "multi-agent."
- Measure real model latency; edit waits transparently in the video.
- Never label scripted decisions as model decisions.

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
# ADR 0006 — Supervisor correction as scoped operational memory

## Status

Accepted (handoff "AGREED", 2026-10-10).

## Decision

Maria corrects the agent in natural language. The model interprets subject, status, scope, and release condition; `save_correction` validates and stores it with its source. The interface shows the interpretation, e.g. *"Saved: F-3 excluded until maintenance clears it. Source: Maria."*

The correction itself invalidates conflicting pending work (Sam's unaccepted F-3 offer). Later decisions retrieve it within scope; it ends when its release condition is met (maintenance clears F-3).

## Why

A small nudge gives the model meaningful interpretation work, then lets the agent continue. Showing the saved interpretation gives Maria a chance to catch a misunderstanding.

## Consequences

- An ambiguous or unsupported correction never silently becomes a world update. If full dialogue is cut, hold the conflicting action and ask for structured clarification.
- Accepted work is never silently transferred — request handoff and wait for an explicit outcome.
- This is scoped memory, not model retraining or automatic policy improvement.

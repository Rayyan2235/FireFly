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
# ADR 0007 — Report outcomes, not agent-action ratios; keep claims narrow

## Status

Accepted (handoff "AGREED", 2026-10-10).

## Decision

Show outcomes such as "Recovered without supervisor input" and "Physical assistance coordinated after one supervisor correction." Record authorizations separately. Every displayed success has a supporting event. Disclose simulation explicitly (`source_mode`).

## Why

Tool-call counts can be inflated and confuse physical labor with manual coordination. Noor clearing a pallet (labor), Maria correcting a fact (intervention), and Maria authorizing resume (authorization) are distinct human actions — never merge them into one agent-vs-human count.

## Consequences

- No invented utilization percentages, saved hours, cost savings, customer logos, deployments, or safety certification.
- Never show a prediction as an achieved outcome.
- Buzzwords ("autonomous operations", "human oversight", "operational memory") only when attached to an observable behavior.

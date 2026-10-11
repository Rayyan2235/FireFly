---
created: '2026-10-11'
project: firefly
tags:
  - project/firefly
  - adr
  - decision
type: adr
status: accepted
---
# ADR 0012 — Vertical first; the moat is data + AI + verification

## Status

Accepted on 2026-10-11, after reviewing a public critique of the RFS (notes). Build ranking of the related extras is provisional.

## Context

A founder's LinkedIn post argued that YC's "New Operating Systems for the Physical World" invites thin horizontal layers, and that the ambitious companies will be vertical: pick a segment, automate it end to end, and own the data — "data + AI + verification" — with systems that improve from their own outcomes.

Our read: right on direction (agents alone aren't a moat; vertical first; learn from outcomes), too narrow on the RFS (which itself names recording all work as the prize), and wrong that human interception and self-improvement are opposites — in the physical world, people must approve safety-critical steps, and every intervention is data.

Firefly is already vertical (distribution-center yards, exception recovery, verified end to end). The risk was only in how it's pitched and in leaving the data invisible.

## Decision

1. **Pitch order: vertical first, OS second.** "Firefly runs yard exceptions end to end and records every verified outcome. That record is how it becomes the operating system for agents, robots and people." The end card keeps the OS line ([ADR 0008](0008-firefly-is-an-os-for-mixed-workforces.md)).
2. **Reliability panel** (extra, ranked high): computed only from the event log of the actual run — incidents recovered without supervisor input, time to recovery, corrections saved, authorizations given, commands sent/acknowledged/timed out, escalations. Labelled as a simulated yard in twin mode.
3. **`get_site_history`** (extra): a read tool that returns recorded outcomes from this shift (e.g. doors lost to contention, worker clear times, equipment outages) so later decisions can use them. An honest self-improving loop: retrieval of recorded outcomes, not retraining.

## Why

It answers the "thin layer" critique before a judge raises it, makes the data advantage visible on screen, and shows data + AI + verification together: `verify_outcome` proves each result, the work record stores it, the panel and the history tool use it.

## Consequences

- [ADR 0007](0007-outcomes-not-action-ratios.md) still binds: the panel shows outcomes and counts human actions separately (labor, corrections, authorizations); never an agent-versus-human ratio. Every number comes from recorded events; nothing extrapolated to savings.
- Copy says "uses recorded outcomes", never "learns" or "improves itself" ([ADR 0006](0006-supervisor-correction-as-scoped-memory.md), rule 5 in _context).
- Reliability numbers on the video's end card come from the panel, not from manual counting.
- Hardware ownership (his "data + AI + hardware") is out of scope; the trucks stay simulated and disclosed.

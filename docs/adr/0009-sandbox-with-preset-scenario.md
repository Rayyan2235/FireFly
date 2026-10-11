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
# ADR 0009 — Firefly is a sandbox; the R-2/R-5 story is a preset scenario

## Status

Accepted on 2026-10-11 (grilling question 3).

## Context

As planned, the Maria/Noor story played the same way every time; a visitor could only watch it. Muhammad asked what a judge would actually *do* with the product, and wanted something usable rather than a proof of concept.

## Decision

- The yard runs continuously with routine traffic. **The visitor plays the supervisor.**
- Problems come from three sources: the **preset demo scenario** (deterministic: Door 3 closes, pallet at Door 7), **visitor clicks** (close door, drop pallet, forklift out of service, send worker home), and an optional **auto-disrupt** toggle (random problems, off by default).
- The story is stored as a list of problems fed into the same sandbox — never as hard-coded steps.
- Maria, Sam and Noor are the site's staff list, not script characters: whoever sits at the console plays Maria; whoever opens the worker page plays Noor.
- Incidents are born from robot reports (a truck that reaches a blocked door stops and reports `BLOCKED`), not created by the scenario.

## Why

- It is usable: visitors can do things nobody planned and the agent handles them through the same tools.
- It proves the AI is real: a script can't react to a door the judge just closed.
- It fits the OS pitch: the simulator stands where real truck controllers would plug in.
- Cheap if decided before the build; a rewrite if decided late.

## Consequences

- Free-text supervisor input that can't be applied must say so ("Firefly can record facts about doors, equipment and worker availability") and change nothing — the hold-and-clarify rule from [ADR 0006](0006-supervisor-correction-as-scoped-memory.md).
- Visitor problem tools are an extra; the preset mechanism is must-ship.
- Recording keeps auto-disrupt off so every take tells the same story.
- If hosted publicly later: one yard per visitor and a cap on model calls.

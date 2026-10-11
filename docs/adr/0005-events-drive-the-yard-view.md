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
# ADR 0005 — Events drive the spatial yard view

## Status

Accepted (handoff "AGREED", 2026-10-10).

## Decision

The UI renders state from ordered events: model request → validated tool → controller/simulator response → recorded state/event → UI. Motion follows controller events. The renderer never decides where a truck goes.

Target a **simple, attractive 3D yard** (trucks, doors, reservations, obstructions, people) occupying most of the screen, plus one concise activity card for the selected incident. Full history and technical detail are secondary.

## Why

Text saying "rerouted" is not evidence of execution. The spatial view connects agent decisions to real-world consequences and makes the product legible in a short video.

## Consequences

- Build the 3D scene alongside slice 1 against an agreed event/state contract.
- Simplify camera, models, textures, lighting, and background motion before cutting behavior.
- 2D/isometric is a contingency, not the desired experience.
- A reconnecting client gets a state snapshot, then resumes ordered events without duplicates.

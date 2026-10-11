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
# ADR 0008 — Pitch Firefly as an OS for mixed workforces; yard recovery is the first workload

## Status

Accepted on 2026-10-11 (grilling question 1).

## Context

The handoff framed the product as a yard recovery agent. The target track is YC's Fall 2026 RFS, "New Operating Systems for the Physical World" (summary), which asks for software that manages AI agents, robots, and people together, and names three questions: routing a job between an agent, a robot and a person; safety when humans and robots work side by side; measuring reliability. The story already answered all three, but hid them as sub-steps.

A video on NVIDIA's "OS for physical AI" raised the worry that the idea was off-track. It isn't: NVIDIA builds the brain inside each machine; the RFS asks for the layer that runs work across machines and people (notes).

## Decision

- Firefly is pitched as **the operating system for agents, robots and people**, working from one shared world.
- Yard exception recovery is its first workload and the demo.
- The framing grows; the build does not. The handoff's warning against building a full yard OS stands.
- Each RFS question gets one visible moment in the product and the video (routing card, resume gate, work record).

## Why

A recovery agent reads as a feature an incumbent yard-management vendor would add. The same build, shown as OS primitives, reads as the company the RFS asks for. The reframe costs almost no code.

## Consequences

- End card: "Firefly — the operating system for agents, robots and people." Demo line stays "Keep the yard moving."
- Every OS claim must attach to a behavior on screen ([ADR 0007](0007-outcomes-not-action-ratios.md)'s buzzword rule).
- Do not build foundation models, world models, or robot motion (NVIDIA's layer).
- Revision (2026-10-11): **pitch vertical first, OS second** — Firefly runs yard exceptions end to end and records every verified outcome; that record is how it becomes the OS ([ADR 0012](0012-data-ai-verification.md)).
- Borrowed ideas, adopted in grilling question 5: a worker is anything that can take a task ([ADR 0010](0010-one-shape-for-every-worker.md)); the sandbox is a digital twin (the "Twin mode · simulated trucks" label doubles as the simulation disclosure); the work record is the data advantage.

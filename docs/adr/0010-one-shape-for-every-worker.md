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
# ADR 0010 — A worker is anything that can take a task

## Status

Accepted on 2026-10-11 (grilling question 5).

## Context

The handoff kept trucks, people and equipment as separate kinds and asked "which *responder* can do this?", so a robot could never be considered for a job. The RFS's first question is how to route a job between an agent, a robot and a person. NVIDIA's "one intelligence, many bodies" idea, moved to Firefly's layer, suggests one interface for every kind of worker.

## Decision

Every worker — robot, person, or agent — has the same five fields:

1. **Kind:** robot, person, agent.
2. **Can do:** e.g. tow trailer, clear obstruction, authorize resume.
3. **Status:** free, busy, off shift, out of service.
4. **How to reach it:** robots through the controller channel, people through the worker page, agents internally.
5. **How its work is confirmed:** a robot's `ARRIVED`, a person's `DONE` / `CLEAR` report.

Forklifts (F-3, F-4) stay **equipment** — assets a person uses, checked out to that person for the shift.

## Why

It makes routing a real, visible decision across worker kinds and gives the OS pitch a concrete primitive. Decided before the build, it costs nothing extra.

## Consequences

- `list_eligible_workers(task)` replaces `list_eligible_responders` and returns every kind with a can/can't reason (e.g. "Yard trucks: tow trailers only", "Sam: F-3 excluded · Maria's rule").
- The routing card and the roster (trucks, people, agents) come straight from this data.
- A correction about equipment excludes every person whose assigned equipment it is, until the release condition is met.

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
# ADR 0011 — Robots stop themselves; every worker talks on one channel

## Status

Accepted on 2026-10-11 (raised by Muhammad before grilling question 4; storyboard approved with the radio log on screen).

## Context

Muhammad described the core loop as a conversation: the truck senses an obstruction, tells the AI it can't continue, the agent decides, tells the truck to wait or go, the truck acknowledges and moves. The order of responsibility matters for safety.

## Decision

- **The robot stops itself first**, using its own sensors and local safety layer, then reports `BLOCKED`. Firefly decides what happens next. Firefly never acts as the brakes.
- **One channel** carries every worker's messages: `BLOCKED`, `HOLD`, `GO_TO` / `RESUME` (with request id), `ACK`, `ARRIVED`, `TASK` / `CANCEL`, `ACCEPT` / `DECLINE` / `DONE` / `CLEAR`, `NOTE` / `APPROVE`.
- Message names are **modeled on VDA 5050** (the open standard robot fleets use for orders, instant actions and state). Say "modeled on", never "compliant".
- The channel is visible in the product as a **radio log**.
- In the demo the sensor is simulated (the simulator notices an obstruction or closed door on the truck's path) and disclosed. Real trucks would send the same message from real hardware.

## Why

A slow network or a model mistake must never be the only thing between a truck and a person. Real autonomous vehicles and warehouse robots work this way: a local layer stops the machine, a coordinator decides what's next. Showing the conversation makes the "unified brain" visible.

## Consequences

- Incidents start from a robot's report, which is also the strongest proof the demo isn't scripted.
- The agent runner is event-driven: it sleeps until a message (or another event) wakes it.
- Copy never says "Firefly stopped the truck."

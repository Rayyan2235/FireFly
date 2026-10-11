# Product

<!-- impeccable:product-schema 1 -->

Source: pre-event planning and the grilling session on 2026-10-11. Plans here are provisional and subject to change.

## Platform

web

## Stack

Decided 2026-10-11 (provisional): TypeScript + pnpm; Vite + React + Tailwind; react-three-fiber for the 3D yard; one long-running Node (Hono) server streaming ordered events over SSE; Anthropic SDK with `claude-opus-5-5` in a hand-written tool loop.

## Users

- **Yard supervisor (Maria):** watches the yard, supplies facts the records miss, authorizes releases.
- **Workers (Sam, Noor):** forklift-certified responders who receive tasks on a phone.
- **Hackathon judges:** meet the product mostly through a 90-second video; may open the product link.
- **Potential buyer (unvalidated):** a site or fleet-operations leader.

## Product Purpose

Firefly is an operating system for mixed physical workforces: AI agents, robots, and people working from one shared world. Its first workload is exception recovery at a distribution-center yard. When a truck hits a problem, an agent works it through validated tools until the outcome is verified, coordinating robots and people. Success: an observer says "the agent handled a setback by itself, a person supplied one missing fact, the agent adapted, coordinated the physical work, and used that fact next time."

## Positioning

Built for YC's Fall 2026 RFS, "New Operating Systems for the Physical World." Pitched vertical first, OS second: Firefly runs yard exceptions end to end and records every verified outcome; that record is how it becomes the operating system for agents, robots and people. The moat is data + AI + verification, not the agent. Not a ticket queue or a chatbot that recommends: you watch the agent act, and every displayed line maps to a real model, tool, controller, or human event. Robots stop themselves; Firefly decides what happens next. Supervisor corrections become scoped site rules that later decisions use.

## Operating Context

- Yard: 8 autonomous yard trucks (simulated controllers), 8 dock doors (receiving and shipping), an approach lane, parking.
- Sandbox: the visitor plays the supervisor and can cause problems (close a door, drop a pallet, take a forklift out of service, send a worker home). A preset scenario reproduces the demo story (R-2, R-5).
- One channel for all workers: robots, people, and agents exchange messages (BLOCKED, HOLD, TASK, DONE, APPROVE, RESUME, ACK, ARRIVED), named after VDA 5050 conventions.
- Twin mode: the simulator stands in for real truck controllers and is disclosed as simulated.

## Capabilities and Constraints

- Every worker (robot, person, agent) shares one shape: kind, capabilities, status, how to reach it, how its work is confirmed. Equipment (forklifts F-3, F-4) is an asset, not a worker.
- Mutation tools validate prerequisites at execution time. Events drive the yard view; the renderer never decides where a truck goes. A correction invalidates conflicting pending work by itself.
- Undecided: visual identity, palette, typography, brand treatment. The owner will decide these later.

## Brand Commitments

- Name: Firefly (working name; collides with Adobe Firefly, acceptable for the hackathon).
- No visual identity is committed. Treat any mockup palette as a placeholder.

## Evidence on Hand

- No customers, deployments, measured savings, or safety certification. Never invent them.
- Pre-event concepts (`~/Downloads/scratch(3).html`, `~/Downloads/firefly-scratch.html`, the opener video) are not in-event work and must never be presented as such.

## Product Principles

1. Show the agent working; every visible line is backed by an event.
2. Tools are the safety boundary; motion follows controller events.
3. Report outcomes, not agent-versus-human action ratios.
4. Labor, corrections, and authorizations are distinct, attributed human actions.
5. Missing facts stay missing.

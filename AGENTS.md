# Firefly — agent guide

Read this first. It is the one source of rules and contract for everyone working in this repo, human or agent. **Plans here are provisional and will change as we build. The non-negotiable rules don't.**

Product context for design work: [`PRODUCT.md`](PRODUCT.md).

## What we're building

c0mpiled-15, Sunday 11 Oct 2026, hacking **12:00–20:00 ET**. Track: YC Fall 2026 RFS, *New Operating Systems for the Physical World*.

> Firefly runs yard exceptions end to end, with AI agents, robots and people on one channel, and records every verified outcome. That record is how it becomes the operating system for agents, robots and people.

**The demo is a sandbox yard.**
- 8 simulated autonomous trucks `T-1`…`T-8`; 8 dock doors (`1–4` receiving, `5–8` shipping); approach lane; parking.
- People: **Maria** (supervisor, the person at the console), **Sam** (forklift F-3), **Noor** (forklift F-4). Workers use a phone page.
- Agents: one Claude loop per incident; two can run at once.
- The visitor plays Maria and can cause problems: close a door, drop a pallet, put a forklift out of service, send a worker home.

**The preset scenario (the video story):**
- **R-2:** Door 3 closes → `T-2` stops and reports `BLOCKED` → agent finds alternates → first reservation is rejected (a routine move really took that door) → agent reserves another → controller `ACK` → arrival verified. No human input.
- **R-5:** pallet on the Door 7 approach (job can't switch doors) → `T-5` stops, `BLOCKED` → agent offers Sam + F-3 → Maria types "F-3 is leaking. Keep it out of assignments until maintenance clears it." → rule saved, offer withdrawn → Noor + F-4 accepts, clears it → early resume rejected → Noor reports people clear → Maria authorizes → `ACK` → arrival verified.
- **Memory:** a later pallet → Sam excluded by Maria's rule → Noor + F-4 offered without asking.

## Non-negotiable rules

1. **A real model chooses tool calls.** Every line on screen maps to a real model call, tool result, controller message or human action. Never fabricate tool results; never label scripted steps as model decisions.
2. **Mutation tools validate current state themselves,** at execution time, inside the same synchronous mutation. Earlier filtering is never enough.
3. **Events drive the screens.** The renderer never decides where a truck goes; motion starts only after the matching controller event.
4. **A correction invalidates conflicting pending work by itself** (never by a countdown).
5. **Robots stop themselves and report `BLOCKED`; Firefly decides what's next.** Never write "Firefly stopped the truck".
6. **Outcomes, not ratios.** No agent-versus-human action counts. No invented savings, utilization, customers, deployments or safety certification.
7. **Honest words:** simulation is disclosed ("Twin mode · simulated trucks"); "uses recorded outcomes", never "learns"; message names "modeled on VDA 5050", never "compliant".
8. **All code is written during the event.** Don't copy code from the pre-event mockup or concepts.
9. **Secrets live only in `.env`** (gitignored). Never commit a key.

## Team and workflow

- **Muhammad** (`@usmannsiddiqui`): server, simulator, tools, agent loop. **Rayyan** (`@Rayyan2235`): screens. Split is provisional.
- **pnpm** only.
- **One branch per task**, plain kebab-case names (`sse-event-stream`, `yard-scene`). Open a PR, merge with a merge commit. **Never commit to `main` directly.**
- No `Co-Authored-By` or "Generated with" lines in commits or PRs.
- `src/contract.ts` is shared: change it only when both of us agree, in its own small PR.
- At most two AI coding lanes per person, each on its own branch or worktree.

## Stack (provisional)

| Part | Pick |
|---|---|
| Language | TypeScript everywhere, one pnpm package |
| Screens | Vite + React + Tailwind; react-three-fiber (+ drei) for the 3D yard |
| Server | Node + Hono; Server-Sent Events for live updates, POST for actions |
| State | In memory on the server (authoritative); append-only event log |
| AI | Anthropic TS SDK, `claude-opus-5-5`, hand-written tool loop |

Not Next.js: its dev reload can wipe the in-memory yard, and serverless hosting can't keep state or hold SSE open.

**Atomicity:** JavaScript runs one function at a time. A mutation that checks and writes with no `await` in between can't be interleaved by another agent. That is our double-booking guarantee; don't put an `await` inside a check-and-write.

**Model notes** (check the Claude API docs if unsure): forced `tool_choice` (`any`/`tool`) is rejected by this model, so use `auto` + `strict: true` schemas; thinking can't be disabled, tune `effort` for latency; progress notes between tool calls need thinking `display: "updates"`.

## Proposed layout

```text
src/contract.ts     shared types: state, events, channel messages, tool inputs/outputs
src/server/         Hono app: world + event log, SSE, simulator, tools, agent runner
src/web/            console: 3D yard, incidents/activity, radio log, work record, composer
src/web/worker/     phone page for Sam/Noor
fixtures/           sample event lists for building screens (dev only, never in the video)
```

## Contract (v0 — change by agreement)

### Events

```ts
type SourceMode = 'real-model' | 'system' | 'simulated' | 'human';
interface FireflyEvent {
  seq: number;            // global, monotonic; also the state version and the SSE id
  ts: string;
  type: string;           // e.g. tool.called, tool.result, radio, truck.moved, door.changed, incident.opened
  actor: { kind: 'agent' | 'robot' | 'person' | 'system'; id: string };
  source_mode: SourceMode;
  incident_id?: string; job_id?: string; request_id?: string; caused_by?: number;
  summary: string;        // the one line the UI shows
  payload: Record<string, unknown>;
}
```

SSE: on connect, send a `snapshot` (full world + `seq`), then every event with `id: seq`. A reconnect sends `Last-Event-ID`; the server replays from there.

### Channel messages (shown in the radio log)

`BLOCKED` (robot → Firefly) · `HOLD` · `GO_TO` / `RESUME` (Firefly → robot, with request id) · `ACK` · `ARRIVED` · `TASK` / `CANCEL` (Firefly → person) · `ACCEPT` / `DECLINE` / `DONE` / `CLEAR` (person → Firefly) · `NOTE` / `APPROVE` (Maria → Firefly).

### State

```text
Door        { id 1–8, kind receiving|shipping, closed, obstruction, occupant?, reservedBy? }
Truck       { id T-1…T-8, jobId, pos {x,z,heading}, controller idle|moving|held|docked|parked }
Job         { id, truckId, direction in|out, kind, assignedDoor, canSwitchDoor }
Incident    { id, kind door_closed|obstruction|clearance, truckId?, door, status, agentId? }
Command     { requestId, truckId, kind GO_TO|HOLD|RESUME, door,
              status queued|sent|acknowledged|completed|rejected|timed_out }
Worker      { id, kind robot|person|agent, canDo[], status, reach, confirmBy }
Equipment   { id F-3|F-4, holder, outOfService }
Task        { id, incidentId, worker?, equipment?, status offered|accepted|declined|withdrawn|closed,
              arrived, cleared, peopleClear }
Correction  { id, subject, fact, source, createdAt, releaseCondition, active, interpretation }
Approval    { id, incidentId, kind resume, status pending|approved }
```

### Tools

| Tool | Kind | Must do |
|---|---|---|
| `inspect_incident` | read | controller report, evidence, timestamps |
| `get_job` | read | requirements, can-switch, state |
| `get_site_procedure` | read | procedure and release prerequisites |
| `list_compatible_doors` | read | free candidates + exclusion reasons |
| `reserve_door` | mutation | validate kind, switch allowed, closed, obstruction, occupied, reserved; specific conflict on failure |
| `request_destination` | mutation | owned reservation, truck held, request id; a repeated id returns the existing command |
| `get_command_status(request_id, wait_s?)` | read | waits up to `wait_s`; timeout → `uncertain`, never success |
| `list_eligible_workers(task)` | read | robots, agents and people, each with a can/can't reason (rules, shifts, equipment) |
| `offer_task` / `withdraw_offer` | mutation | eligibility; offered vs accepted |
| `save_correction` | mutation | subject, release condition, source; invalidates conflicting offers |
| `request_authorization` | mutation | creates a pending approval for Maria |
| `request_resume` | mutation | cleared + people clear + authorization, checked now; lists what's missing |
| `verify_outcome` | mutation | reads controller completion; the only way an incident resolves |
| `escalate` | mutation | states what's missing; truck stays held |
| `get_site_history(scope)` | read | *(extra)* recorded outcomes from this shift |

### Agent runner

- One run per incident; claim a free agent synchronously so two incidents never take the same one.
- Each `tool_use` → `tool.called` (`real-model`) → execute → `tool.result` (`system`) → back to the model.
- Waiting on a person or controller: the model ends its turn; the runner re-invokes it with the new observation when a relevant event arrives.
- Budget ~15 tool calls per incident; over budget → the system escalates and says so.
- The model saying "done" closes nothing; only `verify_outcome` does.
- R-2 fixture: on the first valid reservation in the demo scenario, routine dispatch really reserves that door for `T-7` (`simulated` event, `fixture: r2-contention`), so `reserve_door` fails for real.

## Must-ship (provisional)

1. Demo scenario: two trucks hit problems at once; two agents work concurrently.
2. R-2 end to end with the real model, no human.
3. R-5 end to end: routing, offer, Maria's correction, reassignment, worker page reports, early resume rejected, authorization, verified.
4. Memory: a later problem skips F-3 without asking.
5. 3D yard + activity + radio log + work record, driven only by events. Plus: twin-mode label, VDA-style message names, Export record.

**Gate:** extras merge only after the full must-ship run passes **twice in a row**.

**Extras, in order (subject to change):** problem tools · reliability panel · Noor on a real phone · routing card · roster · `get_site_history` · safety-zone glow · auto-disrupt toggle · agent attention lights.

## Checkpoints (provisional)

- **12:45** — Rayyan's 3D yard shows 8 trucks and 8 doors moving from a fixture.
- **~14:30** — R-2 runs end to end in the terminal with the real model.
- **~16:00** — must-ship live in 3D, then the twice-in-a-row gate.
- **18:30** — stop features; record, edit, README, submit before 20:00.

**Never cut:** real model loop, truthful event trace, tool validation, correction invalidation, request-vs-controller distinction, simulation disclosure.

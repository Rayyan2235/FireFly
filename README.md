# Firefly

Firefly runs yard exceptions end to end, with AI agents, robots and people on one channel, and records every verified outcome. That record is how it becomes the operating system for agents, robots and people.

Built at **c0mpiled-15** (Penn State, 11 October 2026) for YC's Fall 2026 Request for Startups, *New Operating Systems for the Physical World*.

## Status

Hackathon build in progress.

## Run it

Needs Node 20.6+ and pnpm.

```bash
pnpm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
pnpm dev               # server on :8787, console on http://localhost:5173
```

- Console: `http://localhost:5173` · worker phone page: `http://<laptop-ip>:5173/worker.html`
- Build screens before the server logic exists: `http://localhost:5173/?replay=demo-r2` plays the dev fixture in `fixtures/` (dev only, never in the video).
- `pnpm test` · `pnpm typecheck` · `pnpm build`

## Simulation disclosure

- **Twin mode.** The yard trucks, their controllers and their sensors are simulated. No real robots or site systems are connected.
- **The agent is real.** A Claude model chooses every tool call. Each line in the activity view maps to a real model call, tool result, simulated controller message, or human action.
- **The demo scenario is staged.** Door 3 closing, the pallet at Door 7, and the routine truck that takes the first door the agent tries are scripted world changes. The agent's reactions to them are not scripted.
- **People's reports are self-reports.** A worker's "people clear" is their report, not independent sensing. The resume procedure is a demo procedure, not a certified safety system.
- Any numbers shown come from the recorded events of the run on screen. No savings, utilization or customer claims.

## Team

[@usmannsiddiqui](https://github.com/usmannsiddiqui) · [@Rayyan2235](https://github.com/Rayyan2235)

---
created: '2026-10-09'
project: firefly
tags:
  - project/firefly
  - adr
  - decision
type: adr
status: accepted
---
# ADR 0002 — Build the 20s opener in HyperFrames from a reference structure

## Status

Accepted on 2026-10-09. Draft 1 rendered.

## Context

The 90s submission video opens with 20 seconds of motion graphics. Muhammad had a reference video (kinetic typography, pixel-art objects, thermal silhouettes, red hand-drawn scribbles) and wanted something of his own in that style. No footage, logo, or brand assets exist.

## Decision

- Build with **HyperFrames** (HTML + GSAP → deterministic MP4), in one `index.html`.
- **Borrow structure, replace content.** Keep the reference's 5-beat rhythm and techniques; every word, object, and story beat is Firefly's.
- **Pixel art drawn in code** as character grids (`ICONS` in `index.html`) — nothing copied from the reference.
- **No live footage.** The reference's thermal person becomes an SVG heat-camera yard truck; the dark person silhouette becomes a hard-hat worker profile.
- **Color semantics:** warm glow = agent, red = human correction. The correction beat shows the supervisor's red arrow re-routing and the agent's glow following it.
- **Determinism:** seeded PRNG for grain, jitter, and scatter; Figtree shipped locally; one paused timeline registered after fonts load.

## Beat map

| Time | Beat | On screen |
|---|---|---|
| 0–4s | Question | "when a truck stops, who steps in?" |
| 4–8.6s | Answer | "the agent acts." / "you stay in control." |
| 8.6–14s | Proof | ring of 10 icons → "recover." / "remember." |
| 14–17.5s | Turn | ring scatters → "your correction shapes the next decision." |
| 17.5–20s | Payoff | F L O W → "FLOW." + firefly |

## Alternatives considered

- **Split into sub-compositions** (HyperFrames lint suggests it, 15 warnings). Deferred: no benefit at 20s, and one file is faster to iterate before the deadline.
- **Filming real silhouettes.** No time or footage; SVG stand-ins keep the look.
- **HyperFrames plugin workflows** (`/motion-graphics`). Not installed; built directly from the core skill docs instead.

## Consequences

- Re-renders are pixel-identical; edits happen in code or HyperFrames Studio (`npx hyperframes preview`).
- Full render is 114 MB because grain resists compression — share the CRF 22 copy.
- Music not yet added; cuts will need retiming to the beat.

## Revisions needed (2026-10-10, after the product handoff)

- **Beat 4 contradicts the agreed story.** It shows a human (red) arrow re-routing a truck to another dock. In the product, the agent reroutes doors by itself (R-2) and Maria's correction is about equipment (F-3 leaking → Noor + F-4). Redraw beat 4 around the F-3 correction.
- **Pre-event asset.** This video was made before the event. Verify the organizers' pre-event work policy before using it, and never present it as in-event work.

## Revision (2026-10-11) — v2 supersedes the beat map

Draft 1 was made before the product was fleshed out. v2 is specified in the opener v2 prompt:

- **15 s, not 20 s**, so the product gets 75 of the 90 seconds.
- Four scenes: the question ("robots move the trailers. / people clear the way. / who runs the work?") → the agent acts (`BLOCKED` → glow → `ACK`) → one correction (red X over F-3, "leaking", glow moves to F-4) → the name (glows sync, converge into FIREFLY + OS line).
- Removed: the icon ring with "recover." / "remember.", the red arrow rerouting a truck, "FLOW.".
- Colour meaning adds **solid ink = robots**; only the agent glows.
- Work goes on a new branch `opener-os-reframe`; `opener-video` stays untouched.
- **Pre-event status unchanged:** the organizer email (2026-10-11) welcomes plans before Sunday but doesn't mention pre-made media → ask on Discord and disclose in the README either way.

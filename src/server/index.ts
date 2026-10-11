import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { FireflyEvent } from '../contract.ts';
import { claude } from './agent/model.ts';
import { AgentRunner } from './agent/runner.ts';
import { Contention } from './contention.ts';
import { Dispatch } from './dispatch.ts';
import { openIncident } from './incidents.ts';
import { DEMO_SCENARIO, injectProblem } from './problems.ts';
import { loadFixture, playFixture } from './replay.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import { World } from './world.ts';

const PORT = Number(process.env.API_PORT ?? 8787);

const world = new World(seedWorld());
const contention = new Contention();
// A truck's BLOCKED report opens an incident, and a free agent picks it up.
const sim = new Simulator(world, (report) => {
  openIncident(world, report);
  runner.assign();
});
const dispatch = new Dispatch(world, sim);
const runner = new AgentRunner({ world, sim, dispatch, contention, ask: claude() });
const app = new Hono();

function reset() {
  runner.stop();
  contention.disarm();
  sim.stop();
  world.reset(seedWorld());
}

app.get('/api/health', (c) =>
  c.json({ ok: true, seq: world.state.seq, anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY) }),
);

/** Live event stream: snapshot first, then ordered events. `?replay=<fixture>` plays a fixture on a fresh world. */
app.get('/api/stream', (c) => {
  const replay = c.req.query('replay');
  const lastId = Number(c.req.header('Last-Event-ID') ?? 0);

  return streamSSE(c, async (stream) => {
    const w = replay ? new World(seedWorld()) : world;
    const queue: FireflyEvent[] = [];
    let wake: (() => void) | null = null;
    const off = w.subscribe((e) => {
      queue.push(e);
      wake?.();
    });
    let stopReplay = () => {};
    stream.onAbort(() => {
      off();
      stopReplay();
      wake?.();
    });

    if (lastId > 0 && !replay) queue.push(...w.since(lastId));
    else await stream.writeSSE({ event: 'snapshot', id: String(w.state.seq), data: JSON.stringify(w.snapshot()) });

    if (replay) {
      try {
        stopReplay = playFixture(w, await loadFixture(replay));
      } catch (err) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: String(err) }) });
      }
    }

    while (!stream.aborted) {
      while (queue.length) {
        const e = queue.shift()!;
        await stream.writeSSE({ event: 'event', id: String(e.seq), data: JSON.stringify(e) });
      }
      // Wait for the next event, or send a heartbeat every 15 s so proxies keep the connection open.
      const gotEvent = await new Promise<boolean>((done) => {
        wake = () => done(true);
        setTimeout(() => done(false), 15_000);
      });
      wake = null;
      if (!gotEvent && !stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
    }
  });
});

app.post('/api/reset', (c) => {
  reset();
  return c.json({ ok: true });
});

/** Run demo scenario: a fresh yard, the preset problems, then the shift starts. Trucks find the problems themselves. */
app.post('/api/scenario/demo', (c) => {
  reset();
  contention.arm(); // the staged door race (see README)
  for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
  dispatch.startShift();
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Firefly server on http://localhost:${info.port}`);
});

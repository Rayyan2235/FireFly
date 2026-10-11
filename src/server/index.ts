import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { FireflyEvent } from '../contract.ts';
import { ActionError, Actions } from './actions.ts';
import { claude } from './agent/model.ts';
import { AgentRunner } from './agent/runner.ts';
import { Contention } from './contention.ts';
import { Dispatch } from './dispatch.ts';
import { openClearance, openIncident } from './incidents.ts';
import { DEMO_SCENARIO, injectProblem, withdrawOffersFor } from './problems.ts';
import { FlightRecorder } from './recorder.ts';
import { currentRun, reliability } from './reliability.ts';
import { loadFixture, playFixture } from './replay.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import { World } from './world.ts';

const PORT = Number(process.env.API_PORT ?? 8787);

const world = new World(seedWorld());

// Optional flight recorder in MongoDB. Without MONGODB_URI, or if it can't be reached, the yard runs exactly the same in memory.
const recorder = process.env.MONGODB_URI
  ? await FlightRecorder.connect(process.env.MONGODB_URI).catch((err) => {
      console.error('[recorder] not connected, running without it:', err instanceof Error ? err.message : err);
      return null;
    })
  : null;
if (recorder) {
  world.state.corrections.push(...(await recorder.activeRules())); // the supervisor's rules outlive a restart
  world.subscribe((event) => recorder.record(event));
  console.log(`[recorder] connected, recording ${recorder.shift}`);
}
const contention = new Contention();
// A truck's BLOCKED report opens an incident and a free agent picks it up.
// A truck that reports again on an open incident is news for the agent already on it.
const sim = new Simulator(world, (report) => {
  const incident = openIncident(world, report);
  if (incident.status === 'queued') runner.assign();
  else runner.wake(incident.id, ` reported BLOCKED again at Door ${report.door} (${report.reason.replace('_', ' ')}).`);
});
const dispatch = new Dispatch(world, sim);
const runner = new AgentRunner({ world, sim, dispatch, contention, memory: recorder ? () => recorder.earlierShifts() : undefined, ask: claude() });
const actions = new Actions(world, runner);
const app = new Hono();

/** Runs a person's action. One that can't be applied comes back as 409 with the reason, and changes nothing. */
async function act(c: Context, run: (body: Record<string, unknown>) => void) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    run(body);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof ActionError) return c.json({ ok: false, message: err.message }, 409);
    throw err;
  }
}

function reset() {
  runner.stop();
  contention.disarm();
  sim.stop();
  world.reset(seedWorld());
}

app.get('/api/health', (c) =>
  c.json({ ok: true, seq: world.state.seq, anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY), recorder: recorder ? recorder.shift : null }),
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
        // `shift-…` replays a recorded shift from MongoDB; anything else is a dev fixture file.
        stopReplay = playFixture(w, replay.startsWith('shift-') && recorder ? await recorder.replayOf(replay) : await loadFixture(replay));
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

/**
 * Somebody reports a new problem in the yard (the later pallet in the memory scene).
 * A pallet with no truck heading for it still gets an incident, so it is cleared before a truck finds it.
 */
app.post('/api/problems', (c) =>
  act(c, (b) => {
    const cause = 'reported from the console';
    // A forklift or a worker drops out: unanswered offers that relied on them are withdrawn, and the agents are told.
    if (b.kind === 'forklift_down' || b.kind === 'worker_home') {
      const { equipment, workers } = world.state;
      const subject = b.kind === 'forklift_down' ? equipment.find((e) => e.id === b.equipment)?.id : workers.find((w) => w.id === b.worker && w.kind === 'person' && w.canDo.includes('clear_obstruction'))?.id;
      if (!subject) throw new ActionError(b.kind === 'forklift_down' ? 'Need a forklift: F-3 or F-4.' : 'Need a yard worker: sam or noor.');
      injectProblem(world, b.kind === 'forklift_down' ? { kind: b.kind, equipment: subject } : { kind: b.kind, worker: subject }, cause);
      const why = b.kind === 'forklift_down' ? `${subject} is out of service.` : `${workers.find((w) => w.id === subject)?.name} went off shift.`;
      for (const { incidentId, text } of withdrawOffersFor(world, subject, why)) runner.wake(incidentId, text);
      return;
    }
    const door = Number(b.door);
    if ((b.kind !== 'close_door' && b.kind !== 'drop_pallet') || !world.state.doors.some((d) => d.id === door)) throw new ActionError('Need a kind (close_door, drop_pallet, forklift_down or worker_home) and its door, equipment or worker.');
    const event = injectProblem(world, { kind: b.kind, door }, cause);
    const truckOnItsWay = [...sim.commands.values()].some((cmd) => cmd.door === door && world.state.trucks.find((t) => t.id === cmd.truckId)?.controller === 'moving');
    if (b.kind === 'drop_pallet' && !truckOnItsWay && openClearance(world, door, event.seq)) runner.assign();
  }),
);

/** The work record: every event of this shift, in order, exactly as it was recorded. */
app.get('/api/record', (c) => {
  c.header('Content-Disposition', 'attachment; filename="firefly-work-record.json"');
  return c.json({ exported_at: new Date().toISOString(), mode: 'Twin mode · simulated trucks', seq: world.state.seq, events: world.since(0) });
});

/** The reliability panel: outcomes of the current run, counted from its event log. Ask again after new events. */
app.get('/api/reliability', async (c) => {
  const shift = c.req.query('shift'); // a recorded shift's panel, counted the same way from MongoDB
  if (shift && recorder) return c.json(reliability(await recorder.eventsOf(shift)));
  return c.json(reliability(currentRun(world.since(0)), [...sim.commands.values()]));
});

/** Every recorded shift, newest first. Replay one with `/?replay=<shift>` in the console. */
app.get('/api/shifts', async (c) => c.json({ recording: recorder?.shift ?? null, shifts: recorder ? await recorder.shifts() : [] }));

/* ---------- the supervisor (console) ---------- */

app.post('/api/note', (c) => act(c, (b) => actions.note(String(b.text ?? ''), typeof b.incident_id === 'string' ? b.incident_id : undefined)));
app.post('/api/approvals/:id/approve', (c) => act(c, () => actions.approve(c.req.param('id'))));
app.post('/api/incidents/:id/resume', (c) => act(c, () => actions.resumeNow(c.req.param('id'))));
app.post('/api/corrections/:id/release', (c) => act(c, () => actions.releaseCorrection(c.req.param('id'))));

/* ---------- workers (phone page) ---------- */

app.post('/api/tasks/:id/accept', (c) => act(c, (b) => actions.answer(c.req.param('id'), String(b.worker ?? ''), true)));
app.post('/api/tasks/:id/decline', (c) => act(c, (b) => actions.answer(c.req.param('id'), String(b.worker ?? ''), false)));
app.post('/api/tasks/:id/report', (c) =>
  act(c, (b) => {
    if (b.what !== 'arrived' && b.what !== 'cleared' && b.what !== 'people_clear') throw new ActionError('Report must be arrived, cleared or people_clear.');
    actions.report(c.req.param('id'), String(b.worker ?? ''), b.what);
  }),
);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Firefly server on http://localhost:${info.port}`);
});

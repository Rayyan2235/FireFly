import type { Incident, Task, Worker } from '../../contract.ts';
import type { World } from '../world.ts';
import { BadInput, fail, ok, schema, text } from './types.ts';
import type { Tool, ToolContext } from './types.ts';

/** The correction, if any, that currently rules out a worker, a forklift or a door. */
export function activeRule(world: World, subject: string | undefined) {
  return subject ? world.state.corrections.find((c) => c.active && c.subject === subject) : undefined;
}

/**
 * Can this worker take this kind of task right now, and if not, why not.
 * One rule set for robots, people and agents (ADR 0010); offer_task runs it again at the moment it offers.
 */
export function eligibility(world: World, worker: Worker, capability: string): { eligible: boolean; reason: string } {
  const { equipment, tasks } = world.state;
  const no = (reason: string) => ({ eligible: false, reason });
  if (!worker.canDo.includes(capability)) return no(`${worker.kind === 'robot' ? 'tows trailers' : worker.canDo.join(', ').replaceAll('_', ' ')} only`);
  const workerRule = activeRule(world, worker.id);
  if (workerRule) return no(`excluded · ${workerRule.source}'s rule: ${workerRule.fact}`);
  if (worker.status === 'off_shift') return no('off shift');
  if (worker.status === 'out_of_service') return no('out of service');
  const gear = equipment.find((e) => e.id === worker.equipment);
  if (!gear) return no('no equipment assigned');
  if (gear.outOfService) return no(`${gear.id} is out of service`);
  const gearRule = activeRule(world, gear.id);
  if (gearRule) return no(`${gear.id} excluded · ${gearRule.source}'s rule: ${gearRule.fact}`);
  const current = tasks.find((t) => t.worker === worker.id && (t.status === 'offered' || t.status === 'accepted'));
  if (current) return no(current.status === 'offered' ? `has an unanswered offer (${current.id})` : `busy with ${current.id}`);
  if (worker.status === 'busy') return no('busy');
  return { eligible: true, reason: `free, with ${gear.id}` };
}

/** The incident this run owns. People tools need no truck, so they also work for a clearance incident. */
function own(ctx: ToolContext, incidentId: string): Incident {
  const incident = ctx.world.state.incidents.find((i) => i.id === ctx.incidentId);
  if (!incident) throw new BadInput(`Incident ${ctx.incidentId} no longer exists.`);
  if (incidentId !== incident.id) throw new BadInput(`This run works ${incident.id} only.`);
  return incident;
}

const liveTask = (world: World, incidentId: string) => world.state.tasks.find((t) => t.incidentId === incidentId && (t.status === 'offered' || t.status === 'accepted'));
const nameOf = (world: World, id: string | null) => world.state.workers.find((w) => w.id === id)?.name ?? id ?? 'nobody';

function taskChanged(ctx: ToolContext, task: Task, summary: string): void {
  ctx.world.emit({ type: 'task.changed', actor: { kind: 'system', id: 'tools' }, source_mode: 'system', incident_id: task.incidentId, summary, payload: { ...task } });
}

/** Takes back an unanswered offer and tells the worker. Accepted work is never touched here. */
export function cancelOffer(ctx: ToolContext, task: Task, why: string): void {
  task.status = 'withdrawn';
  const name = nameOf(ctx.world, task.worker);
  ctx.world.emit({
    type: 'radio',
    actor: { kind: 'agent', id: ctx.agentId },
    source_mode: 'system',
    incident_id: task.incidentId,
    summary: `Firefly → ${name} CANCEL: ${why}`,
    payload: { from: 'Firefly', to: name, type: 'CANCEL', text: why },
  });
  taskChanged(ctx, task, `Offer ${task.id} to ${name} withdrawn: ${why}`);
}

const incidentId = { type: 'string', description: 'Incident id, e.g. R-5.' };

export const listEligibleWorkers: Tool = {
  name: 'list_eligible_workers',
  kind: 'read',
  description: 'Who can take a task right now: robots, agents and people, each with the reason they can or cannot. Includes saved supervisor rules. A snapshot only: offer_task re-checks.',
  input_schema: schema({ task: { type: 'string', enum: ['clear_obstruction'], description: 'The kind of work needed.' } }),
  run({ world }, input) {
    const task = text(input, 'task');
    const { workers } = world.state;
    const robots = workers.filter((w) => w.kind === 'robot');
    const others = workers.filter((w) => w.kind !== 'robot').map((w) => ({ id: w.id, name: w.name, kind: w.kind, equipment: w.equipment ?? null, ...eligibility(world, w, task) }));
    const eligible = others.filter((w) => w.eligible);
    const excluded = others.filter((w) => !w.eligible && w.kind === 'person' && w.equipment);
    return ok(
      `Eligible: ${eligible.map((w) => `${w.name} + ${w.equipment}`).join(', ') || 'nobody'}.${excluded.length ? ` Excluded: ${excluded.map((w) => `${w.name} (${w.reason})`).join(', ')}.` : ''} Yard trucks and agents cannot do this.`,
      {
        task,
        eligible: eligible.map((w) => ({ worker_id: w.id, name: w.name, equipment: w.equipment, reason: w.reason })),
        not_eligible: [
          { group: `yard trucks ${robots[0]?.id}…${robots.at(-1)?.id}`, kind: 'robot', reason: robots[0] ? eligibility(world, robots[0], task).reason : 'none on site' },
          ...others.filter((w) => !w.eligible).map((w) => ({ worker_id: w.id, name: w.name, kind: w.kind, equipment: w.equipment, reason: w.reason })),
        ],
      },
    );
  },
};

export const offerTask: Tool = {
  name: 'offer_task',
  kind: 'mutation',
  description: 'Offer your incident\'s clearance task to one worker. Checks the worker again at this moment. An offer is not acceptance: end your turn and you will be told when they answer.',
  input_schema: schema({ incident_id: incidentId, worker_id: { type: 'string', description: 'Worker id from list_eligible_workers, e.g. sam.' } }),
  run(ctx, input) {
    const { world } = ctx;
    const incident = own(ctx, text(input, 'incident_id'));
    const door = world.state.doors.find((d) => d.id === incident.door);
    if (!door?.obstruction) return fail('nothing_to_clear', `Door ${incident.door} has no obstruction to clear.`);
    const pending = liveTask(world, incident.id);
    if (pending) return fail('task_already_out', `${pending.id} is already ${pending.status} by ${nameOf(world, pending.worker)}. Withdraw it first if it is still only offered.`, { task_id: pending.id, status: pending.status });
    const worker = world.state.workers.find((w) => w.id === text(input, 'worker_id'));
    if (!worker) return fail('unknown_worker', 'No such worker.');
    const check = eligibility(world, worker, 'clear_obstruction');
    if (!check.eligible) return fail('not_eligible', `Rejected: ${worker.name} is not eligible (${check.reason}).`, { reason: check.reason });

    const task: Task = { id: `K-${world.state.tasks.length + 1}`, incidentId: incident.id, door: incident.door, worker: worker.id, equipment: worker.equipment ?? null, status: 'offered', arrived: false, cleared: false, peopleClear: false };
    world.state.tasks.push(task);
    const ask = `Clear the obstruction on the Door ${task.door} approach with ${task.equipment}.`;
    world.emit({
      type: 'radio',
      actor: { kind: 'agent', id: ctx.agentId },
      source_mode: 'system',
      incident_id: incident.id,
      summary: `Firefly → ${worker.name} TASK: ${ask}`,
      payload: { from: 'Firefly', to: worker.name, type: 'TASK', text: ask },
    });
    taskChanged(ctx, task, `Task ${task.id} offered to ${worker.name} + ${task.equipment}.`);
    return ok(`Offered ${task.id} to ${worker.name} + ${task.equipment}. Waiting for their answer.`, { task_id: task.id, status: 'offered', worker_id: worker.id, equipment: task.equipment });
  },
};

export const withdrawOffer: Tool = {
  name: 'withdraw_offer',
  kind: 'mutation',
  description: 'Take back an offer nobody has accepted yet. Accepted work cannot be withdrawn: it stays with its worker.',
  input_schema: schema({ task_id: { type: 'string', description: 'Task id, e.g. K-1.' } }),
  run(ctx, input) {
    const task = ctx.world.state.tasks.find((t) => t.id === text(input, 'task_id'));
    if (!task || task.incidentId !== ctx.incidentId) return fail('unknown_task', 'No such task on your incident.');
    if (task.status === 'accepted') return fail('already_accepted', `${task.id} was accepted by ${nameOf(ctx.world, task.worker)}. Accepted work is not withdrawn.`);
    if (task.status !== 'offered') return fail('not_offered', `${task.id} is ${task.status}.`);
    cancelOffer(ctx, task, 'Offer withdrawn.');
    return ok(`Withdrew ${task.id}.`, { task_id: task.id, status: 'withdrawn' });
  },
};

export const saveCorrection: Tool = {
  name: 'save_correction',
  kind: 'mutation',
  description:
    'Save a fact the supervisor just told you about a forklift, a worker or a door, so every later decision uses it. Only works right after a supervisor note. Unanswered offers that conflict with it are withdrawn automatically. Do not use it for anything the supervisor did not say.',
  input_schema: schema({
    subject_type: { type: 'string', enum: ['equipment', 'worker', 'door'] },
    subject_id: { type: 'string', description: 'F-3, a worker id such as sam, or a door number such as 6.' },
    fact: { type: 'string', description: 'The fact, in the supervisor\'s meaning, e.g. "leaking".' },
    release_condition: { type: 'string', description: 'What ends it, e.g. "maintenance clears it". Use "until the supervisor says otherwise" if none was given.' },
    interpretation: { type: 'string', description: 'One plain sentence restating what will now happen, e.g. "F-3 excluded until maintenance clears it."' },
  }),
  run(ctx, input) {
    const { world, note } = ctx;
    if (!note) return fail('no_supervisor_note', 'There is no supervisor note to save. Only the supervisor adds rules.');
    const type = text(input, 'subject_type');
    const raw = text(input, 'subject_id');
    const { equipment, workers, doors, tasks } = world.state;
    const subject =
      type === 'equipment' ? equipment.find((e) => e.id.toLowerCase() === raw.toLowerCase())?.id
      : type === 'worker' ? workers.find((w) => w.kind === 'person' && (w.id === raw.toLowerCase() || w.name.toLowerCase() === raw.toLowerCase()))?.id
      : doors.some((d) => String(d.id) === raw.replace(/\D/g, '')) ? `D${raw.replace(/\D/g, '')}` : undefined;
    if (!subject) return fail('unknown_subject', `No ${type} "${raw}" on this site. Firefly can record facts about doors, equipment and worker availability. Nothing was saved.`);

    const existing = activeRule(world, subject);
    if (existing) return ok(`Already saved: ${existing.interpretation}`, { correction_id: existing.id, already_saved: true });

    const correction = {
      id: `C-${world.state.corrections.length + 1}`,
      subject,
      fact: text(input, 'fact'),
      source: note.from,
      createdAt: new Date().toISOString(),
      releaseCondition: text(input, 'release_condition'),
      active: true,
      interpretation: text(input, 'interpretation'),
    };
    world.state.corrections.push(correction);
    world.emit({
      type: 'correction.saved',
      actor: { kind: 'agent', id: ctx.agentId },
      source_mode: 'system',
      incident_id: ctx.incidentId,
      caused_by: note.seq,
      summary: `Saved: ${correction.interpretation} Source: ${correction.source}.`,
      payload: { ...correction },
    });

    // The correction itself invalidates conflicting pending work: no countdown, no second step (ADR 0006).
    const withdrawn: string[] = [];
    const stillAccepted: string[] = [];
    for (const task of tasks.filter((t) => t.equipment === subject || t.worker === subject)) {
      if (task.status === 'offered') {
        cancelOffer(ctx, task, `${subject} is excluded by ${correction.source}'s rule.`);
        withdrawn.push(task.id);
        if (task.incidentId !== ctx.incidentId) ctx.wake?.(task.incidentId, `Your offer ${task.id} was withdrawn: ${correction.interpretation} (${correction.source}'s rule).`);
      } else if (task.status === 'accepted') stillAccepted.push(task.id);
    }
    return ok(`Saved: ${correction.interpretation} Source: ${correction.source}.${withdrawn.length ? ` Withdrew ${withdrawn.join(', ')}.` : ''}`, {
      correction_id: correction.id,
      subject,
      withdrawn_offers: withdrawn,
      accepted_work_not_changed: stillAccepted, // accepted work is never silently transferred
    });
  },
};

/** What still has to be true before the incident's truck may resume. Empty means the gate is open. */
export function resumeBlockers(world: World, incident: Incident): string[] {
  const { doors, tasks, approvals } = world.state;
  const door = doors.find((d) => d.id === incident.door);
  const task = tasks.find((t) => t.incidentId === incident.id && (t.status === 'accepted' || t.status === 'closed'));
  const missing: string[] = [];
  if (door?.obstruction || !task?.cleared) missing.push('The worker has not reported the obstruction cleared.');
  if (!task?.peopleClear) missing.push('The worker has not reported people clear.');
  if (!approvals.some((a) => a.incidentId === incident.id && a.status === 'approved')) missing.push('The supervisor has not authorized the resume.');
  return missing;
}

export const requestAuthorization: Tool = {
  name: 'request_authorization',
  kind: 'mutation',
  description: 'Ask the supervisor to authorize resuming your held truck. Only once the worker has reported the obstruction cleared and people clear. Then end your turn.',
  input_schema: schema({ incident_id: incidentId }),
  run(ctx, input) {
    const { world } = ctx;
    const incident = own(ctx, text(input, 'incident_id'));
    const existing = world.state.approvals.find((a) => a.incidentId === incident.id);
    if (existing) return ok(`Authorization ${existing.id} is already ${existing.status}.`, { approval_id: existing.id, status: existing.status });
    const missing = resumeBlockers(world, incident).filter((m) => !m.startsWith('The supervisor'));
    if (missing.length) return fail('not_ready', `Not ready to ask: ${missing.join(' ')}`, { missing });

    const approval = { id: `A-${world.state.approvals.length + 1}`, incidentId: incident.id, kind: 'resume', status: 'pending' } as const;
    world.state.approvals.push({ ...approval });
    world.emit({ type: 'approval.changed', actor: { kind: 'agent', id: ctx.agentId }, source_mode: 'system', incident_id: incident.id, summary: `${incident.id}: asked the supervisor to authorize the resume.`, payload: { ...approval } });
    incident.status = 'needs_you';
    world.emit({ type: 'incident.updated', actor: { kind: 'agent', id: ctx.agentId }, source_mode: 'system', incident_id: incident.id, summary: `${incident.id} needs the supervisor: authorize the resume.`, payload: { ...incident } });
    return ok(`Asked the supervisor to authorize (${approval.id}). Waiting.`, { approval_id: approval.id, status: 'pending' });
  },
};

export const requestResume: Tool = {
  name: 'request_resume',
  kind: 'mutation',
  description: 'Ask your held truck\'s controller to resume into its door. Every release prerequisite is checked at this moment; if any is missing the request is rejected and lists what is missing. Use a new request_id.',
  input_schema: schema({ incident_id: incidentId, request_id: { type: 'string', description: 'Your id for this request, e.g. r-5-1.' } }),
  run(ctx, input) {
    const { world, sim } = ctx;
    const incident = own(ctx, text(input, 'incident_id'));
    const requestId = text(input, 'request_id');
    const truck = world.state.trucks.find((t) => t.id === incident.truckId);
    if (!truck) return fail('no_truck', `${incident.id} has no truck to resume.`);

    const existing = sim.commands.get(requestId);
    if (existing) {
      if (existing.truckId !== truck.id || existing.kind !== 'RESUME') return fail('request_id_reused', `${requestId} was already used for another request. Use a new id.`);
      return ok(`${requestId} was already sent (${existing.status}). Not sent again.`, { request_id: requestId, status: existing.status, repeated: true });
    }
    const missing = resumeBlockers(world, incident);
    if (truck.controller !== 'held') missing.push(`${truck.id} is ${truck.controller}, not held.`);
    if (missing.length) return fail('prerequisites_missing', `Rejected: ${missing.join(' ')}`, { missing });

    sim.send({
      requestId,
      truckId: truck.id,
      door: incident.door,
      kind: 'RESUME',
      incidentId: incident.id,
      sender: { actor: { kind: 'agent', id: ctx.agentId }, name: 'Firefly', source_mode: 'system' },
    });
    return ok(`Sent ${requestId}. Waiting for the controller to acknowledge.`, { request_id: requestId, status: 'sent' });
  },
};

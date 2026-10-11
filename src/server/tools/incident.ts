import type { FireflyEvent, Incident, IncidentKind } from '../../contract.ts';
import { fail, ok, schema, scope, text } from './types.ts';
import type { Tool, ToolContext, ToolResult } from './types.ts';

const incidentId = { type: 'string', description: 'Incident id, e.g. R-2.' };

/** The site's approved procedures. Fixed text: the model reads them, it does not write them. */
const PROCEDURES: Record<IncidentKind, { steps: string[]; before_resume: string[] }> = {
  door_closed: {
    steps: [
      'If the job may switch doors, reserve a free door of the kind the job needs.',
      'Request the new destination and wait for the controller to acknowledge and arrive.',
      'Verify the outcome. Only a verified arrival closes the incident.',
      'If the job cannot switch doors or no door is free, escalate. The truck stays held.',
    ],
    before_resume: [],
  },
  obstruction: {
    steps: [
      'Trucks cannot clear an obstruction. If the job may switch doors, a free door is allowed, but the obstruction still has to be cleared.',
      'Otherwise offer a clearance task to an eligible worker with serviceable equipment.',
      'When every release prerequisite is met, request resume, then verify the outcome.',
      'If no eligible worker or equipment is available, escalate. The truck stays held.',
    ],
    before_resume: ['The worker reports the obstruction cleared.', 'The worker reports people clear of the truck\'s path.', 'The supervisor authorizes the resume.'],
  },
  clearance: {
    steps: ['Offer a clearance task to an eligible worker with serviceable equipment.', 'When the worker reports the obstruction cleared, verify the outcome.', 'If no eligible worker or equipment is available, escalate.'],
    before_resume: [],
  },
};

export const inspectIncident: Tool = {
  name: 'inspect_incident',
  kind: 'read',
  description: 'Read an incident: what the truck\'s controller reported, where the truck is, and the state of the door.',
  input_schema: schema({ incident_id: incidentId }),
  run({ world }, input) {
    const { incidents, trucks, doors } = world.state;
    const incident = incidents.find((i) => i.id === text(input, 'incident_id'));
    if (!incident) return fail('unknown_incident', 'No such incident.');
    const truck = trucks.find((t) => t.id === incident.truckId);
    const door = doors.find((d) => d.id === incident.door);
    const log = world.since(0);
    const opened = log.find((e) => e.type === 'incident.opened' && e.incident_id === incident.id);
    const report = log.find((e) => e.seq === opened?.caused_by) as FireflyEvent<'radio'> | undefined;
    const where = truck ? `${truck.id} is ${truck.controller} on the approach lane.` : 'No truck is held behind it.';
    return ok(`${where} Door ${incident.door} reported ${incident.kind === 'door_closed' ? 'closed' : 'obstructed'}.`, {
      incident: { id: incident.id, kind: incident.kind, status: incident.status, door: incident.door, opened_at: opened?.ts ?? null },
      controller_report: report ? { from: report.payload.from, type: report.payload.type, text: report.payload.text, at: report.ts } : null,
      truck: truck ? { id: truck.id, job_id: truck.jobId, controller: truck.controller } : null,
      door: door ? { id: door.id, kind: door.kind, closed: door.closed, obstruction: door.obstruction, occupant: door.occupant, reserved_by: door.reservedBy } : null,
    });
  },
};

export const getSiteProcedure: Tool = {
  name: 'get_site_procedure',
  kind: 'read',
  description: 'Read the site\'s approved procedure for a kind of incident, including what must be true before a held truck may resume.',
  input_schema: schema({ incident_kind: { type: 'string', enum: ['door_closed', 'obstruction', 'clearance'] } }),
  run(_ctx, input) {
    const kind = text(input, 'incident_kind') as IncidentKind;
    const procedure = PROCEDURES[kind];
    if (!procedure) return fail('unknown_kind', 'No procedure for that kind of incident.');
    return ok(`Procedure for ${kind.replace('_', ' ')}: ${procedure.steps.length} steps, ${procedure.before_resume.length} release prerequisites.`, { incident_kind: kind, ...procedure });
  },
};

export const verifyOutcome: Tool = {
  name: 'verify_outcome',
  kind: 'mutation',
  description: 'Check with the controller that your truck really docked at its door. This is the only way an incident is resolved; saying it is done closes nothing.',
  input_schema: schema({ incident_id: incidentId }),
  run(ctx, input) {
    const { world, sim } = ctx;
    const clearance = world.state.incidents.find((i) => i.id === ctx.incidentId && i.kind === 'clearance');
    if (clearance) return verifyClearance(ctx, clearance, text(input, 'incident_id'));
    const { incident, truck, job } = scope(ctx);
    if (text(input, 'incident_id') !== incident.id) return fail('not_your_incident', `This run works ${incident.id} only.`);
    if (incident.status === 'resolved') return ok(`${incident.id} is already resolved.`, { resolved: true });

    const door = world.state.doors.find((d) => d.occupant === truck.id);
    const arrival = [...sim.commands.values()].find((c) => c.truckId === truck.id && c.status === 'completed' && c.door === door?.id);
    const missing: string[] = [];
    if (truck.controller !== 'docked') missing.push(`${truck.id}'s controller reports "${truck.controller}", not docked.`);
    if (!door || door.id !== job.assignedDoor) missing.push(`${truck.id} is not at ${job.id}'s door.`);
    if (!arrival) missing.push('No completed controller command for this arrival.');
    if (missing.length || !door) return fail('not_verified', `Not verified: ${missing.join(' ')}`, { resolved: false, missing });

    const { tasks, approvals } = world.state;
    const assisted = tasks.some((t) => t.incidentId === incident.id) || approvals.some((a) => a.incidentId === incident.id);
    incident.status = 'resolved';
    incident.outcome = assisted ? 'Recovered with physical assistance' : 'Recovered without supervisor input';
    world.emit({
      type: 'incident.resolved',
      actor: { kind: 'system', id: 'tools' },
      source_mode: 'system',
      incident_id: incident.id,
      job_id: job.id,
      request_id: arrival?.requestId,
      summary: `Incident ${incident.id} closed: ${incident.outcome.toLowerCase()}.`,
      payload: { ...incident },
    });
    return ok(`${truck.id} docked at Door ${door.id}. Controller confirmed arrival.`, { resolved: true, door: door.id, outcome: incident.outcome });
  },
};

/** A clearance incident has no truck: it is done when a worker has reported the obstruction cleared. */
function verifyClearance(ctx: ToolContext, incident: Incident, askedFor: string): ToolResult {
  const { world } = ctx;
  if (askedFor !== incident.id) return fail('not_your_incident', `This run works ${incident.id} only.`);
  if (incident.status === 'resolved') return ok(`${incident.id} is already resolved.`, { resolved: true });
  const door = world.state.doors.find((d) => d.id === incident.door);
  const task = world.state.tasks.find((t) => t.incidentId === incident.id && t.cleared);
  const missing: string[] = [];
  if (!task) missing.push('No worker has reported the obstruction cleared.');
  if (door?.obstruction) missing.push(`The Door ${incident.door} approach is still obstructed.`);
  if (missing.length) return fail('not_verified', `Not verified: ${missing.join(' ')}`, { resolved: false, missing });

  incident.status = 'resolved';
  incident.outcome = 'Obstruction cleared with physical assistance';
  world.emit({
    type: 'incident.resolved',
    actor: { kind: 'system', id: 'tools' },
    source_mode: 'system',
    incident_id: incident.id,
    summary: `Incident ${incident.id} closed: obstruction cleared with physical assistance.`,
    payload: { ...incident },
  });
  return ok(`Door ${incident.door} approach reported cleared.`, { resolved: true, door: incident.door, outcome: incident.outcome });
}

export const escalate: Tool = {
  name: 'escalate',
  kind: 'mutation',
  description: 'Hand the incident to the supervisor when you cannot proceed. Say exactly what is missing or blocked. The truck stays held and the incident stays yours.',
  input_schema: schema({ incident_id: incidentId, missing: { type: 'string', description: 'What is missing or blocked, in one sentence.' } }),
  run(ctx, input) {
    const incident = ctx.world.state.incidents.find((i) => i.id === ctx.incidentId);
    if (!incident || text(input, 'incident_id') !== incident.id) return fail('not_your_incident', `This run works ${ctx.incidentId} only.`);
    if (incident.status === 'resolved') return fail('already_resolved', `${incident.id} is already resolved.`);
    const truck = ctx.world.state.trucks.find((t) => t.id === incident.truckId); // a clearance incident has none
    const missing = text(input, 'missing');

    incident.status = 'needs_you';
    ctx.world.emit({
      type: 'incident.updated',
      actor: { kind: 'agent', id: ctx.agentId },
      source_mode: 'system',
      incident_id: incident.id,
      job_id: truck?.jobId,
      summary: `${incident.id} escalated to the supervisor: ${missing}`,
      payload: { ...incident },
    });
    return ok(truck ? `Escalated. ${truck.id} stays ${truck.controller}.` : 'Escalated.', { status: 'needs_you', truck_controller: truck?.controller ?? null });
  },
};

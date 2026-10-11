import type { Door, Job } from '../../contract.ts';
import type { World } from '../world.ts';
import { fail, int, ok, schema, scope, text } from './types.ts';
import type { Tool } from './types.ts';

export interface DoorConflict {
  conflict: 'unknown_door' | 'wrong_kind' | 'switch_not_allowed' | 'door_closed' | 'obstruction' | 'occupied' | 'door_taken';
  reason: string;
  by?: string; // the truck in the way
}

/** Why `job` can't have `door` right now, or null if it can. The single source of door rules. */
export function doorConflict(world: World, job: Job, door: Door | undefined): DoorConflict | null {
  if (!door) return { conflict: 'unknown_door', reason: 'No such door.' };
  if (door.kind !== job.kind) return { conflict: 'wrong_kind', reason: `Door ${door.id} is a ${door.kind} door; ${job.id} needs ${job.kind}.` };
  if (door.id !== job.assignedDoor && !job.canSwitchDoor) return { conflict: 'switch_not_allowed', reason: `${job.id} must use Door ${job.assignedDoor}; it cannot switch doors.` };
  if (door.closed) return { conflict: 'door_closed', reason: `Door ${door.id} is closed.` };
  if (door.obstruction) return { conflict: 'obstruction', reason: `The Door ${door.id} approach is obstructed.` };
  if (door.occupant && door.occupant !== job.truckId) return { conflict: 'occupied', reason: `Door ${door.id} is occupied by ${door.occupant}.`, by: door.occupant };
  if (door.reservedBy && door.reservedBy !== job.id) {
    const by = world.state.jobs.find((j) => j.id === door.reservedBy)?.truckId ?? door.reservedBy;
    return { conflict: 'door_taken', reason: `Door ${door.id} was just taken by ${by}.`, by };
  }
  return null;
}

const jobId = { type: 'string', description: 'Job id, e.g. J-2.' };
const doorNumber = { type: 'integer', description: 'Door number, 1 to 8.' };

export const getJob: Tool = {
  name: 'get_job',
  kind: 'read',
  description: 'Read a job: direction, the kind of door it needs, its assigned door, and whether it may switch doors.',
  input_schema: schema({ job_id: jobId }),
  run({ world }, input) {
    const job = world.state.jobs.find((j) => j.id === text(input, 'job_id'));
    if (!job) return fail('unknown_job', 'No such job.');
    const reserved = world.state.doors.filter((d) => d.reservedBy === job.id).map((d) => d.id);
    return ok(`${job.direction === 'in' ? 'Inbound' : 'Outbound'} · ${job.kind} doors only · ${job.canSwitchDoor ? 'door switch allowed' : `must use Door ${job.assignedDoor}`}.`, {
      job_id: job.id,
      truck_id: job.truckId,
      direction: job.direction,
      needs_door_kind: job.kind,
      assigned_door: job.assignedDoor,
      can_switch_door: job.canSwitchDoor,
      reserved_doors: reserved,
    });
  },
};

export const listCompatibleDoors: Tool = {
  name: 'list_compatible_doors',
  kind: 'read',
  description: 'List the doors a job could use right now, and why every other door is excluded. A snapshot only: reserve_door re-checks.',
  input_schema: schema({ job_id: jobId }),
  run({ world }, input) {
    const job = world.state.jobs.find((j) => j.id === text(input, 'job_id'));
    if (!job) return fail('unknown_job', 'No such job.');
    const free: number[] = [];
    const excluded: Array<{ door: number } & DoorConflict> = [];
    for (const door of world.state.doors) {
      const conflict = doorConflict(world, job, door);
      if (conflict) excluded.push({ door: door.id, ...conflict });
      else free.push(door.id);
    }
    const sameKind = excluded.filter((e) => e.conflict !== 'wrong_kind').map((e) => `D${e.door} ${e.conflict.replaceAll('_', ' ')}`);
    return ok(`Free: ${free.map((d) => `D${d}`).join(', ') || 'none'}. Excluded: ${sameKind.join(', ') || 'none'}.`, { free, excluded });
  },
};

export const reserveDoor: Tool = {
  name: 'reserve_door',
  kind: 'mutation',
  description: 'Claim a door for your job. Checks the door again at this moment and fails with the specific conflict if it is no longer available. Releases the job\'s previous door on success.',
  input_schema: schema({ job_id: jobId, door: doorNumber }),
  // No await anywhere in here: check and write happen in one uninterrupted step, so two agents can't both win a door.
  run(ctx, input) {
    const { world } = ctx;
    const { job } = scope(ctx);
    if (text(input, 'job_id') !== job.id) return fail('not_your_job', `This incident works ${job.id} only.`);
    const door = world.state.doors.find((d) => d.id === int(input, 'door'));

    let conflict = doorConflict(world, job, door);
    if (!conflict && door && door.reservedBy !== job.id && ctx.contention?.fire(world, ctx.dispatch, door)) conflict = doorConflict(world, job, door);
    if (conflict || !door) return fail(conflict?.conflict ?? 'unknown_door', `Rejected: ${conflict?.reason}`, conflict?.by ? { by: conflict.by } : {});
    if (door.reservedBy === job.id) return ok(`Door ${door.id} is already reserved for ${job.id}.`, { door: door.id });

    const released = world.state.doors.filter((d) => d.reservedBy === job.id);
    door.reservedBy = job.id;
    job.assignedDoor = door.id;
    const event = { type: 'door.changed', actor: { kind: 'system', id: 'tools' }, source_mode: 'system', incident_id: ctx.incidentId, job_id: job.id } as const;
    world.emit({ ...event, summary: `Door ${door.id} reserved for ${job.id}.`, payload: { ...door } });
    for (const old of released) {
      old.reservedBy = null;
      world.emit({ ...event, summary: `Door ${old.id} reservation released.`, payload: { ...old } });
    }
    return ok(`Reserved Door ${door.id} for ${job.id}.`, { door: door.id, released: released.map((d) => d.id) });
  },
};

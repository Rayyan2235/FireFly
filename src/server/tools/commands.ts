import type { Command } from '../simulator.ts';
import { fail, int, ok, schema, scope, text } from './types.ts';
import type { Tool } from './types.ts';

const MAX_WAIT_S = 30;

/** A command the controller has finished with, one way or another. */
const settled = (c: Command) => c.status === 'completed' || c.status === 'rejected' || c.status === 'timed_out' || Boolean(c.detail);

export const requestDestination: Tool = {
  name: 'request_destination',
  kind: 'mutation',
  description:
    'Ask your held truck\'s controller to go to a door you have reserved. This only sends the request: the truck moves when its controller acknowledges. Use a new request_id per request; repeating an id returns the earlier command and sends nothing.',
  input_schema: schema({
    truck_id: { type: 'string', description: 'Truck id, e.g. T-2.' },
    door: { type: 'integer', description: 'Door number, 1 to 8.' },
    request_id: { type: 'string', description: 'Your id for this request, e.g. r-2-1.' },
  }),
  run(ctx, input) {
    const { world, sim } = ctx;
    const { truck, job } = scope(ctx);
    const truckId = text(input, 'truck_id');
    const doorId = int(input, 'door');
    const requestId = text(input, 'request_id');

    const existing = sim.commands.get(requestId);
    if (existing) {
      if (existing.truckId !== truckId || existing.door !== doorId) return fail('request_id_reused', `${requestId} was already used for ${existing.truckId} → Door ${existing.door}. Use a new id.`);
      return ok(`${requestId} was already sent (${existing.status}). Not sent again.`, { request_id: requestId, status: existing.status, repeated: true });
    }
    if (truckId !== truck.id) return fail('not_your_truck', `This incident works ${truck.id} only.`);
    const door = world.state.doors.find((d) => d.id === doorId);
    if (!door) return fail('unknown_door', 'No such door.');
    if (door.reservedBy !== job.id) return fail('no_reservation', `${job.id} does not hold Door ${door.id}. Reserve it first.`);
    if (door.closed) return fail('door_closed', `Door ${door.id} is closed.`);
    if (door.obstruction) return fail('obstruction', `The Door ${door.id} approach is obstructed.`);
    if (truck.controller !== 'held') return fail('truck_not_held', `${truck.id} is ${truck.controller}, not held.`);

    sim.send({
      requestId,
      truckId,
      door: door.id,
      kind: 'GO_TO',
      incidentId: ctx.incidentId,
      sender: { actor: { kind: 'agent', id: ctx.agentId }, name: 'Firefly', source_mode: 'system' },
    });
    return ok(`Sent ${requestId}. Waiting for the controller to acknowledge.`, { request_id: requestId, status: 'sent' });
  },
};

export const getCommandStatus: Tool = {
  name: 'get_command_status',
  kind: 'read',
  description: `Read what the controller has said about a request. Waits up to wait_s seconds (max ${MAX_WAIT_S}) for it to finish. If it has not finished by then the status is uncertain: never treat that as completed or cancelled.`,
  input_schema: schema({
    request_id: { type: 'string', description: 'The id you sent the request with.' },
    wait_s: { type: 'integer', description: `Seconds to wait for the controller, 0 to ${MAX_WAIT_S}.` },
  }),
  async run({ world, sim }, input) {
    const requestId = text(input, 'request_id');
    const command = sim.commands.get(requestId);
    if (!command) return fail('unknown_request', `No request ${requestId} was sent.`);

    const waitS = Math.min(Math.max(int(input, 'wait_s'), 0), MAX_WAIT_S);
    const deadline = Date.now() + waitS * 1000;
    while (!settled(command) && Date.now() < deadline && sim.commands.get(requestId) === command) {
      await sim.waitForChange(requestId, deadline - Date.now());
    }

    const truck = world.state.trucks.find((t) => t.id === command.truckId);
    const output = {
      request_id: requestId,
      truck_id: command.truckId,
      door: command.door,
      status: command.status,
      detail: command.detail ?? null,
      truck_controller: truck?.controller ?? null,
      uncertain: !settled(command),
    };
    if (command.status === 'completed') return ok(`${requestId} completed: ${command.truckId} docked at Door ${command.door}.`, output);
    if (command.status === 'rejected') return ok(`${requestId} rejected by the controller: ${command.detail}`, output);
    if (command.detail) return ok(`${requestId} acknowledged, then ${command.truckId} stopped itself. ${command.detail}`, output);
    return ok(`${requestId} is still "${command.status}" after ${waitS} s. Uncertain: not completed, not cancelled.`, output);
  },
};

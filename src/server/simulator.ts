import { YARD, doorX } from '../contract.ts';
import type { Actor, Door, MessageType, SourceMode, Truck } from '../contract.ts';
import { poseAfter, routeToDoor, travelMs } from './routes.ts';
import type { World } from './world.ts';

/** A request to a truck's controller. Sending one moves nothing: the controller answers on the channel. */
export interface Command {
  requestId: string;
  truckId: string;
  kind: 'GO_TO' | 'RESUME';
  door: number;
  status: 'queued' | 'sent' | 'acknowledged' | 'completed' | 'rejected' | 'timed_out';
  detail?: string; // why it was rejected, or what stopped the truck
  incidentId?: string;
}

export interface CommandRequest {
  requestId: string;
  truckId: string;
  kind: Command['kind'];
  door: number;
  incidentId?: string;
  /** Who is asking: an agent's tool call (`system`) or routine dispatch (`simulated`). */
  sender: { actor: Actor; name: string; source_mode: SourceMode };
}

/** What a truck tells Firefly when it has stopped itself. */
export interface BlockedReport {
  truckId: string;
  door: number;
  reason: 'door_closed' | 'obstruction';
  seq: number; // the BLOCKED radio event
}

const ACK_MS = 600; // how long a controller takes to answer a command

/**
 * The simulated truck controllers ("twin mode"). They stand where real controllers
 * would plug in: they accept commands, drive, sense the door ahead, stop themselves
 * and report on the channel. Firefly never moves or stops a truck directly.
 */
export class Simulator {
  readonly commands = new Map<string, Command>();
  private readonly world: World;
  private readonly onBlocked: (report: BlockedReport) => void;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(world: World, onBlocked: (report: BlockedReport) => void = () => {}) {
    this.world = world;
    this.onBlocked = onBlocked;
  }

  /** Puts a command on the channel. A repeated request id returns the first command and runs nothing twice. */
  send(request: CommandRequest): Command {
    const existing = this.commands.get(request.requestId);
    if (existing) return existing;
    this.truck(request.truckId); // unknown trucks and doors fail here, not later inside a timer
    this.door(request.door);

    const { sender, ...rest } = request;
    const command: Command = { ...rest, status: 'sent' };
    this.commands.set(command.requestId, command);
    const text = `${command.kind === 'GO_TO' ? `Go to Door ${command.door}.` : `Resume to Door ${command.door}.`} (${command.requestId})`;
    this.world.emit({
      type: 'radio',
      actor: sender.actor,
      source_mode: sender.source_mode,
      incident_id: command.incidentId,
      request_id: command.requestId,
      summary: `${sender.name} → ${command.truckId} ${command.kind}: ${text}`,
      payload: { from: sender.name, to: command.truckId, type: command.kind, text, requestId: command.requestId },
    });
    this.after(ACK_MS, () => this.receive(command));
    return command;
  }

  /** Cancels every pending controller timer and forgets all commands (used by reset). */
  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.commands.clear();
  }

  /* ---------- controller side ---------- */

  /** The controller decides whether to accept a command. */
  private receive(command: Command): void {
    const truck = this.truck(command.truckId);
    const refusal =
      truck.controller === 'moving'
        ? 'Already moving.'
        : command.kind === 'RESUME' && truck.controller !== 'held'
          ? 'Not held, nothing to resume.'
          : null;
    if (refusal) {
      command.status = 'rejected';
      command.detail = refusal;
      return;
    }

    command.status = 'acknowledged';
    this.say(command, 'ACK', `${command.requestId} accepted.`);

    if (truck.controller === 'docked') this.leaveDoor(truck);
    const path = routeToDoor(truck.pose, command.door);
    const approach = path.slice(0, -1);
    if (approach.length === 0) return this.atApproach(command, false); // already lined up with the door

    const from = { ...truck.pose };
    truck.controller = 'moving';
    this.world.emit({
      type: 'truck.route',
      actor: { kind: 'robot', id: truck.id },
      source_mode: 'simulated',
      incident_id: command.incidentId,
      request_id: command.requestId,
      summary: `${truck.id} heading to Door ${command.door}.`,
      payload: { truckId: truck.id, requestId: command.requestId, from, path, speed: YARD.speed, reverseSpeed: YARD.reverseSpeed },
    });
    this.after(travelMs(from, approach), () => {
      truck.pose = poseAfter(from, approach);
      this.atApproach(command, true);
    });
  }

  /** Lined up in front of the door: the truck looks before it backs in, and stops itself if it can't. */
  private atApproach(command: Command, routeAnnounced: boolean): void {
    const truck = this.truck(command.truckId);
    const door = this.door(command.door);
    const reason = door.closed ? 'door_closed' : door.obstruction ? 'obstruction' : null;

    if (reason) {
      truck.controller = 'held';
      this.world.emit({
        type: 'truck.state',
        actor: { kind: 'robot', id: truck.id },
        source_mode: 'simulated',
        incident_id: command.incidentId,
        summary: `${truck.id} held on the approach lane.`,
        payload: { truckId: truck.id, controller: 'held', pose: { ...truck.pose } },
      });
      const what = reason === 'door_closed' ? `Door ${door.id} closed.` : `Obstruction on the Door ${door.id} approach.`;
      command.detail = `Stopped: ${what}`;
      const report = this.say(command, 'BLOCKED', `${what} Stopped on the approach lane.`);
      this.onBlocked({ truckId: truck.id, door: door.id, reason, seq: report.seq });
      return;
    }

    const dock = routeToDoor(truck.pose, command.door);
    if (!routeAnnounced) {
      this.world.emit({
        type: 'truck.route',
        actor: { kind: 'robot', id: truck.id },
        source_mode: 'simulated',
        incident_id: command.incidentId,
        request_id: command.requestId,
        summary: `${truck.id} backing into Door ${command.door}.`,
        payload: { truckId: truck.id, requestId: command.requestId, from: { ...truck.pose }, path: dock, speed: YARD.speed, reverseSpeed: YARD.reverseSpeed },
      });
    }
    truck.controller = 'moving';
    this.after(travelMs(truck.pose, dock), () => this.docked(command));
  }

  private docked(command: Command): void {
    const truck = this.truck(command.truckId);
    const door = this.door(command.door);
    truck.pose = { x: doorX(door.id), z: YARD.dockZ, heading: 0 };
    truck.controller = 'docked';
    this.world.emit({
      type: 'truck.state',
      actor: { kind: 'robot', id: truck.id },
      source_mode: 'simulated',
      incident_id: command.incidentId,
      summary: `${truck.id} docked at Door ${door.id}.`,
      payload: { truckId: truck.id, controller: 'docked', pose: { ...truck.pose } },
    });
    command.status = 'completed';
    this.say(command, 'ARRIVED', `Docked at Door ${door.id}.`);
    door.occupant = truck.id;
    door.reservedBy = null;
    this.doorChanged(door, truck, `Door ${door.id} occupied by ${truck.id}.`);
  }

  private leaveDoor(truck: Truck): void {
    const door = this.world.state.doors.find((d) => d.occupant === truck.id);
    if (!door) return;
    door.occupant = null;
    this.doorChanged(door, truck, `${truck.id} left Door ${door.id}.`);
  }

  /** A truck's message to Firefly on the channel. */
  private say(command: Command, type: MessageType, text: string) {
    return this.world.emit({
      type: 'radio',
      actor: { kind: 'robot', id: command.truckId },
      source_mode: 'simulated',
      incident_id: command.incidentId,
      request_id: command.requestId,
      summary: `${command.truckId} → Firefly ${type}: ${text}`,
      payload: { from: command.truckId, to: 'Firefly', type, text, requestId: command.requestId },
    });
  }

  private doorChanged(door: Door, truck: Truck, summary: string): void {
    this.world.emit({
      type: 'door.changed',
      actor: { kind: 'robot', id: truck.id },
      source_mode: 'simulated',
      summary,
      payload: { ...door },
    });
  }

  private truck(id: string): Truck {
    const truck = this.world.state.trucks.find((t) => t.id === id);
    if (!truck) throw new Error(`Unknown truck: ${id}`);
    return truck;
  }

  private door(id: number): Door {
    const door = this.world.state.doors.find((d) => d.id === id);
    if (!door) throw new Error(`Unknown door: ${id}`);
    return door;
  }

  private after(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }
}

// Shared contract between the server and the screens.
// Change it only when both of us agree, in its own small PR (see AGENTS.md).

/* ---------- yard layout (world units, metres-ish) ---------- */

export const YARD = {
  doors: 8,
  laneZ: -4, // approach lane centre line
  dockZ: -14.75, // truck centre when docked at a door
  parkZ: 9.5, // truck centre when parked
  wallZ: -20, // warehouse front wall
  speed: 7.5, // forward travel speed
  reverseSpeed: 3.4, // backing into a door or a parking slot
} as const;

/** Door 1–8 → x position. Doors 1–4 receiving, 5–8 shipping. */
export const doorX = (door: number) => -21 + (door - 1) * 6;
/** Parking slot 0–7 → x position. */
export const parkX = (slot: number) => -21 + slot * 6;
export const doorKind = (door: number): DoorKind => (door <= 4 ? 'receiving' : 'shipping');

/* ---------- world state ---------- */

export type DoorKind = 'receiving' | 'shipping';

export interface Door {
  id: number;
  kind: DoorKind;
  closed: boolean;
  obstruction: boolean;
  occupant: string | null; // truck id
  reservedBy: string | null; // job id
}

/** heading: radians; 0 means the cab faces +z (away from the warehouse). */
export interface Pose {
  x: number;
  z: number;
  heading: number;
}

export type ControllerState = 'idle' | 'moving' | 'held' | 'docked' | 'parked';

export interface Truck {
  id: string; // T-1 … T-8
  jobId: string;
  pose: Pose;
  controller: ControllerState;
}

export interface Job {
  id: string; // J-1 … J-8
  truckId: string;
  direction: 'in' | 'out';
  kind: DoorKind;
  assignedDoor: number | null;
  canSwitchDoor: boolean;
  routine: boolean; // background traffic vs story trucks
}

/** A controller-accepted move. The screen animates along `path`; it never invents one. */
export interface RouteStep {
  x: number;
  z: number;
  reverse?: boolean; // backing up (into a door or a parking slot)
}
export interface TruckRoute {
  truckId: string;
  requestId?: string;
  from: Pose;
  path: RouteStep[];
  speed: number;
  reverseSpeed: number;
}

export type WorkerKind = 'robot' | 'person' | 'agent';
export interface Worker {
  id: string; // T-2, sam, firefly-1 …
  kind: WorkerKind;
  name: string;
  canDo: string[];
  status: 'free' | 'busy' | 'off_shift' | 'out_of_service';
  equipment?: string; // F-3, F-4
  pos?: { x: number; z: number };
}

export interface Equipment {
  id: string; // F-3, F-4
  holder: string; // worker id
  outOfService: boolean;
}

export type IncidentKind = 'door_closed' | 'obstruction' | 'clearance';
export type IncidentStatus = 'queued' | 'working' | 'waiting' | 'needs_you' | 'held' | 'resolved';
export interface Incident {
  id: string; // R-2, R-5, C-1 …
  kind: IncidentKind;
  truckId: string | null;
  door: number;
  title: string;
  status: IncidentStatus;
  agentId: string | null;
  outcome?: string;
}

export interface Task {
  id: string;
  incidentId: string;
  door: number;
  worker: string | null;
  equipment: string | null;
  status: 'open' | 'offered' | 'accepted' | 'declined' | 'withdrawn' | 'closed';
  arrived: boolean;
  cleared: boolean;
  peopleClear: boolean;
}

export interface Correction {
  id: string;
  subject: string; // e.g. F-3
  fact: string;
  source: string; // maria
  createdAt: string;
  releaseCondition: string;
  active: boolean;
  interpretation: string; // "F-3 excluded until maintenance clears it."
}

export interface Approval {
  id: string;
  incidentId: string;
  kind: 'resume';
  status: 'pending' | 'approved';
}

export interface WorldSnapshot {
  seq: number;
  doors: Door[];
  trucks: Truck[];
  jobs: Job[];
  workers: Worker[];
  equipment: Equipment[];
  incidents: Incident[];
  tasks: Task[];
  corrections: Correction[];
  approvals: Approval[];
}

/* ---------- channel (radio log) ---------- */

export type MessageType =
  | 'BLOCKED'
  | 'HOLD'
  | 'GO_TO'
  | 'RESUME'
  | 'ACK'
  | 'ARRIVED'
  | 'TASK'
  | 'CANCEL'
  | 'ACCEPT'
  | 'DECLINE'
  | 'DONE'
  | 'CLEAR'
  | 'NOTE'
  | 'APPROVE';

export interface RadioMessage {
  from: string;
  to: string;
  type: MessageType;
  text: string;
  requestId?: string;
}

/* ---------- events ---------- */

export type SourceMode = 'real-model' | 'system' | 'simulated' | 'human';
export type ActorKind = 'agent' | 'robot' | 'person' | 'system';
export interface Actor {
  kind: ActorKind;
  id: string;
}

export interface EventPayloads {
  'world.reset': WorldSnapshot;
  'door.changed': Door;
  'truck.route': TruckRoute; // controller accepted a move
  'truck.state': { truckId: string; controller: ControllerState; pose: Pose };
  radio: RadioMessage;
  'incident.opened': Incident;
  'incident.updated': Incident;
  'incident.resolved': Incident;
  'tool.called': { tool: string; input: Record<string, unknown> };
  'tool.result': { tool: string; ok: boolean; output: Record<string, unknown> };
  'task.changed': Task;
  'correction.saved': Correction;
  'approval.changed': Approval;
  'worker.changed': Worker;
  'equipment.changed': Equipment;
}
export type EventType = keyof EventPayloads;

export interface FireflyEvent<T extends EventType = EventType> {
  seq: number; // global, monotonic; also the state version and the SSE id
  ts: string;
  type: T;
  actor: Actor;
  source_mode: SourceMode;
  incident_id?: string;
  job_id?: string;
  request_id?: string;
  caused_by?: number;
  summary: string; // the one line the UI shows
  payload: EventPayloads[T];
}

/** What callers pass to `emit`; the server adds seq and ts. */
export type EventInput<T extends EventType = EventType> = Omit<FireflyEvent<T>, 'seq' | 'ts'>;

/* SSE on GET /api/stream:
   - first message: event "snapshot", data WorldSnapshot, id = seq
   - then: event "event", data FireflyEvent, id = seq
   - reconnect with Last-Event-ID → missed events are replayed
   - GET /api/stream?replay=<fixture> streams a fixture on a fresh world (dev only) */

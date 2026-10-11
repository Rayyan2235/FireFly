import { YARD, doorKind, doorX, parkX } from '../contract.ts';
import type { Door, Equipment, Job, Truck, Worker, WorldSnapshot } from '../contract.ts';

const docked = (door: number) => ({ x: doorX(door), z: YARD.dockZ, heading: 0 });
const parked = (slot: number) => ({ x: parkX(slot), z: YARD.parkZ, heading: Math.PI });

/** Start of shift: the same world every time, so the demo scenario is repeatable. */
export function seedWorld(): WorldSnapshot {
  const doors: Door[] = Array.from({ length: YARD.doors }, (_, k) => ({
    id: k + 1,
    kind: doorKind(k + 1),
    closed: false,
    obstruction: false,
    occupant: null,
    reservedBy: null,
  }));

  const jobs: Job[] = [
    { id: 'J-1', truckId: 'T-1', direction: 'in', kind: 'receiving', assignedDoor: 1, canSwitchDoor: true, routine: true },
    { id: 'J-2', truckId: 'T-2', direction: 'in', kind: 'receiving', assignedDoor: 3, canSwitchDoor: true, routine: false },
    { id: 'J-3', truckId: 'T-3', direction: 'out', kind: 'shipping', assignedDoor: null, canSwitchDoor: true, routine: true },
    { id: 'J-4', truckId: 'T-4', direction: 'out', kind: 'shipping', assignedDoor: 5, canSwitchDoor: true, routine: true },
    { id: 'J-5', truckId: 'T-5', direction: 'out', kind: 'shipping', assignedDoor: 7, canSwitchDoor: false, routine: false },
    { id: 'J-6', truckId: 'T-6', direction: 'out', kind: 'shipping', assignedDoor: 8, canSwitchDoor: true, routine: true },
    { id: 'J-7', truckId: 'T-7', direction: 'in', kind: 'receiving', assignedDoor: null, canSwitchDoor: true, routine: true },
    { id: 'J-8', truckId: 'T-8', direction: 'out', kind: 'shipping', assignedDoor: null, canSwitchDoor: true, routine: true },
  ];

  const trucks: Truck[] = [
    { id: 'T-1', jobId: 'J-1', pose: docked(1), controller: 'docked' },
    { id: 'T-2', jobId: 'J-2', pose: parked(2), controller: 'parked' },
    { id: 'T-3', jobId: 'J-3', pose: parked(0), controller: 'parked' },
    { id: 'T-4', jobId: 'J-4', pose: docked(5), controller: 'docked' },
    { id: 'T-5', jobId: 'J-5', pose: parked(6), controller: 'parked' },
    { id: 'T-6', jobId: 'J-6', pose: docked(8), controller: 'docked' },
    { id: 'T-7', jobId: 'J-7', pose: parked(1), controller: 'parked' },
    { id: 'T-8', jobId: 'J-8', pose: parked(7), controller: 'parked' },
  ];
  for (const t of trucks) if (t.controller === 'docked') doors[Math.round((t.pose.x + 21) / 6)]!.occupant = t.id;

  const workers: Worker[] = [
    ...trucks.map((t): Worker => ({ id: t.id, kind: 'robot', name: t.id, canDo: ['tow_trailer'], status: 'free' })),
    { id: 'maria', kind: 'person', name: 'Maria', canDo: ['authorize_resume', 'correct'], status: 'free', pos: { x: -26.5, z: -7 } },
    { id: 'sam', kind: 'person', name: 'Sam', canDo: ['clear_obstruction'], status: 'free', equipment: 'F-3', pos: { x: 25.5, z: -8.5 } },
    { id: 'noor', kind: 'person', name: 'Noor', canDo: ['clear_obstruction'], status: 'free', equipment: 'F-4', pos: { x: 28, z: -6.5 } },
    { id: 'firefly-1', kind: 'agent', name: 'Firefly-1', canDo: ['coordinate'], status: 'free' },
    { id: 'firefly-2', kind: 'agent', name: 'Firefly-2', canDo: ['coordinate'], status: 'free' },
  ];

  const equipment: Equipment[] = [
    { id: 'F-3', holder: 'sam', outOfService: false },
    { id: 'F-4', holder: 'noor', outOfService: false },
  ];

  return { seq: 0, doors, trucks, jobs, workers, equipment, incidents: [], tasks: [], corrections: [], approvals: [] };
}

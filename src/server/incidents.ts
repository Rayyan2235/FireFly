import type { Incident } from '../contract.ts';
import type { BlockedReport } from './simulator.ts';
import type { World } from './world.ts';

/**
 * Firefly's intake. A truck's BLOCKED report opens an incident; a truck that
 * reports again while its incident is still open joins that one.
 * Incidents are only ever born from a robot's report, never from a scenario.
 */
export function openIncident(world: World, report: BlockedReport): Incident {
  const { incidents, trucks } = world.state;
  const open = incidents.find((i) => i.truckId === report.truckId && i.status !== 'resolved');
  if (open) return open;

  // The obstruction is already being cleared: the truck joins that incident instead of opening a duplicate.
  const clearance = incidents.find((i) => i.kind === 'clearance' && i.door === report.door && i.status !== 'resolved');
  if (clearance && report.reason === 'obstruction') {
    clearance.kind = 'obstruction';
    clearance.truckId = report.truckId;
    clearance.title = `${report.truckId} · Door ${report.door} approach blocked`;
    world.emit({
      type: 'incident.updated',
      actor: { kind: 'system', id: 'firefly' },
      source_mode: 'system',
      incident_id: clearance.id,
      caused_by: report.seq,
      summary: `${report.truckId} is now held behind the obstruction and joined ${clearance.id}.`,
      payload: { ...clearance },
    });
    return clearance;
  }

  const base = report.truckId.replace('T-', 'R-'); // T-2 → R-2
  const earlier = incidents.filter((i) => i.truckId === report.truckId).length;
  const what = report.reason === 'door_closed' ? `Door ${report.door} closed` : `Door ${report.door} approach blocked`;
  const incident: Incident = {
    id: earlier ? `${base}.${earlier + 1}` : base,
    kind: report.reason,
    truckId: report.truckId,
    door: report.door,
    title: `${report.truckId} · ${what}`,
    status: 'queued', // waits here until an agent claims it
    agentId: null,
  };
  incidents.push(incident);
  world.emit({
    type: 'incident.opened',
    actor: { kind: 'system', id: 'firefly' },
    source_mode: 'system',
    incident_id: incident.id,
    job_id: trucks.find((t) => t.id === report.truckId)?.jobId,
    caused_by: report.seq,
    summary: `Incident ${incident.id} opened: ${incident.title}.`,
    payload: { ...incident },
  });
  return incident;
}

/**
 * An obstruction somebody reported with no truck behind it yet. The hazard still
 * has to be cleared, so it gets an incident of its own. Returns null if that door
 * already has an open incident for an obstruction.
 */
export function openClearance(world: World, door: number, causedBy: number): Incident | null {
  const { incidents } = world.state;
  if (incidents.some((i) => i.door === door && i.status !== 'resolved' && i.kind !== 'door_closed')) return null;
  const incident: Incident = {
    id: `C-${incidents.filter((i) => i.id.startsWith('C-')).length + 1}`,
    kind: 'clearance',
    truckId: null,
    door,
    title: `Obstruction on the Door ${door} approach`,
    status: 'queued',
    agentId: null,
  };
  incidents.push(incident);
  world.emit({
    type: 'incident.opened',
    actor: { kind: 'system', id: 'firefly' },
    source_mode: 'system',
    incident_id: incident.id,
    caused_by: causedBy,
    summary: `Incident ${incident.id} opened: ${incident.title}.`,
    payload: { ...incident },
  });
  return incident;
}

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

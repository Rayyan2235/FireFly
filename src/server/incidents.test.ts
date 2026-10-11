import { describe, expect, it } from 'vitest';
import { openIncident } from './incidents.ts';
import { seedWorld } from './seed.ts';
import { World } from './world.ts';

const report = { truckId: 'T-2', door: 3, reason: 'door_closed', seq: 7 } as const;

describe('openIncident', () => {
  it('opens a queued incident traced back to the BLOCKED report', () => {
    const world = new World(seedWorld());
    const incident = openIncident(world, report);
    expect(incident).toMatchObject({ id: 'R-2', kind: 'door_closed', truckId: 'T-2', door: 3, status: 'queued', agentId: null });
    expect(world.since(0)).toMatchObject([{ type: 'incident.opened', incident_id: 'R-2', job_id: 'J-2', caused_by: 7 }]);
  });

  it('does not open a second incident while the first is still open', () => {
    const world = new World(seedWorld());
    const first = openIncident(world, report);
    expect(openIncident(world, { ...report, seq: 12 })).toBe(first);
    expect(world.state.incidents).toHaveLength(1);
  });

  it('gives a later incident for the same truck its own id', () => {
    const world = new World(seedWorld());
    openIncident(world, report).status = 'resolved';
    expect(openIncident(world, { ...report, seq: 30 }).id).toBe('R-2.2');
  });
});

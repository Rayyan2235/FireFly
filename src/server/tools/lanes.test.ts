import { describe, expect, it } from 'vitest';
import { JOB_LANES } from '../lanes.ts';
import { seedWorld } from '../seed.ts';
import { World } from '../world.ts';
import { runTool } from './index.ts';
import { laneResult } from './lanes.ts';
import type { ToolContext } from './types.ts';

const ctx = (lanes?: ToolContext['lanes']) => ({ world: new World(seedWorld()), incidentId: 'R-2', agentId: 'firefly-1', lanes }) as unknown as ToolContext;
const stats = { trips: 121, median_actual_min: 61, p90_actual_min: 97.5, mean_delay_factor: 2.4137931034482758, share_over_1_5x_planned: 0.8512396694214877 };

describe('get_lane_history', () => {
  it('gives every demo job a lane', () => {
    expect(seedWorld().jobs.every((j) => JOB_LANES[j.id])).toBe(true);
  });

  it('returns the numbers exactly as computed, and says where they come from', () => {
    const result = laneResult('J-2', JOB_LANES['J-2']!, stats);
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({ ...stats, job_id: 'J-2', source: 'Delhivery public trucking dataset (India), 121 trips on this lane', note: 'public data, not this yard' });
    expect(result.summary).toContain('public data, not this yard');
  });

  it('fails plainly when there are no trips, and never makes up a number', () => {
    for (const none of [null, { ...stats, trips: 0 }]) {
      const result = laneResult('J-2', JOB_LANES['J-2']!, none);
      expect(result).toMatchObject({ ok: false, output: { conflict: 'no_trips' } });
      expect(result.output).not.toHaveProperty('median_actual_min');
    }
  });

  it('validates the job and reports why it is unavailable', async () => {
    expect(await runTool(ctx(), 'get_lane_history', { job_id: 'J-99' })).toMatchObject({ ok: false, output: { conflict: 'unknown_job' } });
    expect(await runTool(ctx(), 'get_lane_history', { job_id: 7 })).toMatchObject({ ok: false, output: { conflict: 'bad_input' } });
    expect(await runTool(ctx(), 'get_lane_history', { job_id: 'J-2' })).toMatchObject({ ok: false, output: { conflict: 'not_connected' } });
    const down = ctx(async () => {
      throw new Error('server selection timed out');
    });
    expect(await runTool(down, 'get_lane_history', { job_id: 'J-2' })).toMatchObject({ ok: false, output: { conflict: 'mongo_unreachable' } });
    expect(await runTool(ctx(async () => stats), 'get_lane_history', { job_id: 'J-2' })).toMatchObject({ ok: true, output: { trips: 121 } });
  });
});

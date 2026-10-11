import { JOB_LANES } from '../lanes.ts';
import type { Lane, LaneStats } from '../lanes.ts';
import { fail, ok, schema, text } from './types.ts';
import type { Tool, ToolResult } from './types.ts';

/** Turns the aggregation's row into the tool result. The numbers pass through exactly as computed. */
export function laneResult(jobId: string, lane: Lane, stats: LaneStats | null): ToolResult {
  if (!stats || !stats.trips) return fail('no_trips', `No recorded trips on the lane for ${jobId}. Has the dataset been imported?`, { job_id: jobId, lane });
  return ok(`${stats.trips} recorded trips on this lane: median ${stats.median_actual_min} min, p90 ${stats.p90_actual_min} min. Computed from recorded trips; public data, not this yard.`, {
    job_id: jobId,
    lane,
    trips: stats.trips,
    median_actual_min: stats.median_actual_min,
    p90_actual_min: stats.p90_actual_min,
    mean_delay_factor: stats.mean_delay_factor,
    share_over_1_5x_planned: stats.share_over_1_5x_planned,
    source: `Delhivery public trucking dataset (India), ${stats.trips} trips on this lane`,
    note: 'public data, not this yard',
  });
}

export const getLaneHistory: Tool = {
  name: 'get_lane_history',
  kind: 'read',
  description:
    'Recorded trip times on the lane a job runs on, computed in MongoDB from a public trucking dataset (Delhivery, India): trip count, median and p90 actual minutes, mean actual-to-planned ratio, and the share of trips over 1.5 times planned. Public data, not this yard. It may help you judge how urgent a held truck is or whether a lane usually runs late.',
  input_schema: schema({ job_id: { type: 'string', description: 'Job id, e.g. J-2.' } }),
  async run({ world, lanes }, input) {
    const jobId = text(input, 'job_id');
    if (!world.state.jobs.some((j) => j.id === jobId)) return fail('unknown_job', 'No such job.');
    const lane = JOB_LANES[jobId];
    if (!lane) return fail('no_lane', `${jobId} has no lane on record.`);
    if (!lanes) return fail('not_connected', 'Lane history is unavailable: MongoDB is not connected (MONGODB_URI is not set).');
    try {
      return laneResult(jobId, lane, await lanes(lane));
    } catch (err) {
      return fail('mongo_unreachable', `Lane history is unavailable: MongoDB could not be reached (${err instanceof Error ? err.message : String(err)}).`);
    }
  },
};

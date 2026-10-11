/** A real trucking lane: where a trailer came from, where it goes, and how it is hauled. */
export interface Lane {
  source: string;
  destination: string;
  route_type: string;
}

/**
 * Each demo job runs on a real lane from the Delhivery public trucking dataset (India).
 * These are that dataset's eight busiest lanes, picked once with the aggregation at the end
 * of scripts/import-delhivery.ts ($group by source, destination and route_type, sorted by trips).
 * Public data, not this yard. Server-side only: the shared contract does not know about lanes.
 */
export const JOB_LANES: Record<string, Lane> = {
  'J-1': { source: 'Bangalore_Nelmngla_H (Karnataka)', destination: 'Bengaluru_KGAirprt_HB (Karnataka)', route_type: 'Carting' },
  'J-2': { source: 'Bengaluru_Bomsndra_HB (Karnataka)', destination: 'Bengaluru_KGAirprt_HB (Karnataka)', route_type: 'Carting' },
  'J-3': { source: 'Bengaluru_KGAirprt_HB (Karnataka)', destination: 'Bangalore_Nelmngla_H (Karnataka)', route_type: 'Carting' },
  'J-4': { source: 'Bhiwandi_Mankoli_HB (Maharashtra)', destination: 'Mumbai Hub (Maharashtra)', route_type: 'Carting' },
  'J-5': { source: 'Mumbai_Chndivli_PC (Maharashtra)', destination: 'Bhiwandi_Mankoli_HB (Maharashtra)', route_type: 'Carting' },
  'J-6': { source: 'Gurgaon_Bilaspur_HB (Haryana)', destination: 'Sonipat_Kundli_H (Haryana)', route_type: 'Carting' },
  'J-7': { source: 'Bangalore_Nelmngla_H (Karnataka)', destination: 'Bengaluru_Bomsndra_HB (Karnataka)', route_type: 'Carting' },
  'J-8': { source: 'Bengaluru_KGAirprt_HB (Karnataka)', destination: 'Bengaluru_Bomsndra_HB (Karnataka)', route_type: 'Carting' },
};

/** What the lane aggregation returns: every number computed inside MongoDB from recorded trips. */
export interface LaneStats {
  trips: number;
  median_actual_min: number;
  p90_actual_min: number;
  mean_delay_factor: number;
  share_over_1_5x_planned: number;
}

/** The one aggregation behind get_lane_history. Approximate median and p90, as MongoDB computes them. */
export function lanePipeline(lane: Lane): object[] {
  return [
    { $match: { source: lane.source, destination: lane.destination, route_type: lane.route_type } },
    {
      $group: {
        _id: null,
        trips: { $sum: 1 },
        median_actual_min: { $median: { input: '$actual_min', method: 'approximate' } },
        p90: { $percentile: { input: '$actual_min', p: [0.9], method: 'approximate' } },
        mean_delay_factor: { $avg: { $divide: ['$actual_min', '$planned_min'] } },
        late: { $sum: { $cond: [{ $gt: ['$actual_min', { $multiply: [1.5, '$planned_min'] }] }, 1, 0] } },
      },
    },
    { $project: { _id: 0, trips: 1, median_actual_min: 1, p90_actual_min: { $first: '$p90' }, mean_delay_factor: 1, share_over_1_5x_planned: { $divide: ['$late', '$trips'] } } },
  ];
}

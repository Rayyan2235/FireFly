// Prints one real get_lane_history result, straight from MongoDB. Run: pnpm tsx scripts/lane-sample.ts J-2
import { FlightRecorder } from '../src/server/recorder.ts';
import { JOB_LANES } from '../src/server/lanes.ts';
import { laneResult } from '../src/server/tools/lanes.ts';

const jobId = process.argv[2] ?? 'J-2';
if (!process.env.MONGODB_URI) process.loadEnvFile?.('.env');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (put it in .env).');
const lane = JOB_LANES[jobId];
if (!lane) throw new Error(`No lane for ${jobId}.`);

const recorder = await FlightRecorder.connect(process.env.MONGODB_URI);
console.log(JSON.stringify(laneResult(jobId, lane, await recorder.laneStats(lane)), null, 2));
await recorder.close();

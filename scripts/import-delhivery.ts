// Imports the public Delhivery trucking dataset (Kaggle: santanukundu/delhivery-dataset) into MongoDB
// as one `lane_trips` document per trip. Run: pnpm tsx scripts/import-delhivery.ts data/delhivery.csv
// The CSV is never committed (data/ is git-ignored).
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';

interface LaneTrip {
  trip_uuid: string;
  route_type: string;
  source: string;
  destination: string;
  actual_min: number;
  planned_min: number;
  start: Date;
  end: Date;
}

/** Splits one CSV line, honouring double-quoted fields. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') (out.push(cell), (cell = ''));
    else cell += ch;
  }
  out.push(cell);
  return out;
}

const file = process.argv[2];
if (!file) throw new Error('Usage: pnpm tsx scripts/import-delhivery.ts data/delhivery.csv');
if (!process.env.MONGODB_URI) process.loadEnvFile?.('.env');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set (put it in .env).');

// The file has several rows per trip (segments): keep the row with the largest actual_time.
const trips = new Map<string, LaneTrip>();
let header: string[] | null = null;
let rows = 0;
for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const row = cells(line);
  if (!header) {
    header = row;
    for (const need of ['trip_uuid', 'route_type', 'source_name', 'destination_name', 'od_start_time', 'od_end_time', 'actual_time', 'osrm_time']) {
      if (!header.includes(need)) throw new Error(`Column "${need}" is not in the CSV header.`);
    }
    continue;
  }
  rows++;
  const get = (name: string) => row[header!.indexOf(name)] ?? '';
  const actual = Number(get('actual_time'));
  const planned = Number(get('osrm_time'));
  const id = get('trip_uuid');
  if (!id || !get('source_name') || !get('destination_name') || !(actual > 0) || !(planned > 0)) continue;
  const kept = trips.get(id);
  if (kept && kept.actual_min >= actual) continue;
  trips.set(id, {
    trip_uuid: id,
    route_type: get('route_type'),
    source: get('source_name'),
    destination: get('destination_name'),
    actual_min: actual,
    planned_min: planned,
    start: new Date(get('od_start_time').replace(' ', 'T') + 'Z'),
    end: new Date(get('od_end_time').replace(' ', 'T') + 'Z'),
  });
}

const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect();
const lanes = client.db().collection<LaneTrip>('lane_trips');
await lanes.createIndex({ trip_uuid: 1 }, { unique: true });
await lanes.createIndex({ source: 1, destination: 1, route_type: 1 });
const all = [...trips.values()];
for (let i = 0; i < all.length; i += 1000) {
  await lanes.bulkWrite(
    all.slice(i, i + 1000).map((trip) => ({ updateOne: { filter: { trip_uuid: trip.trip_uuid }, update: { $set: trip }, upsert: true } })),
    { ordered: false },
  );
}
console.log(`Read ${rows} rows. Stored ${await lanes.countDocuments()} trips in lane_trips.`);

// The busiest lanes, used once to pick real lanes for the demo jobs (see src/server/lanes.ts).
const busiest = await lanes
  .aggregate([{ $group: { _id: { source: '$source', destination: '$destination', route_type: '$route_type' }, trips: { $sum: 1 } } }, { $sort: { trips: -1 } }, { $limit: 12 }])
  .toArray();
for (const lane of busiest) console.log(`${String(lane.trips).padStart(5)}  ${lane._id.route_type.padEnd(8)} ${lane._id.source} -> ${lane._id.destination}`);
await client.close();

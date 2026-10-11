import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EventInput } from '../contract.ts';
import type { World } from './world.ts';

/**
 * Fixtures are recorded event lists for building screens before the real
 * server logic exists. Dev only: never shown in the video.
 */
export interface Fixture {
  name: string;
  note: string;
  events: Array<{ at: number } & EventInput>;
}

const FIXTURE_DIR = resolve(import.meta.dirname, '../../fixtures');

export async function loadFixture(name: string): Promise<Fixture> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad fixture name: ${name}`);
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, `${name}.json`), 'utf8')) as Fixture;
}

/** Emits each fixture event on `world` at its `at` offset (ms). Returns a cancel function. */
export function playFixture(world: World, fixture: Fixture): () => void {
  const timers = fixture.events.map(({ at, ...event }) => setTimeout(() => world.emit(event), at));
  return () => timers.forEach(clearTimeout);
}

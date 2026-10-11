import { describe, expect, it } from 'vitest';
import { seedWorld } from './seed.ts';
import { World } from './world.ts';

const radio = (text: string) =>
  ({
    type: 'radio',
    actor: { kind: 'robot', id: 'T-2' },
    source_mode: 'simulated',
    summary: text,
    payload: { from: 'T-2', to: 'Firefly', type: 'BLOCKED', text },
  }) as const;

describe('World', () => {
  it('numbers events in order and keeps seq on the state', () => {
    const w = new World(seedWorld());
    const a = w.emit(radio('one'));
    const b = w.emit(radio('two'));
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(w.state.seq).toBe(2);
  });

  it('replays only the events a reconnecting client missed', () => {
    const w = new World(seedWorld());
    w.emit(radio('one'));
    w.emit(radio('two'));
    w.emit(radio('three'));
    expect(w.since(1).map((e) => e.summary)).toEqual(['two', 'three']);
  });

  it('tells subscribers about new events until they unsubscribe', () => {
    const w = new World(seedWorld());
    const seen: string[] = [];
    const off = w.subscribe((e) => seen.push(e.summary));
    w.emit(radio('one'));
    off();
    w.emit(radio('two'));
    expect(seen).toEqual(['one']);
  });

  it('starts every shift from the same yard', () => {
    const w = seedWorld();
    expect(w.doors.map((d) => d.occupant)).toEqual(['T-1', null, null, null, 'T-4', null, null, 'T-6']);
    expect(w.trucks.find((t) => t.id === 'T-2')?.controller).toBe('parked');
  });
});

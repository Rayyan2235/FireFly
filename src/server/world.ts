import type { EventInput, EventType, FireflyEvent, WorldSnapshot } from '../contract.ts';

type Listener = (event: FireflyEvent) => void;

/**
 * The authoritative yard: current state plus an append-only event log.
 * Mutations change `state` synchronously, then `emit` records what happened.
 */
export class World {
  state: WorldSnapshot;
  private readonly log: FireflyEvent[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(initial: WorldSnapshot) {
    this.state = initial;
  }

  emit<T extends EventType>(input: EventInput<T>): FireflyEvent<T> {
    const event = { ...input, seq: ++this.state.seq, ts: new Date().toISOString() } as FireflyEvent<T>;
    this.log.push(event as FireflyEvent);
    for (const listener of this.listeners) listener(event as FireflyEvent);
    return event;
  }

  /** Events after `seq`, for reconnecting clients. */
  since(seq: number): FireflyEvent[] {
    return this.log.filter((e) => e.seq > seq);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): WorldSnapshot {
    return structuredClone(this.state);
  }
}

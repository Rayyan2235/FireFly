import { useEffect, useReducer } from 'react';
import type { FireflyEvent, TruckRoute, WorldSnapshot } from '../contract.ts';

export interface ActiveRoute {
  route: TruckRoute;
  startedAt: number; // performance.now() when the route event arrived
}

export interface StreamState {
  connected: boolean;
  world: WorldSnapshot | null;
  events: FireflyEvent[];
  routes: Record<string, ActiveRoute>;
}

type Action =
  | { kind: 'open' }
  | { kind: 'closed' }
  | { kind: 'snapshot'; world: WorldSnapshot }
  | { kind: 'event'; event: FireflyEvent; at: number };

const initial: StreamState = { connected: false, world: null, events: [], routes: {} };

function upsert<T extends { id: string | number }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  return i === -1 ? [...list, item] : list.map((x, k) => (k === i ? item : x));
}

/** Applies one event to the local copy of the world. The server stays authoritative. */
function apply(state: StreamState, e: FireflyEvent, at: number): StreamState {
  const events = [...state.events, e].slice(-500);
  if (!state.world) return { ...state, events };
  const w = { ...state.world, seq: e.seq };
  let routes = state.routes;
  switch (e.type) {
    case 'world.reset':
      return { ...state, world: e.payload as WorldSnapshot, events, routes: {} };
    case 'door.changed': {
      const door = e.payload as FireflyEvent<'door.changed'>['payload'];
      w.doors = upsert(w.doors, door);
      break;
    }
    case 'truck.route': {
      const route = e.payload as TruckRoute;
      routes = { ...routes, [route.truckId]: { route, startedAt: at } };
      w.trucks = w.trucks.map((t) => (t.id === route.truckId ? { ...t, controller: 'moving' } : t));
      break;
    }
    case 'truck.state': {
      const s = e.payload as FireflyEvent<'truck.state'>['payload'];
      w.trucks = w.trucks.map((t) => (t.id === s.truckId ? { ...t, pose: s.pose, controller: s.controller } : t));
      const { [s.truckId]: _done, ...rest } = routes;
      routes = rest;
      break;
    }
    case 'incident.opened':
    case 'incident.updated':
    case 'incident.resolved':
      w.incidents = upsert(w.incidents, e.payload as FireflyEvent<'incident.opened'>['payload']);
      break;
    case 'task.changed':
      w.tasks = upsert(w.tasks, e.payload as FireflyEvent<'task.changed'>['payload']);
      break;
    case 'correction.saved':
      w.corrections = upsert(w.corrections, e.payload as FireflyEvent<'correction.saved'>['payload']);
      break;
    case 'approval.changed':
      w.approvals = upsert(w.approvals, e.payload as FireflyEvent<'approval.changed'>['payload']);
      break;
    case 'worker.changed':
      w.workers = upsert(w.workers, e.payload as FireflyEvent<'worker.changed'>['payload']);
      break;
  }
  return { ...state, world: w, events, routes };
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.kind) {
    case 'open':
      return { ...state, connected: true };
    case 'closed':
      return { ...state, connected: false };
    case 'snapshot':
      return { ...state, world: action.world, routes: {} };
    case 'event':
      return apply(state, action.event, action.at);
  }
}

/** Subscribes to the server's event stream. `?replay=demo-r2` in the page URL plays a dev fixture instead. */
export function useStream(): StreamState {
  const [state, dispatch] = useReducer(reducer, initial);
  useEffect(() => {
    const replay = new URLSearchParams(location.search).get('replay');
    const es = new EventSource(replay ? `/api/stream?replay=${encodeURIComponent(replay)}` : '/api/stream');
    es.onopen = () => dispatch({ kind: 'open' });
    es.onerror = () => dispatch({ kind: 'closed' });
    es.addEventListener('snapshot', (m) => dispatch({ kind: 'snapshot', world: JSON.parse((m as MessageEvent).data) }));
    es.addEventListener('event', (m) =>
      dispatch({ kind: 'event', event: JSON.parse((m as MessageEvent).data), at: performance.now() }),
    );
    return () => es.close();
  }, []);
  return state;
}

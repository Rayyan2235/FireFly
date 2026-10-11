import { expect, it } from 'vitest';
import type { Task } from '../../contract.ts';
import { newestWorkerOffer, offerKey } from './workerOffers.ts';
const task: Task = { id: 'K-1', incidentId: 'R-5', door: 7, worker: 'sam', equipment: 'F-3', status: 'offered', arrived: false, cleared: false, peopleClear: false };
it('opens for an actual offer or an accepted task on initial load', () => {
  expect(newestWorkerOffer([task], new Set())).toEqual(task);
  expect(newestWorkerOffer([{ ...task, status: 'accepted' }], new Set())?.worker).toBe('sam');
});
it('does not reopen a dismissed phone as the same task progresses', () => {
  expect(newestWorkerOffer([{ ...task, status: 'accepted', arrived: true }], new Set([offerKey(task)]))).toBeUndefined();
});
it('opens the reassigned worker and excludes closed or withdrawn offers', () => {
  const reassigned = { ...task, id: 'K-2', worker: 'noor' };
  expect(newestWorkerOffer([{ ...task, status: 'withdrawn' }, reassigned], new Set([offerKey(task)]))).toEqual(reassigned);
  expect(newestWorkerOffer([{ ...task, status: 'closed' }], new Set())).toBeUndefined();
});

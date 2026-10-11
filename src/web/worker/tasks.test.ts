import { expect, it } from 'vitest';
import type { Task } from '../../contract.ts';
import { nextReport } from './tasks.ts';
const task: Task = { id: 'task-1', incidentId: 'R-5', door: 7, worker: 'noor', equipment: 'F-4', status: 'accepted', arrived: false, cleared: false, peopleClear: false };
it('offers reports in order based on observed task flags', () => {
  expect(nextReport(task)).toBe('arrived');
  expect(nextReport({ ...task, arrived: true })).toBe('cleared');
  expect(nextReport({ ...task, arrived: true, cleared: true })).toBe('people_clear');
  expect(nextReport({ ...task, arrived: true, cleared: true, peopleClear: true, status: 'closed' })).toBeNull();
});
it('never offers report actions on a withdrawn or unaccepted task', () => {
  for (const status of ['offered', 'withdrawn', 'declined'] as const) expect(nextReport({ ...task, status })).toBeNull();
});

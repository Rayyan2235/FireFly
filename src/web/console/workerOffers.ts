import type { Task } from '../../contract.ts';
export const offerKey = (task: Task) => `${task.id}/${task.worker}`;
export function newestWorkerOffer(tasks: Task[], seen: Set<string>): Task | undefined {
  return tasks.findLast(task => (task.status === 'offered' || task.status === 'accepted') && (task.worker === 'sam' || task.worker === 'noor') && !seen.has(offerKey(task)));
}

import type { FireflyEvent, Task } from '../../contract.ts';
export function nextReport(task: Task): 'arrived' | 'cleared' | 'people_clear' | null {
  if (task.status !== 'accepted') return null;
  return !task.arrived ? 'arrived' : !task.cleared ? 'cleared' : !task.peopleClear ? 'people_clear' : null;
}
export function taskSummary(events: FireflyEvent[], id: string): string | undefined {
  const shift = events.slice(events.findLastIndex(e => e.type === 'world.reset') + 1);
  return shift.findLast(e => e.type === 'task.changed' && (e.payload as Task).id === id)?.summary;
}

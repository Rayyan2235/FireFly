import { useState } from 'react';
import { Check, Circle, HardHat } from '@phosphor-icons/react';
import type { Task } from '../../contract.ts';
import type { StreamState } from '../useStream.ts';
import { displayWorkerNames } from '../workerNames.ts';
import { postAction } from '../api.ts';
import { Button } from '../ui/Button.tsx';
import { FireflyMark } from '../console/bits.tsx';
import { nextReport, taskSummary } from './tasks.ts';

export function WorkerPage({ stream, initialWorker = 'noor', initialTask = null }: { stream: StreamState; initialWorker?: 'sam' | 'noor'; initialTask?: string | null }) {
  const { world, events, connected } = stream;
  const [worker, setWorker] = useState<'sam' | 'noor'>(initialWorker);
  const [picked, setPicked] = useState<string | null>(initialTask);
  const me = world?.workers.find(w => w.id === worker);
  const tasks = world?.tasks.filter(t => t.worker === worker && t.status !== 'closed') ?? [];
  const selected = tasks.find(t => t.id === picked) ?? tasks.find(t => t.status === 'accepted' || t.status === 'offered') ?? tasks.at(-1);
  const completed = world?.tasks.findLast(t => t.worker === worker && t.status === 'closed');
  return <main className="worker-page">
    <header className="worker-header"><FireflyMark width={34} /><span>Firefly <small>North Yard · Worker</small></span><span className="worker-live">{connected ? 'Live' : 'Connecting…'}</span></header>
    <nav className="worker-switch glass-nav" aria-label="Worker">
      {(['sam', 'noor'] as const).map(id => <button key={id} aria-pressed={worker === id} onClick={() => { setWorker(id); setPicked(null); }}>{displayWorkerNames(id)}</button>)}
    </nav>
    <div className="worker-identity"><HardHat size={20} /><span>{displayWorkerNames(me?.name ?? worker)}<small>{me ? `${me.equipment ?? 'No equipment'} · ${me.status.replaceAll('_', ' ')}` : 'Waiting for the yard snapshot…'}</small></span></div>
    {!connected && <p className="r5-message" role="status">Reconnecting to the yard. Actions are paused.</p>}
    {tasks.length > 1 && <nav className="worker-task-list" aria-label="Your open tasks">{tasks.map(t => <button key={t.id} aria-pressed={t.id === selected?.id} onClick={() => setPicked(t.id)}>Door {t.door}<small>{t.status}</small></button>)}</nav>}
    {selected ? <TaskCard key={`${worker}/${selected.id}`} task={selected} worker={worker} connected={connected} summary={displayWorkerNames(taskSummary(events, selected.id) ?? '') || undefined} /> : <section className="worker-card glass"><p className="worker-eyebrow">Your work</p><h1>{world ? 'No open tasks' : 'Connecting to the yard'}</h1><p>{world ? 'New offers will appear here as they arrive.' : 'Waiting for the server’s snapshot.'}</p></section>}
    {completed && <p className="r5-message" role="status"><Check size={16} />{displayWorkerNames(taskSummary(events, completed.id) ?? `Door ${completed.door} · Task closed`)}</p>}
    <footer>Twin mode · simulated trucks<br />Task progress comes from the yard’s work record.</footer>
  </main>;
}
function TaskCard({ task, worker, connected, summary }: { task: Task; worker: string; connected: boolean; summary?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextReport(task);
  const steps = [{ what: 'arrived', label: `I’m at Door ${task.door}`, done: task.arrived }, { what: 'cleared', label: 'Pallet cleared', done: task.cleared }, { what: 'people_clear', label: 'People clear', done: task.peopleClear }] as const;
  async function act(action: 'accept' | 'decline' | 'report', what?: string) {
    if (pending) return;
    setPending(true); setError(null);
    try { await postAction(`/api/tasks/${encodeURIComponent(task.id)}/${action}`, { worker, ...(what ? { what } : {}) }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to reach the server.'); }
    finally { setPending(false); }
  }
  return <section className="worker-card glass">
    <div className="worker-card-top"><span className="worker-eyebrow">{task.incidentId} · {task.id}</span><span className={`chip ${task.status === 'offered' ? 'chip--attn' : ''}`}>{task.status}</span></div>
    <h1>{task.status === 'withdrawn' ? 'Offer withdrawn' : `Door ${task.door}`}</h1>
    <p>{task.status === 'withdrawn' ? (summary ?? 'Waiting for the withdrawal reason from the work record.') : task.status === 'declined' ? 'Offer declined. Waiting for another assignment.' : `Clear the approach${task.equipment ? ` · ${task.equipment}` : ''}`}</p>
    {task.status === 'accepted' && <ol className="worker-steps">{steps.map((step, i) => <li key={step.what} aria-current={next === step.what ? 'step' : undefined} className={step.done ? 'is-done' : ''}>{step.done ? <Check size={20} /> : <Circle size={20} />}<span>{step.label}<small>{step.done ? 'Reported' : next === step.what ? 'Next step' : `Step ${i + 1}`}</small></span></li>)}</ol>}
    {error && <p className="r5-error" role="alert">{error}</p>}
    {pending && <p className="r5-message" role="status">Sending report. Waiting for server events.</p>}
    {task.status === 'offered' && <div className="worker-actions"><Button variant="solid" disabled={pending || !connected} onClick={() => void act('accept')}>Accept</Button><Button variant="quiet" disabled={pending || !connected} onClick={() => void act('decline')}>Decline</Button></div>}
    {next && <div className="worker-actions"><Button variant="solid" disabled={pending || !connected} onClick={() => void act('report', next)}>{steps.find(s => s.what === next)?.label}</Button></div>}
  </section>;
}

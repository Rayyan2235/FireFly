import { useEffect, useRef, useState } from 'react';
import type { FireflyEvent } from '../../contract.ts';
import { postAction } from '../api.ts';
import { Button } from '../ui/Button.tsx';

type Kind = 'close_door' | 'drop_pallet' | 'forklift_down' | 'worker_home';
export function ProblemControl({ events, connected }: { events: FireflyEvent[]; connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('drop_pallet');
  const [door, setDoor] = useState('7');
  const [equipment, setEquipment] = useState('F-3');
  const [worker, setWorker] = useState('sam');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<{ since: number; type: string; id: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function dismiss(e: PointerEvent) { if (!root.current?.contains(e.target as Node)) setOpen(false); }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } }
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  const observed = request && events.find(e => e.seq > request.since && e.type === request.type && String((e.payload as { id?: string | number }).id) === request.id);
  async function cause() {
    if (pending) return;
    setPending(true); setError(null);
    setRequest({ since: events.at(-1)?.seq ?? 0, type: kind === 'forklift_down' ? 'equipment.changed' : kind === 'worker_home' ? 'worker.changed' : 'door.changed', id: kind === 'forklift_down' ? equipment : kind === 'worker_home' ? worker : door });
    try { await postAction('/api/problems', kind === 'forklift_down' ? { kind, equipment } : kind === 'worker_home' ? { kind, worker } : { kind, door: Number(door) }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to reach the server.'); setRequest(null); }
    finally { setPending(false); }
  }
  return <div className="r5-problem" ref={root}>
    <Button variant="glass" expanded={open} controls="problem-controls" onClick={() => setOpen(v => !v)}>Cause a problem</Button>
    {open && <section id="problem-controls" className="r5-popover glass" aria-label="Cause a problem">
      <div className="r5-popover-heading"><h2>Cause a problem</h2><Button variant="quiet" onClick={() => setOpen(false)}>Close</Button></div>
      <p>A real event in the simulated yard.</p>
      <label>Problem<select value={kind} onChange={e => setKind(e.target.value as Kind)}><option value="drop_pallet">Drop a pallet</option><option value="close_door">Close a door</option><option value="forklift_down">Forklift out of service</option><option value="worker_home">Send a worker home</option></select></label>
      {kind === 'forklift_down' ? <label>Forklift<select value={equipment} onChange={e => setEquipment(e.target.value)}><option>F-3</option><option>F-4</option></select></label> : kind === 'worker_home' ? <label>Worker<select value={worker} onChange={e => setWorker(e.target.value)}><option value="sam">Sam</option><option value="noor">Noor</option></select></label> : <label>Door<select value={door} onChange={e => setDoor(e.target.value)}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>Door {i + 1}</option>)}</select></label>}
      {error && <p role="alert" className="r5-error">{error}</p>}
      {observed ? <p role="status" className="r5-message">Event {observed.seq} · {observed.summary}</p> : request && <p role="status" className="r5-message">Waiting for the yard event…</p>}
      <Button variant="solid" className="r5-touch" disabled={pending || !connected} onClick={() => void cause()}>{pending ? 'Sending…' : 'Cause problem'}</Button>
    </section>}
  </div>;
}

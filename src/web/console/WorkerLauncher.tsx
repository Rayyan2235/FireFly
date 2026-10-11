import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DeviceMobile } from '@phosphor-icons/react';
import type { Task } from '../../contract.ts';
import type { StreamState } from '../useStream.ts';
import { WorkerPage } from '../worker/WorkerPage.tsx';
import { Button } from '../ui/Button.tsx';
import { displayWorkerNames } from '../workerNames.ts';
import { newestWorkerOffer, offerKey } from './workerOffers.ts';

const EMPTY_TASKS: Task[] = [];
export function WorkerLauncher({ stream }: { stream: StreamState }) {
  const tasks = stream.world?.tasks ?? EMPTY_TASKS;
  const [phone, setPhone] = useState<{ worker: string; task?: string } | null>(null);
  const seen = useRef(new Set<string>());
  const launcher = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tasks.length === 0) { seen.current.clear(); return; }
    const offered = newestWorkerOffer(tasks, seen.current);
    for (const task of tasks) {
      if (task.status === 'offered' || task.status === 'accepted') seen.current.add(offerKey(task));
    }
    if (offered) setPhone({ worker: offered.worker!, task: offered.id });
  }, [tasks]);
  function openPhone() {
    const task = newestWorkerOffer(tasks, new Set());
    setPhone({ worker: task?.worker ?? 'noor', task: task?.id });
  }
  function closePhone() { setPhone(null); launcher.current?.querySelector('button')?.focus(); }
  const url = phone ? `/worker.html?worker=${encodeURIComponent(phone.worker)}${phone.task ? `&task=${encodeURIComponent(phone.task)}` : ''}` : '';
  return <>
    <div className="r5-worker-launcher" ref={launcher}>
      <Button variant="glass" expanded={Boolean(phone)} controls="worker-phone-panel" onClick={openPhone}><DeviceMobile size={16} />Worker phone</Button>
    </div>
    {phone && createPortal(<section id="worker-phone-panel" className="r5-phone-panel" aria-label="Worker phone" onKeyDown={e => { if (e.key === 'Escape') closePhone(); }}>
      <header><div><DeviceMobile size={16} /><span>Worker phone</span></div><Button variant="quiet" onClick={closePhone}>Close phone</Button></header>
      <div className="r5-phone-screen"><WorkerPage key={url} stream={stream} initialWorker={phone.worker === 'sam' ? 'sam' : 'noor'} initialTask={phone.task} /></div>
      <footer><span>Live task reports</span><a href={url} target="_blank" rel="noopener noreferrer">Open separate page</a></footer>
    </section>, document.body)}
    <span className="sr-only" role="status">{phone ? `Worker phone opened for ${displayWorkerNames(phone.worker)}.` : ''}</span>
  </>;
}

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStream } from '../useStream.ts';
import '../index.css';

// Starting shell for the worker phone page (Sam / Noor). Open it on a phone at http://<laptop-ip>:5173/worker.html
function WorkerApp() {
  const { connected, world } = useStream();
  const [who, setWho] = useState<'sam' | 'noor'>('noor');
  const me = world?.workers.find((w) => w.id === who);
  const tasks = (world?.tasks ?? []).filter((t) => t.worker === who && t.status !== 'closed');

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-base font-semibold">{me?.name ?? '…'}</p>
          <p className="text-xs text-slate-500">
            {me?.equipment ?? ''} · {connected ? 'connected' : 'connecting…'}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
          {(['sam', 'noor'] as const).map((id) => (
            <button key={id} onClick={() => setWho(id)} className={`rounded-md px-3 py-1 ${who === id ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
              {id === 'sam' ? 'Sam' : 'Noor'}
            </button>
          ))}
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-3 p-4">
        {tasks.length === 0 ? (
          <p className="m-auto text-center text-sm text-slate-500">
            <b className="block text-slate-700">No task right now.</b>When a job needs hands, Firefly sends it here.
          </p>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold">Clear pallet · Door {t.door} approach</p>
              <p className="text-sm text-slate-600">Status: {t.status}</p>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkerApp />
  </StrictMode>,
);

import type { FireflyEvent, RadioMessage } from '../contract.ts';
import { useStream } from './useStream.ts';
import { Yard } from './Yard.tsx';

// Starting shell for the console. Rayyan owns the screens from here.
export function App() {
  const { connected, world, events, routes } = useStream();
  const radio = events.filter((e) => e.type === 'radio').slice(-40).reverse();
  const activity = events.filter((e) => e.type === 'tool.called' || e.type === 'tool.result').slice(-40).reverse();

  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_380px] grid-rows-[52px_minmax(0,1fr)] bg-slate-100 text-slate-900">
      <header className="col-span-2 flex items-center gap-3 border-b border-slate-200 bg-white px-4">
        <span className="font-semibold">Firefly</span>
        <span className="text-sm text-slate-500">North Yard</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">Twin mode · simulated trucks</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {connected ? `Live · seq ${world?.seq ?? 0}` : 'Connecting…'}
        </span>
      </header>

      <main className="relative min-w-0">
        {world ? (
          <Yard doors={world.doors} trucks={world.trucks} routes={routes} />
        ) : (
          <p className="p-6 text-sm text-slate-500">Waiting for the yard snapshot from the server…</p>
        )}
      </main>

      <aside className="grid min-h-0 grid-rows-2 border-l border-slate-200 bg-white">
        <section className="min-h-0 overflow-auto border-b border-slate-200">
          <h2 className="sticky top-0 bg-white px-4 py-2 text-xs font-semibold text-slate-600">Agent activity</h2>
          <ul className="px-4 pb-3 font-mono text-xs">
            {activity.map((e) => (
              <li key={e.seq} className={`py-1 ${isFail(e) ? 'text-red-700' : ''}`}>
                {e.type === 'tool.called' ? '→ ' : '  '}
                {e.summary}
              </li>
            ))}
          </ul>
        </section>
        <section className="min-h-0 overflow-auto">
          <h2 className="sticky top-0 bg-white px-4 py-2 text-xs font-semibold text-slate-600">Radio</h2>
          <ul className="px-4 pb-3 font-mono text-xs">
            {radio.map((e) => {
              const m = e.payload as RadioMessage;
              return (
                <li key={e.seq} className="py-1">
                  <b>{m.from}</b> → <b>{m.to}</b> <span className="rounded bg-slate-100 px-1">{m.type}</span> {m.text}
                </li>
              );
            })}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function isFail(e: FireflyEvent) {
  return e.type === 'tool.result' && !(e.payload as { ok: boolean }).ok;
}

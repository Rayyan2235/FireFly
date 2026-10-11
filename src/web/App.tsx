import { useMemo, useState } from 'react';
import { useStream } from './useStream.ts';
import { Yard } from './Yard.tsx';
import { AgentPanel } from './console/AgentPanel.tsx';
import { RadioLog } from './console/RadioLog.tsx';
import { Sidebar } from './console/Sidebar.tsx';
import { deriveRuns } from './console/runs.ts';

// The supervisor's console. Muhammad owns the screens from here.
export function App() {
  const { connected, world, events, routes } = useStream();
  const runs = useMemo(() => deriveRuns(events), [events]);
  const [picked, setPicked] = useState<string | null>(null);
  // Follow the most recently active run unless Maria picked one.
  const latest = runs.reduce<(typeof runs)[number] | null>((a, r) => (!a || r.lastSeq > a.lastSeq ? r : a), null);
  const selected = picked && runs.some((r) => r.incidentId === picked) ? picked : (latest?.incidentId ?? null);

  return (
    <div className="grid h-screen grid-cols-[256px_minmax(0,1fr)] bg-canvas text-fg">
      <Sidebar world={world} selected={selected} onSelect={setPicked} />

      <main className="my-2 mr-2 flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 text-[13px]">
          <span className="text-fg-3">North Yard</span>
          <span className="text-fg-4">/</span>
          <span className="text-fg">Live yard</span>
          <span className="ml-auto flex items-center gap-2 text-fg-3">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-fg-4'}`} />
            {connected ? 'Live' : 'Connecting…'}
            <span className="font-mono text-[11.5px] text-fg-4 tabular-nums">seq {world?.seq ?? 0}</span>
          </span>
        </header>

        <div className="relative min-h-0 flex-1">
          {world ? (
            <Yard doors={world.doors} trucks={world.trucks} routes={routes} />
          ) : (
            <p className="p-6 text-[13px] text-fg-3">Waiting for the yard snapshot from the server…</p>
          )}
          <RadioLog events={events} />
          <AgentPanel runs={runs} incidents={world?.incidents ?? []} selected={selected} onSelect={setPicked} />
        </div>
      </main>
    </div>
  );
}

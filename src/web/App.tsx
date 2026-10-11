import { useMemo, useState } from 'react';
import type { WorldSnapshot } from '../contract.ts';
import { useStream } from './useStream.ts';
import { postAction } from './api.ts';
import { ProblemControl } from './console/ProblemControl.tsx';
import { Yard } from './Yard.tsx';
import { AgentPanel } from './console/AgentPanel.tsx';
import { RadioLog } from './console/RadioLog.tsx';
import { Sidebar } from './console/Sidebar.tsx';
import { deriveRuns } from './console/runs.ts';
import { Button } from './ui/Button.tsx';
import { LeverSwitch } from './ui/LeverSwitch.tsx';

// The supervisor's console. Muhammad owns the screens from here.
export function App() {
  const { connected, world, events, routes } = useStream();
  // A reset starts a new shift: only events after the last world.reset belong on screen.
  const shift = useMemo(() => events.slice(events.findLastIndex((e) => e.type === 'world.reset') + 1), [events]);
  const runs = useMemo(() => deriveRuns(shift), [shift]);
  const [picked, setPicked] = useState<string | null>(null);
  // Follow the most recently active run unless Maria picked one.
  const latest = runs.reduce<(typeof runs)[number] | null>((a, r) => (!a || r.lastSeq > a.lastSeq ? r : a), null);
  const selected = picked && runs.some((r) => r.incidentId === picked) ? picked : (latest?.incidentId ?? null);

  return (
    <div className="grid h-screen grid-cols-[256px_minmax(0,1fr)] bg-canvas text-fg">
      <Sidebar world={world} selected={selected} onSelect={setPicked} />

      <main className="my-2 mr-2 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 text-[13px]">
          <span className="text-fg-3">North Yard</span>
          <span className="text-fg-4">/</span>
          <span className="text-fg">Live yard</span>
          <span className="ml-3 flex items-center gap-2 text-fg-3">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-fg' : 'border border-fg-4'}`} />
            {connected ? 'Live' : 'Connecting…'}
            <span className="font-mono text-[11.5px] text-fg-4 tabular-nums">seq {world?.seq ?? 0}</span>
          </span>
          <span className="ml-auto flex items-center gap-4">
            <ProblemControl events={shift} connected={connected} />
            <Button variant="link" href="/api/record" download="firefly-work-record.json">
              Export record
            </Button>
            <ShiftLever world={world} />
          </span>
        </header>

        <div className="relative min-h-0 flex-1">
          {world ? (
            <Yard doors={world.doors} trucks={world.trucks} routes={routes} />
          ) : (
            <p className="p-6 text-[13px] text-fg-3">Waiting for the yard snapshot from the server…</p>
          )}
          <RadioLog events={shift} />
          <AgentPanel
            runs={runs}
            incidents={world?.incidents ?? []}
            approvals={world?.approvals ?? []}
            selected={selected}
            onSelect={setPicked}
          />
        </div>
      </main>
    </div>
  );
}

/**
 * Shift into D to run the demo scenario (a fresh yard, the preset problems, then the shift starts).
 * Back to P resets the yard; saved site rules survive a reset.
 */
function ShiftLever({ world }: { world: WorldSnapshot | null }) {
  const running = Boolean(world && (world.incidents.length > 0 || world.trucks.some((t) => t.controller === 'moving' || t.controller === 'held')));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = running;

  async function shift(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await postAction(next ? '/api/scenario/demo' : '/api/reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server unreachable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5" title={error ?? undefined}>
      <div className="text-right leading-tight">
        <p className="text-[13px] font-medium text-fg">{checked ? 'Demo shift running' : 'Start demo shift'}</p>
        <p className={`text-[11.5px] ${error ? 'text-fg' : 'text-fg-4'}`}>{error ?? (checked ? 'P resets the yard' : 'Shift into D')}</p>
      </div>
      <LeverSwitch checked={checked} onChange={(v) => void shift(v)} disabled={busy || !world} label="Run demo scenario" gates={['P', 'D']} />
    </div>
  );
}

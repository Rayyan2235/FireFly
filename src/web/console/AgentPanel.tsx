import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowsOutSimple, CaretRight, Check, CircleNotch, Minus, SealCheck, WarningCircle, X } from '@phosphor-icons/react';
import type { Approval, Incident, Truck } from '../../contract.ts';
import { checkResponse } from '../api.ts';
import { ServerAction } from './ServerAction.tsx';
import { Button } from '../ui/Button.tsx';
import { FireflyMark, StatusIcon, agentName, clock } from './bits.tsx';
import { seconds } from './runs.ts';
import type { AgentRun } from './runs.ts';

const MODEL = 'Opus 5.5'; // the agent runner calls claude-opus-5-5

/**
 * The agent's working window, floating over the yard (after Linear's agent panel).
 * Every line is one event: the robot's report, a tool call, a tool result, the verified outcome.
 */
export function AgentPanel({
  runs,
  incidents,
  approvals,
  trucks,
  selected,
  onSelect,
}: {
  runs: AgentRun[];
  incidents: Incident[];
  approvals: Approval[];
  trucks: Truck[];
  selected: string | null;
  onSelect: (incidentId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const run = runs.find((r) => r.incidentId === selected) ?? null;
  const statusOf = (id: string) => incidents.find((i) => i.id === id)?.status ?? 'queued';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn btn--glass absolute top-4 right-4"
      >
        <FireflyMark width={24} />
        {run ? `${agentName(run.agentId)} · ${run.resolved ? 'Done' : 'Working'}` : 'Agents'}
        <ArrowsOutSimple size={13} className="text-fg-3" />
      </button>
    );
  }

  return (
    <section
      aria-label="Agent activity"
      className="glass absolute top-4 right-4 bottom-4 flex w-[400px] flex-col overflow-hidden rounded-2xl"
    >
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <FireflyMark width={28} />
        <span className="text-[14px] font-medium text-fg">{run ? agentName(run.agentId) : 'Firefly'}</span>
        <span className="text-[12px] text-fg-4">{MODEL}</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Minimize agent panel"
          className="ml-auto rounded-md p-1 text-fg-3 transition-colors hover:bg-hover hover:text-fg"
        >
          <Minus size={15} />
        </button>
      </header>

      {runs.length > 1 && (
        <nav className="flex gap-1 px-3 pb-2" aria-label="Agent runs">
          {runs.map((r) => (
            <button
              key={r.incidentId}
              onClick={() => onSelect(r.incidentId)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] transition-colors ${
                r.incidentId === selected ? 'bg-hover text-fg' : 'text-fg-3 hover:text-fg-2'
              }`}
            >
              <StatusIcon status={statusOf(r.incidentId)} size={12} />
              {r.incidentId}
              <span className="text-fg-4">· {agentName(r.agentId)}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="h-px bg-line" />
      {run ? (
        <RunBody
          key={run.incidentId}
          run={run}
          status={statusOf(run.incidentId)}
          approval={approvals.find((a) => a.incidentId === run.incidentId && a.status === 'pending')}
        />
      ) : (
        <Empty />
      )}
      {(() => {
        const incident = incidents.find(i => i.id === selected);
        const held = incident && (incident.status === 'held' || trucks.some(t => t.id === incident.truckId && t.controller === 'held'));
        return held && incident.status !== 'resolved' ? <div className="r5-resume"><p>Truck held · resume gate applies</p><ServerAction key={incident.id} path={`/api/incidents/${encodeURIComponent(incident.id)}/resume`} label="Resume now" variant="glass" /></div> : null;
      })()}
      <Composer run={run} />
    </section>
  );
}

function RunBody({ run, status, approval }: { run: AgentRun; status: Incident['status']; approval?: Approval }) {
  const done = Boolean(run.resolved);
  const [expanded, setExpanded] = useState(!done);
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Collapse the trace once the outcome is verified (Linear's "Worked for …"); keep it open while working.
  useEffect(() => setExpanded(!done), [done]);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [run.steps.length, run.steps.at(-1)?.result, done, expanded]);

  const elapsed = done ? seconds(run.firstTs, run.resolved!.ts) : seconds(run.firstTs, new Date(now).toISOString());
  const verified = run.steps.some((s) => s.tool === 'verify_outcome' && s.result?.ok);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="flex items-center gap-2 text-[13px]">
        <StatusIcon status={status} />
        <span className="font-mono text-[12px] text-fg-3">{run.incidentId}</span>
        <span className="truncate text-fg-2">{run.title}</span>
      </div>

      {run.trigger && (
        <div className="step-in mt-4 ml-8">
          <p className="mb-1.5 text-right text-[11.5px] text-fg-4">
            {run.trigger.from} → {run.trigger.to} · {clock(run.trigger.ts)}
          </p>
          <div className="rounded-xl border border-line bg-raised px-3.5 py-2.5 text-[13.5px] leading-relaxed text-fg">
            <span className="chip chip--attn mr-1.5">{run.trigger.type}</span>
            {run.trigger.text}
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-5 flex items-center gap-1.5 text-[13px] text-fg-3 transition-colors hover:text-fg-2"
        aria-expanded={expanded}
      >
        {done ? (
          <>Worked for {elapsed}s · {run.steps.length} tool calls</>
        ) : (
          <>
            <CircleNotch size={13} className="animate-spin text-fg-2" />
            Working · {elapsed}s
          </>
        )}
        <CaretRight size={12} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <ol className="relative mt-3 ml-[7px] border-l border-line pl-4">
          {run.steps.map((s) => (
            <li key={s.seq} className="step-in relative pb-3.5 last:pb-0">
              <span className="absolute top-[3px] -left-[23.5px] flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#2a2b2e]">
                {!s.result ? (
                  <CircleNotch size={12} className="animate-spin text-fg-2" />
                ) : s.result.ok ? (
                  <Check size={12} className="text-fg-3" weight="bold" />
                ) : (
                  <X size={12} className="text-fg" weight="bold" />
                )}
              </span>
              <p className="font-mono text-[12px] leading-5 text-fg-2">{s.call}</p>
              {s.result && (
                <p className={`mt-0.5 text-[12.5px] leading-snug ${s.result.ok ? 'text-fg-3' : 'font-medium text-fg'}`}>{s.result.summary}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {approval && !run.resolved && <ApprovalBlock approval={approval} />}

      {run.resolved && (
        <div className="step-in mt-5 rounded-xl border border-line-strong bg-raised">
          <div className="flex items-center gap-2 px-3.5 pt-3 text-[13px] font-medium text-fg">
            <SealCheck size={16} weight="fill" className="text-fg" />
            {verified ? 'Outcome verified' : 'Closed'}
            <span className="ml-auto text-[11.5px] font-normal text-fg-4">{clock(run.resolved.ts)}</span>
          </div>
          <p className="px-3.5 pt-1.5 pb-3 text-[13px] leading-relaxed text-fg-2">{run.resolved.summary}</p>
          {verified && (
            <p className="border-t border-line px-3.5 py-2 font-mono text-[11.5px] text-fg-3">verify_outcome · controller confirmed</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Maria's authorization: the resume gate. The tool checks it again when the agent asks to resume. */
function ApprovalBlock({ approval }: { approval: Approval }) {
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  async function approve() {
    setState({ kind: 'sending' });
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(approval.id)}/approve`, { method: 'POST' });
      await checkResponse(res);
      setState({ kind: 'idle' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : "Couldn't reach the server. Nothing was authorized." });
    }
  }
  return (
    <div className="step-in mt-5 rounded-xl border border-line-strong bg-raised p-3.5">
      <p className="text-[13px] font-medium text-fg">Resume needs your authorization</p>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
        The truck stays held until you approve. The resume tool checks your approval and the worker's people-clear report again before RESUME is sent.
      </p>
      {state.kind === 'error' && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-fg">
          <WarningCircle size={14} className="mt-px shrink-0" />
          {state.message}
        </p>
      )}
      <Button variant="solid" className="mt-3" onClick={() => void approve()} disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Authorizing…' : 'Authorize resume'}
      </Button>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <FireflyMark width={52} strokeWidth={12} />
      <p className="text-[14px] text-fg-2">No open incidents</p>
      <p className="text-[13px] leading-relaxed text-fg-3">When a truck stops and reports BLOCKED, an agent picks it up and works it here.</p>
    </div>
  );
}

/** Maria's line to the agent: facts it can't sense, corrections. */
function Composer({ run }: { run: AgentRun | null }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'error'; message: string }>({ kind: 'idle' });

  async function send() {
    const body = text.trim();
    if (!body || state.kind === 'sending') return;
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: body, incident_id: run?.incidentId ?? null, from: 'maria' }),
      });
      await checkResponse(res);
      setText('');
      setState({ kind: 'idle' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : "Couldn't reach the server. Your note wasn't saved." });
    }
  }

  return (
    <div className="m-3 rounded-xl border border-line-strong bg-raised focus-within:border-fg-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (state.kind === 'error') setState({ kind: 'idle' });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        rows={2}
        placeholder="Tell Firefly something it can't sense…"
        aria-label="Note to Firefly"
        className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] text-fg placeholder:text-fg-4 focus:outline-none"
      />
      {state.kind === 'error' && (
        <p className="flex items-start gap-1.5 px-3.5 pt-1 text-[12px] text-fg">
          <WarningCircle size={14} className="mt-px shrink-0" />
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
        <span className="text-[12px] text-fg-4">{run ? `Note on ${run.incidentId}` : 'Site note'} · from Maria</span>
        <button
          onClick={() => void send()}
          disabled={!text.trim() || state.kind === 'sending'}
          aria-label="Send note"
          className="btn btn--solid ml-auto h-7 w-7 justify-center !p-0"
        >
          {state.kind === 'sending' ? <CircleNotch size={14} className="animate-spin" /> : <ArrowUp size={14} weight="bold" />}
        </button>
      </div>
    </div>
  );
}

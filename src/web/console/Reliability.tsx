import { useEffect, useRef, useState } from 'react';
import type { Reliability as RecordReliability } from '../../server/reliability.ts';
import { displayWorkerNames } from '../workerNames.ts';
import { checkResponse } from '../api.ts';

export function Reliability({ seq }: { seq: number | undefined }) {
  const [data, setData] = useState<RecordReliability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestSeq = useRef(seq);
  latestSeq.current = seq;
  useEffect(() => {
    if (seq === undefined) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void fetch('/api/reliability', { signal: abort.signal }).then(async r => {
        await checkResponse(r);
        const result = await r.json() as RecordReliability;
        if (!abort.signal.aborted && latestSeq.current === seq) { setData(result); setError(null); }
      }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load the work record.'); });
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [seq]);
  const fields = (values: Record<string, number | null>) => <dl>{Object.entries(values).map(([label, value]) => <div key={label}><dt>{label.replaceAll('_', ' ')}</dt><dd>{value === null ? 'Not available' : String(value)}</dd></div>)}</dl>;
  return <section className="r5-reliability glass" aria-label="Reliability">
    <h2>Reliability</h2><p>from this run’s work record</p>
    {error && <p className="r5-error" role="alert">{error}</p>}
    {!data ? <p>Waiting for the work record…</p> : <>
      <p>{data.label}</p>
      {fields({ resolved: data.incidents.resolved, open: data.incidents.open, 'median recovery (s)': data.time_to_recovery_s.median })}
      <details><summary>All recorded numbers</summary>
        <h3>Event range</h3>{fields(data.events)}
        <h3>Incidents</h3>{fields(data.incidents)}
        <h3>Recovered</h3>{fields(data.recovered)}
        <h3>Recovery time (s)</h3>{fields(data.time_to_recovery_s)}
        <h3>Supervisor actions</h3>{fields(data.supervisor_actions)}
        <h3>Worker labor</h3>{data.worker_labor.map(w => <div key={displayWorkerNames(w.worker)}><h3>{displayWorkerNames(w.worker)}</h3>{fields({ tasks_accepted: w.tasks_accepted, tasks_completed: w.tasks_completed })}</div>)}
        <h3>Controller commands</h3>{fields(data.controller_commands)}
      </details>
    </>}
  </section>;
}

import { useState } from 'react';
import { postAction } from '../api.ts';
import { Button } from '../ui/Button.tsx';
/** Only the stream removes a rule or changes the incident after this request. */
export function ServerAction({ path, label, variant = 'quiet' }: { path: string; label: string; variant?: 'quiet' | 'glass' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    if (pending) return;
    setPending(true); setError(null);
    try { await postAction(path); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to reach the server.'); }
    finally { setPending(false); }
  }
  return <div className="r5-server-action"><Button variant={variant} disabled={pending} onClick={() => void send()}>{pending ? 'Sending…' : label}</Button>{error && <p className="r5-error" role="alert">{error}</p>}</div>;
}

import type { FireflyEvent, MessageType, RadioMessage } from '../../contract.ts';
import { clock } from './bits.tsx';

const tone: Partial<Record<MessageType, string>> = {
  BLOCKED: 'bg-danger/15 text-danger',
  ACK: 'bg-ok/15 text-ok',
  ARRIVED: 'bg-ok/15 text-ok',
  DONE: 'bg-ok/15 text-ok',
  CLEAR: 'bg-ok/15 text-ok',
  GO_TO: 'bg-glow/15 text-glow',
  RESUME: 'bg-glow/15 text-glow',
  HOLD: 'bg-glow/15 text-glow',
  TASK: 'bg-glow/15 text-glow',
};

/** The one channel every worker talks on. Newest at the bottom, like a radio. */
export function RadioLog({ events }: { events: FireflyEvent[] }) {
  const radio = events.filter((e) => e.type === 'radio').slice(-6);

  return (
    <section aria-label="Radio" className="glass absolute bottom-4 left-4 w-[460px] rounded-xl">
      <header className="flex items-baseline gap-2 px-4 pt-3 pb-2">
        <h2 className="text-[13px] font-medium text-fg">Radio</h2>
        <span className="text-[11.5px] text-fg-4">message names modeled on VDA 5050</span>
      </header>
      {radio.length === 0 ? (
        <p className="px-4 pb-3.5 text-[13px] text-fg-4">Quiet. Trucks, people and agents report here.</p>
      ) : (
        <ol className="px-2 pb-2">
          {radio.map((e) => {
            const m = e.payload as RadioMessage;
            return (
              <li key={e.seq} className="step-in grid grid-cols-[52px_auto_1fr] items-baseline gap-x-2 rounded-md px-2 py-1 text-[12.5px]">
                <span className="font-mono text-[11px] text-fg-4 tabular-nums">{clock(e.ts)}</span>
                <span className="whitespace-nowrap text-fg-3">
                  {m.from} <span className="text-fg-4">→</span> {m.to}
                </span>
                <span className="min-w-0 truncate text-fg-2">
                  <span className={`mr-1.5 rounded px-1 py-px font-mono text-[10.5px] ${tone[m.type] ?? 'bg-hover text-fg-2'}`}>{m.type}</span>
                  {m.text}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

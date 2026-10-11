import type { IncidentStatus } from '../../contract.ts';

/** Firefly's mark: a rounded square holding one small light. One form; no glow. */
export function FireflyMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="5" fill="#ffffff" />
      <circle cx="10" cy="10" r="3.2" fill="#08090a" />
    </svg>
  );
}

/** Linear-style status glyphs, drawn rather than emoji. */
export function StatusIcon({ status, size = 14 }: { status: IncidentStatus | 'none'; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  switch (status) {
    case 'resolved':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="6" fill="var(--color-ok)" />
          <path d="M4.3 7.2l1.8 1.8 3.6-3.8" fill="none" stroke="#08090a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'needs_you':
    case 'held':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="6" fill="var(--color-danger)" />
          <rect x="6.25" y="3.6" width="1.5" height="4.4" rx="0.75" fill="#08090a" />
          <circle cx="7" cy="10" r="0.9" fill="#08090a" />
        </svg>
      );
    case 'working':
    case 'waiting':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="5.6" fill="none" stroke="var(--color-fg-2)" strokeWidth="1.5" />
          <path d="M7 3.6a3.4 3.4 0 0 1 0 6.8z" fill="var(--color-fg-2)" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="5.6" fill="none" stroke="var(--color-fg-4)" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
      );
  }
}

export const clock = (ts: string) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const agentName = (id: string | null) => (id ? id.replace(/^firefly-/, 'Firefly-') : 'Unassigned');

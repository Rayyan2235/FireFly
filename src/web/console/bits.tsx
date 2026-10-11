import type { IncidentStatus } from '../../contract.ts';

/** Firefly's mark (from the logo): a firefly's head, body and wings in one monoline stroke. Width is twice the height. */
export function FireflyMark({ width = 30, strokeWidth = 14 }: { width?: number; strokeWidth?: number }) {
  return (
    <svg width={width} height={width / 2} viewBox="0 0 320 160" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="160" cy="36" r="22" />
      <rect x="138" y="68" width="44" height="80" rx="22" />
      <path d="M138 60 H6 L42 97 C54 111 64 120 82 120 C100 120 116 108 138 92" />
      <path d="M182 60 H314 L278 97 C266 111 256 120 238 120 C220 120 204 108 182 92" />
    </svg>
  );
}

/**
 * Status glyphs. One grey family, no hues: shape says the state, and only "needs attention"
 * is inverted to solid white, so it is the brightest thing in a list.
 */
export function StatusIcon({ status, size = 14 }: { status: IncidentStatus | 'none'; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  switch (status) {
    case 'resolved':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="6" fill="var(--color-fg-3)" />
          <path d="M4.3 7.2l1.8 1.8 3.6-3.8" fill="none" stroke="#08090a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'needs_you':
    case 'held':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="6.2" fill="#ffffff" />
          <rect x="6.25" y="3.4" width="1.5" height="4.6" rx="0.75" fill="#08090a" />
          <circle cx="7" cy="10.1" r="0.95" fill="#08090a" />
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

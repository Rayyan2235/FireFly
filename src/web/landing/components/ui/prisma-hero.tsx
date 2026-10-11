import { ArrowRight } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';

// The supplied hero composition, with the new system’s always-visible typography.
export function WordsPullUp({ text, className = '', showAsterisk = false, style }: {
  text: string; className?: string; showAsterisk?: boolean; style?: CSSProperties; reduceMotion?: boolean;
}) {
  return <span className={`words-pull-up ${className}`} style={style}><span className="pull-word">{text}{showAsterisk && <FireflyMark className="word-asterisk" />}</span></span>;
}

/** The Firefly logo mark (same paths as public/brand/firefly-mark.svg), drawn in currentColor. */
export function FireflyMark({ className, strokeWidth = 12 }: { className?: string; strokeWidth?: number }) {
  return <svg className={className} viewBox="0 0 320 160" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="160" cy="36" r="22" /><rect x="138" y="68" width="44" height="80" rx="22" />
    <path d="M138 60 H6 L42 97 C54 111 64 120 82 120 C100 120 116 108 138 92" />
    <path d="M182 60 H314 L278 97 C266 111 256 120 238 120 C220 120 204 108 182 92" />
  </svg>;
}

export function PrismaAction({ children, href, onClick }: {
  children: ReactNode; href?: string; onClick?: () => void;
}) {
  const contents = <><span>{children}</span><span className="action-disc"><ArrowRight size={16} aria-hidden="true" /></span></>;
  return href ? <a className="prisma-action" href={href}>{contents}</a> : <button className="prisma-action" onClick={onClick}>{contents}</button>;
}

/** The shared live Canvas is the background, in place of the reference's stock video. */
export function PrismaHero({ onExplore, reduceMotion }: { onExplore: () => void; reduceMotion: boolean }) {
  return <div className="prisma-hero">
    <p className="hero-statement"><WordsPullUp text="Keep the yard moving." reduceMotion={reduceMotion} /></p>
    <div className="hero-bottom">
      <h1 className="hero-wordmark"><WordsPullUp text="Firefly" showAsterisk reduceMotion={reduceMotion} /></h1>
      <div className="hero-intro">
        <p>When the physical world interrupts the plan, Firefly brings agents, robots and people together to see the work through.</p>
        <PrismaAction onClick={onExplore}>Explore the yard</PrismaAction>
      </div>
    </div>
  </div>;
}

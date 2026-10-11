import { ArrowRight, Asterisk } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

// The supplied hero composition, with the new system’s always-visible typography.
export function WordsPullUp({ text, className = '', showAsterisk = false, style }: {
  text: string; className?: string; showAsterisk?: boolean; style?: CSSProperties; reduceMotion?: boolean;
}) {
  return <span className={`words-pull-up ${className}`} style={style}><span className="pull-word">{text}{showAsterisk && <Asterisk className="word-asterisk" strokeWidth={1.25} aria-hidden="true" />}</span></span>;
}

export function PrismaAction({ children, href, onClick }: {
  children: ReactNode; href?: string; onClick?: () => void;
}) {
  const contents = <><span>{children}</span><span className="action-disc"><ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" /></span></>;
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

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, Asterisk } from 'lucide-react';
import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// Adapted from the Prisma component supplied in the design brief.
export function WordsPullUp({ text, className = '', showAsterisk = false, style, reduceMotion = false }: {
  text: string; className?: string; showAsterisk?: boolean; style?: CSSProperties; reduceMotion?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const systemReduced = useReducedMotion();
  const reduced = reduceMotion || systemReduced;
  const words = text.split(' ');
  return <span ref={ref} className={`words-pull-up ${className}`} style={style}>
    {words.map((word, index) => <motion.span key={`${word}-${index}`} className="pull-word"
      initial={reduced ? false : { y: 24, opacity: 0 }}
      animate={isInView || reduced ? { y: 0, opacity: 1 } : {}}
      transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : index * 0.08, ease: [0.16, 1, 0.3, 1] }}>
      {word}{index < words.length - 1 ? ' ' : ''}
      {showAsterisk && index === words.length - 1 && <Asterisk className="word-asterisk" strokeWidth={1.25} aria-hidden="true" />}
    </motion.span>)}
  </span>;
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

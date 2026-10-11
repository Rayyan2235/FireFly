import type { ReactNode } from 'react';
import { ArrowRight } from '@phosphor-icons/react';

/** The arrow is never bare: it always sits in a pill. */
export function ArrowPill() {
  return (
    <span className="arrow-pill" aria-hidden="true">
      <ArrowRight size={9} weight="bold" />
    </span>
  );
}

/**
 * Buttons from the GIC design system. solid: the one action a screen exists for. glass: an action
 * floating over the yard. link: label + arrow pill, no box. quiet: rows of peers, never the primary.
 */
export function Button({
  variant = 'glass',
  arrow = variant !== 'quiet',
  href,
  download,
  onClick,
  disabled,
  className = '',
  children,
}: {
  variant?: 'solid' | 'glass' | 'link' | 'quiet';
  arrow?: boolean;
  href?: string;
  download?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = `btn btn--${variant} ${className}`;
  if (href)
    return (
      <a className={cls} href={href} download={download}>
        {children}
        {arrow && <ArrowPill />}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
      {arrow && <ArrowPill />}
    </button>
  );
}

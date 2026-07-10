import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
}

export function Card({ className, raised = false, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl2 border border-line p-5',
        raised ? 'bg-surface-raised shadow-card' : 'bg-surface',
        className,
      )}
      {...props}
    />
  );
}

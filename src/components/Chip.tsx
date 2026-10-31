import type { ReactNode } from 'react';
import './Chip.css';

// Tag chip — spec §8.2.

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  /** dashed "+ tag" style */
  add?: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  ariaLabel?: string;
}

export function Chip({ children, selected = false, add = false, onClick, onPointerDown, onPointerUp, ariaLabel }: ChipProps) {
  const className = 'chip' + (selected ? ' is-selected' : '') + (add ? ' is-add' : '') + (onClick ? ' pressable' : '');
  if (!onClick) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      className={className}
      aria-pressed={add ? undefined : selected}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </button>
  );
}

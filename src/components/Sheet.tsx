import { useEffect, type ReactNode } from 'react';
import './Sheet.css';

// Bottom sheet — spec §8.12 / §8.13.

interface SheetProps {
  title: string;
  onClose: () => void;
  /** top-right action, e.g. "Hecho" */
  action?: string;
  children: ReactNode;
}

export function Sheet({ title, onClose, action, children }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <h2 className="t-section ellipsis">{title}</h2>
          {action && (
            <button type="button" className="sheet__action pressable" onClick={onClose}>
              {action}
            </button>
          )}
        </header>
        {children}
      </section>
    </div>
  );
}

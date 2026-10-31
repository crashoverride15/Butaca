import { useRef, useState, type ReactNode } from 'react';
import './SwipeRow.css';

// Swipe a row to the left to reveal one action — spec §9.4 ("Puntuar" on Vistas).

const WIDTH = 88;

export function SwipeRow({ children, actionLabel, onAction }: { children: ReactNode; actionLabel: string; onAction: () => void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);

  return (
    <div className="swipe">
      <button type="button" className="swipe__action pressable" onClick={() => { setDx(0); onAction(); }} tabIndex={dx === 0 ? -1 : 0}>
        {actionLabel}
      </button>
      <div
        className="swipe__content"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform 180ms ease-out' }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY, base: dx, horizontal: null };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const t = e.touches[0];
          const mx = t.clientX - s.x;
          const my = t.clientY - s.y;
          if (s.horizontal === null && Math.abs(mx) + Math.abs(my) > 8) s.horizontal = Math.abs(mx) > Math.abs(my);
          if (s.horizontal) setDx(Math.max(-WIDTH, Math.min(0, s.base + mx)));
        }}
        onTouchEnd={() => {
          start.current = null;
          setDx((v) => (v < -WIDTH / 2 ? -WIDTH : 0));
        }}
        onClickCapture={(e) => {
          // a tap on an open row closes it instead of opening the title
          if (dx !== 0) {
            e.preventDefault();
            e.stopPropagation();
            setDx(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

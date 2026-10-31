import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import './SwipeCard.css';

// A card you throw to the right ("seen") or to the left ("not seen") — D28. Tap opens it.

export type Throw = 'left' | 'right';
export interface SwipeCardHandle {
  fling: (dir: Throw) => void;
}

const THRESHOLD = 100;
const FLING_MS = 220;

interface Props {
  children: ReactNode;
  onThrow: (dir: Throw) => void;
  onTap: () => void;
  rightLabel: string;
  leftLabel: string;
}

export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard({ children, onThrow, onTap, rightLabel, leftLabel }, ref) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [out, setOut] = useState<Throw | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const fling = (dir: Throw) => {
    if (out) return;
    setOut(dir);
    window.setTimeout(() => onThrow(dir), FLING_MS);
  };
  useImperativeHandle(ref, () => ({ fling }));

  const x = out ? (out === 'right' ? 1 : -1) * (window.innerWidth + 120) : pos.x;
  const dragging = start.current !== null;
  const strength = Math.min(1, Math.abs(x) / THRESHOLD);

  return (
    <div
      className="swipe-card"
      style={{
        transform: `translate(${x}px, ${pos.y}px) rotate(${x / 18}deg)`,
        transition: dragging ? 'none' : `transform ${FLING_MS}ms ease-out`,
      }}
      onPointerDown={(e) => {
        if (out) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
        setPos({ x: dx, y: dy * 0.25 });
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        if (!moved.current) {
          setPos({ x: 0, y: 0 });
          onTap();
        } else if (Math.abs(pos.x) > THRESHOLD) fling(pos.x > 0 ? 'right' : 'left');
        else setPos({ x: 0, y: 0 });
      }}
      onPointerCancel={() => {
        start.current = null;
        setPos({ x: 0, y: 0 });
      }}
    >
      {children}
      <span className="swipe-card__stamp swipe-card__stamp--right" style={{ opacity: x > 0 ? strength : 0 }}>{rightLabel}</span>
      <span className="swipe-card__stamp swipe-card__stamp--left" style={{ opacity: x < 0 ? strength : 0 }}>{leftLabel}</span>
    </div>
  );
});

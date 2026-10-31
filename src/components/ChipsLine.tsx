import { useLayoutEffect, useRef } from 'react';
import './ChipsLine.css';

// One line of small chips: those that do not fit are hidden, never wrapped (spec §8.10).

export function ChipsLine({ labels }: { labels: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      const limit = box.clientWidth;
      for (const child of Array.from(box.children) as HTMLElement[]) {
        child.style.visibility = 'visible';
        if (child.offsetLeft + child.offsetWidth > limit + 0.5) child.style.visibility = 'hidden';
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [labels]);

  if (labels.length === 0) return <div className="chips-line" />;
  return (
    <div className="chips-line" ref={ref}>
      {labels.map((l) => (
        <span key={l} className="chips-line__chip">{l}</span>
      ))}
    </div>
  );
}

import { Sheet } from './Sheet';
import './ScoreSheet.css';

// "Tu nota" — spec §8.13.

interface ScoreSheetProps {
  score: number | null;
  onPick: (score: number | null) => void;
  onClose: () => void;
}

export function ScoreSheet({ score, onPick, onClose }: ScoreSheetProps) {
  return (
    <Sheet title="Tu nota" onClose={onClose}>
      <div className="score-grid">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={score === n}
            className={'score-grid__btn pressable' + (score === n ? ' is-selected' : '')}
            onClick={() => {
              onPick(n);
              onClose();
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="score-clear pressable"
        onClick={() => {
          onPick(null);
          onClose();
        }}
      >
        Quitar nota
      </button>
    </Sheet>
  );
}

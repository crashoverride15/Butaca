import { useState } from 'react';
import type { SeasonInfo } from '../logic/watched';
import { Chip } from './Chip';
import { Sheet } from './Sheet';
import './SeriesAnswerSheet.css';

// A series answered "seen" in Gustos (D28): how far I got and how I watch it.

export const WATCH_STYLES = ['Noche', 'Maratón', 'Random', 'Entre semana', 'Para dormirme'];

interface Props {
  title: string;
  seasons: SeasonInfo[];
  onSave: (upTo: number | null, styles: string[]) => void;
  onCancel: () => void;
}

export function SeriesAnswerSheet({ title, seasons, onSave, onCancel }: Props) {
  const aired = seasons.filter((s) => s.aired > 0);
  const [upTo, setUpTo] = useState<number | null>(null);
  const [styles, setStyles] = useState<string[]>([]);
  const toggle = (s: string) => setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <Sheet title={title} onClose={onCancel} action="Cancelar">
      <div className="series-sheet">
        <h3 className="t-eyebrow series-sheet__label">¿Hasta dónde la has visto?</h3>
        <div className="series-sheet__seasons">
          <button type="button" aria-pressed={upTo === null} className={'series-sheet__season pressable' + (upTo === null ? ' is-selected' : '')} onClick={() => setUpTo(null)}>
            Entera
          </button>
          {aired.map((s) => (
            <button key={s.number} type="button" aria-pressed={upTo === s.number} className={'series-sheet__season pressable' + (upTo === s.number ? ' is-selected' : '')} onClick={() => setUpTo(s.number)}>
              T{s.number}
            </button>
          ))}
        </div>
        <h3 className="t-eyebrow series-sheet__label">¿Cómo la ves?</h3>
        <div className="series-sheet__styles">
          {WATCH_STYLES.map((s) => (
            <Chip key={s} selected={styles.includes(s)} onClick={() => toggle(s)}>
              {s}
            </Chip>
          ))}
        </div>
        <button type="button" className="series-sheet__save pressable" onClick={() => onSave(upTo, styles)}>
          Guardar
        </button>
      </div>
    </Sheet>
  );
}

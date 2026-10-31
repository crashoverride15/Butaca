import { useState } from 'react';
import { Chip } from './Chip';
import { LazyTile } from './LazyTile';
import { useMomentRows, type MomentRow } from '../hooks/useMomentRows';
import { titleToCard } from '../logic/cards';
import { platformLabel } from '../logic/platform';
import type { MomentId } from '../logic/seriesMoment';
import { useSettings } from '../store/SettingsContext';
import './MomentRows.css';

// Inicio → Series: one row per moment, or just the one I pick (D39).

const HINT: Record<MomentId, string> = {
  'momento:maraton': 'Cortas, con la trama seguida',
  'momento:entre-semana': 'Largas, con trama media',
  'momento:para-dormirme': 'Un caso por episodio, trama mínima',
  'momento:random': 'Capítulos sueltos, sin orden',
};

type Pick = 'todo' | MomentId;
const PICK_KEY = 'butaca.fila';
const SHORT: Record<Pick, string> = {
  todo: 'Todo',
  'momento:maraton': 'Maratón',
  'momento:entre-semana': 'Entre semana',
  'momento:para-dormirme': 'Dormir',
  'momento:random': 'Random',
};
const PICKS = Object.keys(SHORT) as Pick[];
const IN_ALL = 10;

function loadPick(): Pick {
  try {
    const saved = localStorage.getItem(PICK_KEY);
    if (saved && (PICKS as string[]).includes(saved)) return saved as Pick;
  } catch {
    /* no storage: all */
  }
  return 'todo';
}

function Row({ row, limit }: { row: MomentRow; limit: number }) {
  const { settings } = useSettings();
  return (
    <section className="inicio__section" aria-labelledby={`row-${row.id}`}>
      <div className="moment-row__head">
        <h2 id={`row-${row.id}`} className="t-section ellipsis">{row.label}</h2>
        <span className="moment-row__hint ellipsis">{HINT[row.id]}</span>
      </div>
      <div className="carousel">
        {row.items.slice(0, limit).map(({ title, note }) => (
          <LazyTile
            key={title.key}
            card={titleToCard(title)}
            mine={settings.platforms}
            genreNames={{}}
            width={110}
            captions={(t) => [platformLabel(t ?? title, settings.platforms) ?? '', note]}
          />
        ))}
      </div>
    </section>
  );
}

export function MomentRows() {
  const rows = useMomentRows();
  const [pick, setPickState] = useState<Pick>(loadPick);
  const setPick = (p: Pick) => {
    setPickState(p);
    try {
      localStorage.setItem(PICK_KEY, p);
    } catch {
      /* not remembered */
    }
  };

  return (
    <>
      <div className="moment-picker" role="group" aria-label="Momento">
        {PICKS.map((p) => (
          <Chip key={p} selected={pick === p} onClick={() => setPick(p)}>
            {SHORT[p]}
          </Chip>
        ))}
      </div>
      {rows === null ? (
        <div className="skeleton" style={{ height: 180, borderRadius: 18 }} />
      ) : pick === 'todo' ? (
        rows.filter((r) => r.items.length > 0).map((row) => <Row key={row.id} row={row} limit={IN_ALL} />)
      ) : (
        (() => {
          const row = rows.find((r) => r.id === pick);
          return row && row.items.length > 0 ? (
            <Row row={row} limit={row.items.length} />
          ) : (
            <p className="screen-empty">No he encontrado series seguras para «{SHORT[pick]}» en tus plataformas. Puntúa más series en Gustos y vuelve a mirar.</p>
          );
        })()
      )}
    </>
  );
}

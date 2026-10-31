import { LazyTile } from './LazyTile';
import { useMomentRows } from '../hooks/useMomentRows';
import { titleToCard } from '../logic/cards';
import { platformLabel } from '../logic/platform';
import { useSettings } from '../store/SettingsContext';
import type { MomentId } from '../logic/seriesMoment';
import './MomentRows.css';

// Inicio → Series: Maratón, Entre semana and Para dormir (D39).

const HINT: Record<MomentId, string> = {
  'momento:maraton': 'Cortas, con la trama seguida',
  'momento:entre-semana': 'Largas, con trama media',
  'momento:para-dormirme': 'Un caso por episodio, trama mínima',
};

export function MomentRows() {
  const { settings } = useSettings();
  const rows = useMomentRows();
  if (rows === null) return <div className="skeleton" style={{ height: 180, borderRadius: 18 }} />;
  const shown = rows.filter((r) => r.items.length > 0);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((row) => (
        <section key={row.id} className="inicio__section" aria-labelledby={`row-${row.id}`}>
          <div className="moment-row__head">
            <h2 id={`row-${row.id}`} className="t-section ellipsis">{row.label}</h2>
            <span className="moment-row__hint ellipsis">{HINT[row.id]}</span>
          </div>
          <div className="carousel">
            {row.items.map(({ title, note }) => (
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
      ))}
    </>
  );
}

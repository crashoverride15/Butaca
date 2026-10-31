import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { formatDate, formatEpisode } from '../../logic/format';
import { nextEpisode } from '../../logic/status';
import {
  isSeasonSeen, isSeen, isSeriesSeen, markUpTo, seenAired, toggleEpisode, toggleSeason, toggleSeries,
  type SeasonInfo,
} from '../../logic/watched';
import type { LibraryEntry, Title } from '../../store/types';
import { useToast } from '../../components/Toast';
import { useLongPress } from './useLongPress';

// "Visto" — spec §9.2 (5.5): series with episodes, seasons or the whole series; movies with a date.

type Mode = 'episodio' | 'temporada' | 'serie';

const MAX_VISIBLE_SEASONS = 6;
const RECENT = 3;

interface WatchedProps {
  title: Title;
  entry: LibraryEntry;
  seasons: SeasonInfo[];
  today: string;
  commit: (next: LibraryEntry) => void;
}

function EpisodeCell({ number, state, onTap, onHold }: {
  number: number;
  state: 'seen' | 'next' | 'unseen' | 'future';
  onTap: () => void;
  onHold: () => void;
}) {
  const press = useLongPress(onHold);
  if (state === 'future') return <span className="ep ep--future" aria-label={`Episodio ${number}, aún no emitido`}>{number}</span>;
  return (
    <button
      type="button"
      className={`ep ep--${state} pressable`}
      aria-label={`Episodio ${number}${state === 'seen' ? ', visto' : ''}`}
      aria-pressed={state === 'seen'}
      onClick={() => !press.consumed() && onTap()}
      onPointerDown={press.start}
      onPointerUp={press.cancel}
      onPointerLeave={press.cancel}
      onPointerCancel={press.cancel}
    >
      {number}
    </button>
  );
}

export function SeriesWatched({ title, entry, seasons, today, commit }: WatchedProps) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('episodio');
  const [showAll, setShowAll] = useState(false);
  const next = nextEpisode(title, entry, today);
  const [open, setOpen] = useState<number>(() => next?.season ?? seasons[seasons.length - 1]?.number ?? 1);

  const hidden = !showAll && seasons.length > MAX_VISIBLE_SEASONS;
  const visible = hidden ? seasons.slice(-RECENT) : seasons;
  const done = isSeriesSeen(entry, seasons);

  return (
    <div className="watched">
      <Segmented
        label="Qué marca un toque"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'episodio', label: 'Episodio' },
          { value: 'temporada', label: 'Temporada' },
          { value: 'serie', label: 'Serie entera' },
        ]}
      />
      {mode === 'serie' && (
        <button type="button" className="watched__wide pressable" onClick={() => commit(toggleSeries(entry, seasons))}>
          <Icon name="check" size={18} />
          <span className="ellipsis">{done ? 'Desmarcar serie' : 'Marcar serie completa'}</span>
        </button>
      )}
      <div className="watched__box">
        {visible.map((s) => {
          const seen = entry.seenEpisodes[s.number]?.filter((e) => e <= s.aired).length ?? 0;
          const pct = s.aired > 0 ? Math.min(100, (seen / s.aired) * 100) : 0;
          const isOpen = open === s.number;
          return (
            <div key={s.number} className="season">
              <button
                type="button"
                className="season__row pressable"
                aria-expanded={isOpen}
                onClick={() => (mode === 'temporada' ? commit(toggleSeason(entry, s)) : setOpen(isOpen ? -1 : s.number))}
              >
                <span className={'season__name ellipsis' + (isOpen ? ' is-open' : '')}>Temporada {s.number}</span>
                <span className="season__bar" aria-hidden="true">
                  <span className="season__fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="season__count">{seen}/{s.aired}</span>
                {isSeasonSeen(entry, s) && <span className="visually-hidden">Temporada vista</span>}
              </button>
              {isOpen && mode !== 'temporada' && (
                <div className="season__grid">
                  {Array.from({ length: s.total }, (_, i) => i + 1).map((n) => {
                    const state =
                      n > s.aired ? 'future' : isSeen(entry, s.number, n) ? 'seen' : next && next.season === s.number && next.episode === n ? 'next' : 'unseen';
                    return (
                      <EpisodeCell
                        key={n}
                        number={n}
                        state={state}
                        onTap={() => commit(toggleEpisode(entry, s.number, n))}
                        onHold={() => {
                          commit(markUpTo(entry, seasons, s.number, n));
                          toast.show(`Marcado hasta ${formatEpisode(s.number, n)}`);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {hidden && (
          <button type="button" className="watched__more pressable" onClick={() => setShowAll(true)}>
            Ver las {seasons.length} temporadas
          </button>
        )}
      </div>
    </div>
  );
}

export function seriesCounter(entry: LibraryEntry, seasons: SeasonInfo[]): string {
  const total = seasons.reduce((n, s) => n + s.aired, 0);
  return total === 0 ? '' : `${seenAired(entry, seasons)} de ${total} episodios`;
}

export function MovieWatched({ entry, commit }: { entry: LibraryEntry; commit: (next: LibraryEntry) => void }) {
  const [sheet, setSheet] = useState(false);
  const seen = entry.seenAt !== null;
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button"
        className={'watched__wide pressable' + (seen ? ' is-seen' : '')}
        onClick={() => (seen ? setSheet(true) : commit({ ...entry, seenAt: Date.now() }))}
      >
        <Icon name="check" size={18} color={seen ? 'var(--accent-light)' : 'currentColor'} />
        <span className="ellipsis">{seen ? `Vista el ${formatDate(entry.seenAt!)}` : 'Marcar como vista'}</span>
      </button>
      {sheet && seen && (
        <Sheet title="Vista" onClose={() => setSheet(false)} action="Hecho">
          <label className="field__label" htmlFor="seen-date">Cambiar fecha</label>
          <input
            id="seen-date"
            className="field__input"
            type="date"
            max={toIso(Date.now())}
            value={toIso(entry.seenAt!)}
            onChange={(e) => e.target.value && commit({ ...entry, seenAt: new Date(`${e.target.value}T12:00:00`).getTime() })}
          />
          <button
            type="button"
            className="watched__wide pressable"
            onClick={() => {
              commit({ ...entry, seenAt: null });
              setSheet(false);
            }}
          >
            <span className="ellipsis">Desmarcar</span>
          </button>
        </Sheet>
      )}
    </>
  );
}

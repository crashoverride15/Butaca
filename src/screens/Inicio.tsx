import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HeroCard } from '../components/HeroCard';
import { ContinueCard } from '../components/ContinueCard';
import { LazyTile } from '../components/LazyTile';
import { MomentoSelector, loadMoment } from '../components/MomentoSelector';
import { useToast } from '../components/Toast';
import { useArrivals } from '../hooks/useArrivals';
import { useFeatured } from '../hooks/useFeatured';
import { useTitles } from '../hooks/useTitles';
import { titleToCard } from '../logic/cards';
import { formatEpisode } from '../logic/format';
import { loadFilters, saveFilters } from '../logic/explore';
import { momentTagId, type Moment } from '../logic/featured';
import { platformLabel } from '../logic/platform';
import { relativeArrival } from '../logic/novelties';
import { nextEpisode, todayIso, watchStatus } from '../logic/status';
import { seasonsOf, seenAired, toggleEpisode, totalAired } from '../logic/watched';
import { getAllEntries, saveEntry } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import type { LibraryEntry } from '../store/types';
import './Inicio.css';

// Home — spec §9.1.

function ContinueSection({ moment }: { moment: Moment }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const reload = useCallback(() => void getAllEntries().then(setEntries), []);
  useEffect(reload, [reload]);

  const tvKeys = useMemo(() => (entries ?? []).filter((e) => e.type === 'tv').map((e) => e.key), [entries]);
  const titles = useTitles(tvKeys, { ratings: false });
  const today = todayIso();
  const tag = momentTagId(moment);

  const rows = useMemo(() => {
    return (entries ?? [])
      .filter((e) => e.type === 'tv' && titles[e.key] && watchStatus(titles[e.key], e, today) === 'en_curso')
      .map((entry) => {
        const title = titles[entry.key];
        const seasons = seasonsOf(title, today);
        return { entry, title, next: nextEpisode(title, entry, today), progress: totalAired(seasons) ? seenAired(entry, seasons) / totalAired(seasons) : 0 };
      })
      .filter((r) => r.next)
      .sort((a, b) => Number(b.entry.tagIds.includes(tag)) - Number(a.entry.tagIds.includes(tag)) || b.entry.updatedAt - a.entry.updatedAt);
  }, [entries, titles, today, tag]);

  const play = async (entry: LibraryEntry, next: { season: number; episode: number }) => {
    await saveEntry(toggleEpisode(entry, next.season, next.episode));
    reload();
    toast.show(`${formatEpisode(next.season, next.episode)} marcado`, [
      { label: 'Deshacer', run: () => void saveEntry(entry, entry.updatedAt).then(reload) },
    ]);
  };

  return (
    <section className="inicio__section" aria-labelledby="continue-h">
      <div className="inicio__head">
        <h2 id="continue-h" className="t-section">Sigue viendo</h2>
        <Link to="/lista" state={{ tab: 'en_curso' }} className="inicio__all">Ver todo</Link>
      </div>
      {rows.length === 0 ? (
        <p className="screen-empty">Cuando marques episodios de una serie, aparecerá aquí.</p>
      ) : (
        <div className="carousel">
          {rows.map(({ entry, title, next, progress }) => (
            <ContinueCard key={entry.key} title={title} next={next!} progress={progress} platform={platformLabel(title, settings.platforms)} onPlay={() => void play(entry, next!)} />
          ))}
        </div>
      )}
    </section>
  );
}

function NoveltiesSection({ moment }: { moment: Moment }) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const items = useArrivals({ days: 14, max: 15, moment });
  const now = Date.now();
  if (!items || items.length === 0) return null;
  return (
    <section className="inicio__section" aria-labelledby="new-h">
      <div className="inicio__head">
        <h2 id="new-h" className="t-section ellipsis">Nuevo en tus plataformas</h2>
        <button
          type="button"
          className="inicio__all"
          onClick={() => {
            saveFilters({ ...loadFilters(), order: 'nuevas' });
            navigate('/explorar');
          }}
        >
          Ver todo
        </button>
      </div>
      <div className="carousel">
        {items.map(({ arrival, title }) => (
          <LazyTile
            key={title.key}
            card={titleToCard(title)}
            mine={settings.platforms}
            genreNames={{}}
            width={110}
            isNew
            captions={(t) => [platformLabel(t ?? title, settings.platforms) ?? (settings.platforms.find((p) => p.id === arrival.providerId)?.name ?? ''), relativeArrival(arrival.firstSeen, now)]}
          />
        ))}
      </div>
    </section>
  );
}

export function Inicio() {
  const { settings } = useSettings();
  const [moment, setMoment] = useState<Moment>(() => loadMoment());
  const featured = useFeatured(moment);
  const navigate = useNavigate();

  return (
    <div className="inicio">
      <div className="inicio__halo" aria-hidden="true" />
      <main className="screen">
        <header className="inicio__header">
          <div className="inicio__heading">
            <div className="inicio__logo">
              <span className="inicio__logo-dot" aria-hidden="true" />
              <span className="nowrap">BUTACA</span>
            </div>
            <h1 className="t-greeting ellipsis">¿Qué vemos hoy?</h1>
          </div>
          <Link to="/ajustes" className="inicio__avatar pressable" aria-label="Ajustes">
            O
          </Link>
        </header>

        <MomentoSelector value={moment} onChange={setMoment} />

        <div className={'inicio__hero' + (featured === null ? ' is-loading' : '')}>
          {featured === null ? (
            <div className="skeleton" style={{ height: 220, borderRadius: 22 }} />
          ) : featured.length === 0 ? (
            <div className="screen-empty inicio__empty">
              <p>Etiqueta algunos títulos con «{moment}» para que te recomiende.</p>
              <button type="button" className="btn-primary pressable" style={{ height: 44 }} onClick={() => navigate('/explorar')}>
                <span className="ellipsis">Explorar</span>
              </button>
            </div>
          ) : (
            <HeroCard items={featured} moment={moment} mine={settings.platforms} />
          )}
        </div>

        <ContinueSection moment={moment} />
        <NoveltiesSection moment={moment} />
      </main>
    </div>
  );
}

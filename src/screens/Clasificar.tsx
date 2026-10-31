import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { withEpisodes } from '../api/tmdb';
import { Artwork } from '../components/Artwork';
import { BackButton } from '../components/BackButton';
import { Icon } from '../components/Icon';
import { ScoreSheet } from '../components/ScoreSheet';
import { Segmented } from '../components/Segmented';
import { loadLabelled } from '../hooks/useMomentRows';
import { useTitles } from '../hooks/useTitles';
import { momentsOf, seriesToClassify, toggleMoment } from '../logic/classify';
import { estimateMoment, MOMENT_IDS, type MomentId } from '../logic/seriesMoment';
import { getAllEntries, saveEntry } from '../store/library';
import type { LibraryEntry, Title } from '../store/types';
import './Clasificar.css';

// "Clasificar series" (D42): moment and score for my watched series, one tap each, saved at once.

const SHORT: Record<MomentId, string> = {
  'momento:maraton': 'Maratón',
  'momento:entre-semana': 'Entre semana',
  'momento:para-dormirme': 'Dormir',
  'momento:random': 'Random',
};

type Show = 'pendientes' | 'todas';

export function Clasificar() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  // the ones without a moment when the screen opened: they stay while I classify them, so nothing jumps
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<Show>('pendientes');
  const [guesses, setGuesses] = useState<Record<string, MomentId | null>>({});
  const [scoring, setScoring] = useState<LibraryEntry | null>(null);

  useEffect(() => {
    void getAllEntries().then((all) => {
      const list = seriesToClassify(all);
      setEntries(list);
      setPending(new Set(list.filter((e) => momentsOf(e).length === 0).map((e) => e.key)));
    });
  }, []);

  const keys = useMemo(() => (entries ?? []).map((e) => e.key), [entries === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const titles = useTitles(keys, { ratings: false });

  // what the app would say for the ones without a moment, from the ones that have it
  useEffect(() => {
    if (!entries) return;
    let alive = true;
    void (async () => {
      const labelled = await loadLabelled(entries);
      for (const key of pending) {
        const t = titles[key];
        if (!t || key in guesses) continue;
        const told: Title = await withEpisodes(t);
        if (!alive) return;
        setGuesses((g) => ({ ...g, [key]: estimateMoment(told, labelled).moment }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries === null, Object.keys(titles).length]);

  const save = async (next: LibraryEntry) => {
    setEntries((list) => list?.map((e) => (e.key === next.key ? next : e)) ?? null);
    await saveEntry(next);
  };

  const shown = (entries ?? []).filter((e) => show === 'todas' || pending.has(e.key));
  const left = (entries ?? []).filter((e) => momentsOf(e).length === 0).length;

  return (
    <main className="screen screen--tight">
      <div className="clasificar__head">
        <BackButton />
        <h1 className="t-screen ellipsis">Clasificar series</h1>
      </div>
      <p className="clasificar__intro">Cada serie que clasificas enseña a la app cómo es cada momento.</p>

      <Segmented
        label="Qué series"
        value={show}
        onChange={setShow}
        options={[
          { value: 'pendientes', label: `Sin momento · ${left}` },
          { value: 'todas', label: `Todas · ${entries?.length ?? 0}` },
        ]}
      />

      {entries === null ? (
        <div className="clasificar__list">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 136 }} />)}</div>
      ) : shown.length === 0 ? (
        <p className="screen-empty">{entries.length === 0 ? 'Aún no has visto ninguna serie. Márcalas en Gustos o en su ficha.' : 'Todas tus series tienen momento.'}</p>
      ) : (
        <div className="clasificar__list">
          {shown.map((e) => {
            const t = titles[e.key];
            const mine = momentsOf(e);
            const guess = guesses[e.key];
            const hint = mine.length > 0 ? 'Clasificada' : guess ? `La app cree: ${SHORT[guess]}` : e.key in guesses ? 'La app aún no lo sabe' : '';
            return (
              <article key={e.key} className="clasificar__card">
                <div className="clasificar__top">
                  <Link to={`/titulo/tv/${e.key.split(':')[1]}`} className="clasificar__poster pressable" aria-label={t?.title ?? 'Serie'}>
                    <Artwork id={t?.tmdbId ?? 0} title={t?.title ?? ''} path={t?.posterPath ?? null} kind="poster" className="clasificar__art" />
                  </Link>
                  <div className="clasificar__main">
                    <span className="clasificar__title ellipsis">{t?.title ?? '…'}</span>
                    <span className="clasificar__meta ellipsis">{[t?.year, t?.numberOfSeasons ? `${t.numberOfSeasons} temp.` : null].filter(Boolean).join(' · ')}</span>
                    <span className="clasificar__hint ellipsis">{hint}</span>
                  </div>
                  <button type="button" className="clasificar__score pressable" aria-label={e.myScore === null ? 'Poner nota' : `Tu nota ${e.myScore}, cambiar`} onClick={() => setScoring(e)}>
                    <Icon name="heart" size={12} color={e.myScore === null ? 'var(--muted)' : 'var(--accent-text)'} />
                    <span style={{ color: e.myScore === null ? 'var(--muted)' : 'var(--accent-text)' }}>{e.myScore ?? 'Nota'}</span>
                  </button>
                </div>
                <div className="clasificar__moments" role="group" aria-label="Momento">
                  {MOMENT_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={mine.includes(id)}
                      className={'clasificar__moment pressable' + (mine.includes(id) ? ' is-selected' : '') + (mine.length === 0 && guess === id ? ' is-guess' : '')}
                      onClick={() => void save(toggleMoment(e, id))}
                    >
                      {SHORT[id]}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {scoring && (
        <ScoreSheet score={scoring.myScore} onClose={() => setScoring(null)} onPick={(score) => void save({ ...scoring, myScore: score, updatedAt: Date.now() })} />
      )}
    </main>
  );
}

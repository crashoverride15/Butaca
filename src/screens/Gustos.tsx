import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTitle } from '../api/tmdb';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { SeriesAnswerSheet } from '../components/SeriesAnswerSheet';
import { SwipeCard, type SwipeCardHandle, type Throw } from '../components/SwipeCard';
import { useToast } from '../components/Toast';
import { useDeck } from '../hooks/useDeck';
import { useKind } from '../hooks/useKind';
import { KINDS } from '../logic/featured';
import { markNotSeen, markSeen, markSeriesSeen } from '../logic/gustos';
import { todayIso } from '../logic/status';
import { seasonsOf, type SeasonInfo } from '../logic/watched';
import { emptyEntry, getEntry, saveEntry } from '../store/library';
import { createTag, tagId } from '../store/tags';
import { useSettings } from '../store/SettingsContext';
import type { TitleCard } from '../store/types';
import './Gustos.css';

// Gustos (D28): the app asks about titles on my platforms — seen (with a score) or not seen — and learns my taste.

const SCORES = Array.from({ length: 10 }, (_, i) => i + 1);

export function Gustos() {
  const { settings } = useSettings();
  const [kind, setKind] = useKind();
  const deck = useDeck(kind);
  const toast = useToast();
  const navigate = useNavigate();
  const card = useRef<SwipeCardHandle>(null);
  const [score, setScore] = useState<number | null>(null);
  // a series answered "seen" waits for the sheet; `nonce` brings the card back if it is cancelled
  const [pending, setPending] = useState<{ card: TitleCard; seasons: SeasonInfo[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  const top = deck.cards[0];

  useEffect(() => setScore(null), [top?.key]);

  const finish = async (c: TitleCard, before: Awaited<ReturnType<typeof getEntry>>, next: ReturnType<typeof markNotSeen>, label: string) => {
    try {
      await saveEntry(next);
    } catch (e) {
      console.warn('[butaca] could not save the answer', e);
      toast.show('No se ha podido guardar. Prueba otra vez.');
      deck.restore(c);
      setNonce((n) => n + 1);
      return;
    }
    deck.answered();
    toast.show(label, [
      {
        label: 'Deshacer',
        run: () => {
          void saveEntry(before ?? emptyEntry(c.key, c.type), before?.updatedAt).then(() => deck.restore(c));
        },
      },
    ]);
  };

  const decide = async (c: TitleCard, dir: Throw) => {
    const before = await getEntry(c.key);
    const base = before ?? emptyEntry(c.key, c.type);
    if (dir === 'left') return finish(c, before, markNotSeen(base), 'No vista');
    try {
      if (c.type === 'tv') {
        // a series needs to know how far I got: ask first
        setPending({ card: c, seasons: seasonsOf(await getTitle('tv', c.tmdbId), todayIso()) });
        return;
      }
      await finish(c, before, markSeen(base, null, score), score ? `Vista · ${score}` : 'Vista, sin nota');
    } catch (e) {
      console.warn('[butaca] could not load the series', e);
      toast.show('No se ha podido cargar la serie. Prueba otra vez.');
      setNonce((n) => n + 1);
    }
  };

  const saveSeries = async (upTo: number | null, styles: string[]) => {
    if (!pending) return;
    const { card: c, seasons } = pending;
    setPending(null);
    for (const name of styles) await createTag(name, 'momento'); // already there: ignored
    const before = await getEntry(c.key);
    const next = markSeriesSeen(before ?? emptyEntry(c.key, c.type), seasons, upTo, score, styles.map((n) => tagId('momento', n)));
    const where = upTo === null ? 'entera' : `hasta T${upTo}`;
    await finish(c, before, next, `Vista ${where}${score ? ` · ${score}` : ''}`);
  };

  return (
    <main className="screen screen--tight gustos">
      <header className="gustos__head">
        <h1 className="t-screen ellipsis">Tus gustos</h1>
        <p className="gustos__hint ellipsis">Derecha, la he visto · Izquierda, no</p>
      </header>
      <Segmented label="Tipo" options={KINDS} value={kind} onChange={setKind} />

      {settings.platforms.length === 0 ? (
        <div className="screen-empty">
          <p>Elige tus plataformas en Ajustes y te enseño títulos que puedes ver.</p>
          <Link to="/ajustes" className="gustos__link">Ir a Ajustes</Link>
        </div>
      ) : !top && deck.loading ? (
        <div className="gustos__stage"><div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 22 }} /></div>
      ) : !top ? (
        <div className="screen-empty">
          <p>Has repasado todo lo de tus plataformas por ahora. Vuelve otro día o cambia entre películas y series.</p>
        </div>
      ) : (
        <>
          <div className="gustos__stage">
            <SwipeCard
              key={`${top.key}:${nonce}`}
              ref={card}
              rightLabel="VISTA"
              leftLabel="NO VISTA"
              onTap={() => navigate(`/titulo/${top.type}/${top.tmdbId}`)}
              onThrow={(dir) => void decide(top, dir)}
            >
              <Artwork id={top.tmdbId} title={top.title} path={top.posterPath} kind="poster" className="gustos__poster" />
              <div className="gustos__shade" />
              {top.posterPath && (
              <div className="gustos__caption">
                <span className="gustos__title">{top.title}</span>
                <span className="gustos__meta ellipsis">{[top.year, top.type === 'tv' ? 'Serie' : 'Película'].filter(Boolean).join(' · ')}</span>
              </div>
              )}
            </SwipeCard>
          </div>

          <div className="gustos__scores" role="group" aria-label="Tu nota">
            {SCORES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={score === n}
                className={'gustos__score pressable' + (score === n ? ' is-selected' : '')}
                onClick={() => setScore(score === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="gustos__actions">
            <button type="button" className="gustos__btn pressable" onClick={() => card.current?.fling('left')}>
              <span className="gustos__circle"><Icon name="close" size={26} /></span>
              <span>No vista</span>
            </button>
            <button type="button" className="gustos__btn gustos__btn--yes pressable" onClick={() => card.current?.fling('right')}>
              <span className="gustos__circle"><Icon name="check" size={26} /></span>
              <span>Vista</span>
            </button>
          </div>
        </>
      )}
      {pending && <SeriesAnswerSheet title={pending.card.title} seasons={pending.seasons} onSave={(u, st) => void saveSeries(u, st)} onCancel={() => { setPending(null); setNonce((n) => n + 1); }} />}
    </main>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTitle } from '../api/tmdb';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { SwipeCard, type SwipeCardHandle, type Throw } from '../components/SwipeCard';
import { useToast } from '../components/Toast';
import { useDeck } from '../hooks/useDeck';
import { useKind } from '../hooks/useKind';
import { KINDS } from '../logic/featured';
import { markNotSeen, markSeen } from '../logic/gustos';
import { todayIso } from '../logic/status';
import { seasonsOf } from '../logic/watched';
import { emptyEntry, getEntry, saveEntry } from '../store/library';
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
  const top = deck.cards[0];

  useEffect(() => setScore(null), [top?.key]);

  const decide = async (c: TitleCard, dir: Throw) => {
    const before = await getEntry(c.key);
    const base = before ?? emptyEntry(c.key, c.type);
    try {
      let next;
      if (dir === 'right') {
        const seasons = c.type === 'tv' ? seasonsOf(await getTitle('tv', c.tmdbId), todayIso()) : null;
        next = markSeen(base, seasons, score);
      } else next = markNotSeen(base);
      await saveEntry(next);
    } catch (e) {
      console.warn('[butaca] could not save the answer', e);
      toast.show('No se ha podido guardar. Prueba otra vez.');
      deck.restore(c);
      return;
    }
    deck.answered();
    const label = dir === 'right' ? (score ? `Vista · ${score}` : 'Vista, sin nota') : 'No vista';
    toast.show(label, [
      {
        label: 'Deshacer',
        run: () => {
          void saveEntry(before ?? emptyEntry(c.key, c.type), before?.updatedAt).then(() => deck.restore(c));
        },
      },
    ]);
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
              key={top.key}
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
    </main>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { platformColor, shortPlatformName } from '../api/tmdb';
import { Artwork } from '../components/Artwork';
import { BackButton } from '../components/BackButton';
import { Icon } from '../components/Icon';
import { RatingStrip } from '../components/RatingStrip';
import { ScoreSheet } from '../components/ScoreSheet';
import { TagSheet } from '../components/TagSheet';
import { useToast } from '../components/Toast';
import { metaLine } from '../logic/format';
import { todayIso } from '../logic/status';
import { seasonsOf } from '../logic/watched';
import { useSettings } from '../store/SettingsContext';
import { createTag, listTags, tagId } from '../store/tags';
import type { LibraryEntry, MediaType, Tag, Title } from '../store/types';
import { TagsBlock } from './ficha/TagsBlock';
import { useEntry } from './ficha/useEntry';
import { useTitle } from './ficha/useTitle';
import { Similar } from './ficha/Similar';
import { MovieWatched, SeriesWatched, seriesCounter } from './ficha/Watched';
import './Ficha.css';

// Title detail — spec §9.2.

type TitleSize = 'xl' | 'md' | 'clamp';

/** 32 px on one line; if it does not fit 26 px; if not, two lines (spec 9.2). */
function FitTitle({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState<TitleSize>('xl');

  useEffect(() => setSize('xl'), [text]);
  useEffect(() => {
    void document.fonts?.ready.then(() => setSize('xl'));
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || size === 'clamp') return;
    if (el.scrollWidth > el.clientWidth + 1) setSize(size === 'xl' ? 'md' : 'clamp');
  }, [size, text]);

  return (
    <h1 ref={ref} className={`ficha__title ficha__title--${size}`}>
      {text}
    </h1>
  );
}

function Synopsis({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  if (!text.trim()) return null;
  return (
    <div className="ficha__synopsis">
      <p ref={ref} className={expanded ? '' : 'is-clamped'}>{text}</p>
      {cut && !expanded && (
        <button type="button" className="ficha__more pressable" onClick={() => setExpanded(true)}>Más</button>
      )}
    </div>
  );
}

function FichaBody({ title }: { title: Title }) {
  const toast = useToast();
  const { settings } = useSettings();
  const { entry, commit } = useEntry(title.key, title.type);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sheet, setSheet] = useState<'tags' | 'score' | null>(null);
  const today = todayIso();
  const seasons = useMemo(() => (title.type === 'tv' ? seasonsOf(title, today) : []), [title, today]);

  useEffect(() => void listTags().then(setTags), []);

  const mine = new Set(settings.platforms.map((p) => p.id));
  const platforms = title.providers.filter((p) => mine.has(p.id));

  const hasMoment = entry.tagIds.some((id) => id.startsWith('momento:'));
  const hasWatched = entry.seenAt !== null || Object.values(entry.seenEpisodes).some((e) => e.length > 0);

  /** Marking something for the first time on a title with no moment asks for one (spec 9.2). */
  const commitWatched = (next: LibraryEntry) => {
    const nextWatched = next.seenAt !== null || Object.values(next.seenEpisodes).some((e) => e.length > 0);
    void commit(next);
    if (!hasWatched && nextWatched && !hasMoment) {
      const pick = (name: string) => ({
        label: name === 'Para dormirme' ? 'Dormir' : name,
        run: () => void commit({ ...next, tagIds: [...next.tagIds, tagId('momento', name)] }),
      });
      toast.show('¿Para qué momento?', [pick('Noche'), pick('Entre semana'), pick('Para dormirme')]);
    }
  };

  const toggleSaved = () => {
    const on = !entry.inWatchlist;
    void commit({ ...entry, inWatchlist: on });
    toast.show(on ? 'Guardado en Por ver' : 'Quitado de Por ver');
  };

  const toggleTag = (id: string) => {
    const has = entry.tagIds.includes(id);
    void commit({ ...entry, tagIds: has ? entry.tagIds.filter((t) => t !== id) : [...entry.tagIds, id] });
  };

  const createManualTag = async (name: string, group: 'estilo' | 'libre' | 'momento'): Promise<string | null> => {
    const result = await createTag(name, group);
    if (!result.ok) return result.reason === 'duplicate' ? 'Ya existe un tag con ese nombre.' : 'Escribe un nombre.';
    setTags(await listTags());
    toggleTag(result.tag.id);
    return null;
  };

  return (
    <div className="ficha">
      <div className="ficha__backdrop">
        <Artwork id={title.tmdbId} title={title.title} path={title.backdropPath} kind="backdrop" ghost={title.title} className="ficha__backdrop-art" />
        <div className="ficha__backdrop-shade" />
        <div className="ficha__floating">
          <BackButton glass />
          <button
            type="button"
            className={'ficha__save pressable' + (entry.inWatchlist ? ' is-on' : '')}
            aria-label={entry.inWatchlist ? 'Quitar de Por ver' : 'Guardar en Por ver'}
            aria-pressed={entry.inWatchlist}
            onClick={toggleSaved}
          >
            <Icon name="bookmark" size={20} color={entry.inWatchlist ? '#fff' : 'currentColor'} />
          </button>
        </div>
      </div>

      <div className="ficha__content">
        <header className="ficha__header">
          <Artwork id={title.tmdbId} title={title.title} path={title.posterPath} kind="poster" className="ficha__poster" />
          <div className="ficha__heading">
            <FitTitle text={title.title} />
            <p className="ficha__meta ellipsis">{metaLine(title)}</p>
            <div className="ficha__pills">
              {platforms.length === 0 ? (
                <span className="pill pill--none">No está en tus plataformas</span>
              ) : (
                platforms.map((p) => (
                  <span key={p.id} className="pill">
                    <span className="pill__dot" style={{ background: platformColor(p.name) }} />
                    <span className="ellipsis">{shortPlatformName(p.name)}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </header>

        <RatingStrip imdb={title.ratings.imdb} rt={title.ratings.rt} myScore={entry.myScore} onScore={() => setSheet('score')} />

        <Synopsis text={title.overview} />

        <section className="ficha__section" aria-labelledby="tags-h">
          <div className="ficha__section-head">
            <h2 id="tags-h" className="t-section">Tags</h2>
            <button type="button" className="chip-add chip-add--small pressable" onClick={() => setSheet('tags')}>+ Añadir tag</button>
          </div>
          <TagsBlock title={title} allTags={tags} assigned={entry.tagIds} onOpenSheet={() => setSheet('tags')} />
        </section>

        <section className="ficha__section" aria-labelledby="seen-h">
          <div className="ficha__section-head">
            <h2 id="seen-h" className="t-section">Visto</h2>
            {title.type === 'tv' && <span className="ficha__counter ellipsis">{seriesCounter(entry, seasons)}</span>}
          </div>
          {title.type === 'tv' ? (
            seasons.length > 0 ? (
              <SeriesWatched title={title} entry={entry} seasons={seasons} today={today} commit={commitWatched} />
            ) : (
              <p className="screen-empty">TMDB aún no tiene temporadas de esta serie.</p>
            )
          ) : (
            <MovieWatched entry={entry} commit={commitWatched} />
          )}
        </section>

        <Similar title={title} mine={settings.platforms} />
      </div>

      {sheet === 'score' && (
        <ScoreSheet score={entry.myScore} onPick={(score) => void commit({ ...entry, myScore: score })} onClose={() => setSheet(null)} />
      )}
      {sheet === 'tags' && (
        <TagSheet titleName={title.title} tags={tags} assigned={entry.tagIds} onToggle={toggleTag} onCreate={createManualTag} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

export function Ficha() {
  const params = useParams();
  const type: MediaType | null = params.type === 'movie' || params.type === 'tv' ? params.type : null;
  const id = Number(params.id);
  const valid = type !== null && Number.isInteger(id) && id > 0;
  const { title, error, retry } = useTitle(type ?? 'movie', valid ? id : 0);

  if (!valid) {
    return (
      <main className="screen">
        <BackButton />
        <p className="screen-empty">Ese título no existe.</p>
      </main>
    );
  }
  if (error && !title) {
    return (
      <main className="screen">
        <BackButton />
        <p className="screen-empty">{error}</p>
        <button type="button" className="btn-primary pressable" onClick={retry}><span className="ellipsis">Reintentar</span></button>
      </main>
    );
  }
  if (!title) {
    return (
      <div className="ficha">
        <div className="ficha__backdrop"><div className="skeleton" style={{ height: '100%', borderRadius: 0 }} /></div>
        <div className="ficha__content">
          <div className="skeleton" style={{ height: 156 }} />
          <div className="skeleton" style={{ height: 82 }} />
          <div className="skeleton" style={{ height: 96 }} />
        </div>
      </div>
    );
  }
  return <FichaBody key={title.key} title={title} />;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discover, getGenres, personCredits, searchMulti, type PersonHit } from '../api/tmdb';
import { Icon } from '../components/Icon';
import { LazyTile } from '../components/LazyTile';
import { Segmented } from '../components/Segmented';
import { titleToCard } from '../logic/cards';
import {
  discoverParams, filterCards, genreSetsForTags, loadFilters, localOnlyTags, orderByAffinity, orderByArrival,
  profileOf, saveFilters, type ExploreFilters, type Order,
} from '../logic/explore';
import { watchStatus, todayIso } from '../logic/status';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { firstSeenMap } from '../store/snapshots';
import { listTags } from '../store/tags';
import { getTitleCached } from '../store/titles';
import type { LibraryEntry, Tag, Title, TitleCard } from '../store/types';
import { FiltersPanel } from './explorar/FiltersPanel';
import './Explorar.css';

// Explore — spec §9.3.

const SEARCH_DELAY = 350;

export function Explorar() {
  const { settings } = useSettings();
  const mine = settings.platforms;
  const [filters, setFilters] = useState<ExploreFilters>(() => loadFilters());
  const [tags, setTags] = useState<Tag[]>([]);
  const [library, setLibrary] = useState<Record<string, LibraryEntry>>({});
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<TitleCard[]>([]);
  const [paging, setPaging] = useState({ page: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [person, setPerson] = useState<PersonHit | null>(null);
  const [fromList, setFromList] = useState<Title[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const searching = query.trim().length >= 2;
  const today = todayIso();

  useEffect(() => saveFilters(filters), [filters]);
  useEffect(() => {
    void listTags().then(setTags);
    void getAllEntries().then((es) => setLibrary(Object.fromEntries(es.map((e) => [e.key, e]))));
  }, []);
  useEffect(() => {
    void getGenres(filters.type).then(setGenres).catch(() => undefined);
  }, [filters.type]);

  const genreNames = useMemo(() => Object.fromEntries(genres.map((g) => [g.id, g.name])), [genres]);
  const chosenTags = useMemo(() => tags.filter((t) => filters.tagIds.includes(t.id)), [tags, filters.tagIds]);
  const genreSets = useMemo(() => genreSetsForTags(chosenTags, genres, filters.type), [chosenTags, genres, filters.type]);
  const localTags = useMemo(() => localOnlyTags(chosenTags, genres, filters.type), [chosenTags, genres, filters.type]);

  const isSeen = useCallback(
    (e: LibraryEntry) => {
      const t = e.type === 'movie' ? e.seenAt !== null : Object.values(e.seenEpisodes).some((x) => x.length > 0);
      return t;
    },
    [],
  );

  // Titles of mine that carry the tags TMDB cannot filter by: shown first, and they steer the order.
  useEffect(() => {
    let alive = true;
    if (localTags.length === 0) {
      setFromList([]);
      return;
    }
    const matching = Object.values(library).filter((e) => e.type === filters.type && localTags.every((t) => e.tagIds.includes(t.id)));
    void Promise.all(matching.map((e) => getTitleCached(e.key))).then((ts) => alive && setFromList(ts.filter((t): t is Title => Boolean(t))));
    return () => {
      alive = false;
    };
  }, [localTags, library, filters.type]);

  const fetchPage = useCallback(
    async (page: number, my: number) => {
      setLoading(true);
      setError(false);
      try {
        const res = await discover(filters.type, discoverParams(filters, mine, genreSets), page);
        if (my !== run.current) return;
        let items = filterCards(res.items, filters, library, isSeen, genreSets);
        if (filters.order === 'nuevas') items = orderByArrival(items, await firstSeenMap(filters.type));
        if (fromList.length > 0) items = orderByAffinity(items, profileOf(fromList));
        if (my !== run.current) return;
        setCards((prev) => (page === 1 ? items : [...prev, ...items.filter((c) => !prev.some((p) => p.key === c.key))]));
        setPaging({ page: res.page, totalPages: res.totalPages });
      } catch {
        if (my === run.current) setError(true);
      } finally {
        if (my === run.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, mine, genreSets, library, fromList],
  );

  // New query or new filters: start again from page 1.
  const catalogueKey = JSON.stringify([filters, genreSets, mine.map((p) => p.id), fromList.length]);
  useEffect(() => {
    if (searching) return;
    run.current++;
    setPerson(null);
    setCards([]);
    setPaging({ page: 0, totalPages: 1 });
    void fetchPage(1, run.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogueKey, searching]);

  // Search with debounce.
  useEffect(() => {
    if (!searching) return;
    const my = ++run.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchMulti(query.trim());
        if (my !== run.current) return;
        setPerson(res.person);
        setPaging({ page: 1, totalPages: 1 });
        setCards(res.person ? await personCredits(res.person.id) : res.cards);
      } catch {
        if (my === run.current) setError(true);
      } finally {
        if (my === run.current) setLoading(false);
      }
    }, SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [query, searching]);

  // Infinite scroll: next page when the end is within 600 px.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || searching) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading && paging.page > 0 && paging.page < paging.totalPages) {
          void fetchPage(paging.page + 1, run.current);
        }
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [paging, loading, searching, fetchPage]);

  const countText = paging.totalPages > 5 && !searching ? 'Más de 100' : `${cards.length} ${cards.length === 1 ? 'resultado' : 'resultados'}`;
  const setOrder = (order: Order) => setFilters({ ...filters, order });

  return (
    <main className="screen screen--tight">
      <h1 className="t-screen ellipsis">Explorar</h1>

      <div className="search">
        <Icon name="search" size={18} color="var(--muted)" />
        <label className="visually-hidden" htmlFor="search">Buscar título, actor o director</label>
        <input id="search" className="search__input" type="search" inputMode="search" enterKeyHint="search" placeholder="Título, actor o director" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" autoCorrect="off" />
        {query && (
          <button type="button" className="search__clear pressable" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>×</button>
        )}
      </div>

      {!searching && <FiltersPanel filters={filters} onChange={setFilters} mine={mine} tags={tags} />}

      {!searching && fromList.length > 0 && (
        <section className="from-list" aria-label="De tu lista con estos tags">
          <h2 className="t-section">De tu lista con estos tags</h2>
          <div className="carousel">
            {fromList.map((t) => (
              <LazyTile key={t.key} card={titleToCard(t)} mine={mine} genreNames={genreNames} width={110} seen={library[t.key] ? isSeen(library[t.key]) && watchStatus(t, library[t.key], today) === 'vista' : false} />
            ))}
          </div>
        </section>
      )}

      {person && <h2 className="t-section ellipsis">Títulos de {person.name}</h2>}

      <div className="results-bar">
        <span className="results-bar__count">{loading && cards.length === 0 ? 'Buscando…' : countText}</span>
        {!searching && (
          <Segmented
            label="Orden"
            value={filters.order}
            onChange={setOrder}
            options={[{ value: 'nuevas', label: 'Recién llegadas' }, { value: 'nota', label: 'Mejor nota' }]}
          />
        )}
      </div>

      {error && <p className="screen-empty">No se ha podido cargar. Comprueba la conexión.</p>}
      {!error && !loading && cards.length === 0 && (
        <p className="screen-empty">Nada con estos filtros. Prueba a bajar la nota mínima o añadir otra época.</p>
      )}

      <div className="grid">
        {cards.map((c) => (
          <LazyTile key={c.key} card={c} mine={mine} genreNames={genreNames} minImdb={searching ? undefined : filters.minImdb} seen={Boolean(library[c.key] && isSeen(library[c.key]))} />
        ))}
        {loading && Array.from({ length: cards.length === 0 ? 9 : 3 }, (_, i) => (
          <div key={`s${i}`} className="skeleton grid__skeleton" />
        ))}
      </div>
      <div ref={sentinel} className="grid__end" />
    </main>
  );
}

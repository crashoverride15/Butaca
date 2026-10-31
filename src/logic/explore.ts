import type { LibraryEntry, MediaType, Provider, Tag, Title, TitleCard } from '../store/types';

// Explorar — spec §9.3: filters, how they become a TMDB query, and what is filtered locally. Pure.

export const EPOCHS = ['80s', '90s', '00s', '10s', '20s'] as const;
export type Epoch = (typeof EPOCHS)[number];
export type Order = 'nuevas' | 'nota';
/** animation: every title, none of it, or only it */
export type Animation = 'any' | 'no' | 'only';
export const ANIMATION_GENRE = 16;

export interface ExploreFilters {
  type: MediaType;
  /** chosen platform ids; null = all of mine (the default) */
  platformIds: number[] | null;
  epochs: Epoch[];
  tagIds: string[];
  minImdb: number;
  hideSeen: boolean;
  order: Order;
  animation: Animation;
}

export const DEFAULT_FILTERS: ExploreFilters = {
  type: 'movie',
  platformIds: null,
  epochs: [],
  tagIds: [],
  minImdb: 7.0,
  hideSeen: true,
  order: 'nuevas',
  animation: 'any',
};

export const FILTERS_KEY = 'butaca.filtros';

export function loadFilters(storage: Pick<Storage, 'getItem'> = localStorage): ExploreFilters {
  try {
    const raw = JSON.parse(storage.getItem(FILTERS_KEY) ?? 'null') as Partial<ExploreFilters> | null;
    return { ...DEFAULT_FILTERS, ...raw };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(f: ExploreFilters, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* private mode: filters just are not remembered */
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Style tags whose TMDB genre has another name (or none) for series: TMDB's series genres are different from its film ones. */
const GENRE_SYNONYMS: Record<string, { movie: number[]; tv: number[] }> = {
  accion: { movie: [28], tv: [10759] }, // series: "Action & Adventure"
  thriller: { movie: [53], tv: [9648, 80] }, // series have no thriller: mystery or crime
  policiaca: { movie: [80], tv: [80] },
  misterio: { movie: [9648], tv: [9648] },
  comedia: { movie: [35], tv: [35] },
};

/** For each style tag TMDB can filter by, the genre ids that satisfy it (any of them). Tags it cannot filter by are left out. */
export function genreSetsForTags(tags: Tag[], genres: { id: number; name: string }[], type: 'movie' | 'tv' = 'movie'): number[][] {
  const sets: number[][] = [];
  for (const t of tags) {
    if (t.group !== 'estilo') continue;
    const synonym = GENRE_SYNONYMS[norm(t.name)]?.[type];
    const byName = genres.find((g) => norm(g.name) === norm(t.name));
    const ids = synonym ?? (byName ? [byName.id] : []);
    if (ids.length > 0) sets.push(ids);
  }
  return sets;
}

/** Tags that cannot be asked of TMDB (moment, free, own styles): they reorder instead. */
export const localOnlyTags = (tags: Tag[], genres: { id: number; name: string }[], type: 'movie' | 'tv' = 'movie'): Tag[] =>
  tags.filter((t) => genreSetsForTags([t], genres, type).length === 0);

const decadeStart = (e: Epoch): number => (e === '80s' ? 1980 : e === '90s' ? 1990 : e === '00s' ? 2000 : e === '10s' ? 2010 : 2020);

export const yearInEpochs = (year: number | null, epochs: Epoch[]): boolean =>
  epochs.length === 0 || (year !== null && epochs.some((e) => year >= decadeStart(e) && year <= decadeStart(e) + 9));

export function discoverParams(
  f: ExploreFilters,
  mine: Provider[],
  genreSets: number[][],
): Record<string, string | number> {
  const chosen = (f.platformIds ?? mine.map((p) => p.id)).filter((id) => mine.some((p) => p.id === id));
  const ids = chosen.length > 0 ? chosen : mine.map((p) => p.id);
  const params: Record<string, string | number> = {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate',
    include_adult: 'false',
    'vote_count.gte': 100,
    'vote_average.gte': Math.max(0, f.minImdb - 1),
    sort_by: f.order === 'nota' ? 'vote_average.desc' : 'popularity.desc',
  };
  if (ids.length > 0) params.with_watch_providers = ids.join('|');
  // every tag must hold: with one genre per tag TMDB can do the AND; otherwise it narrows by any and filterCards finishes the job
  if (f.animation === 'no') params.without_genres = ANIMATION_GENRE;
  if (genreSets.length > 0) params.with_genres = genreSets.every((g) => g.length === 1) ? genreSets.map((g) => g[0]).join(',') : [...new Set(genreSets.flat())].join('|');
  if (f.epochs.length > 0) {
    const starts = f.epochs.map(decadeStart);
    const from = `${Math.min(...starts)}-01-01`;
    const to = `${Math.max(...starts) + 9}-12-31`;
    if (f.type === 'movie') {
      params['primary_release_date.gte'] = from;
      params['primary_release_date.lte'] = to;
    } else {
      params['first_air_date.gte'] = from;
      params['first_air_date.lte'] = to;
    }
  }
  return params;
}

/** Number of filters that differ from the default: "Filtros · 4 activos". */
export function activeCount(f: ExploreFilters): number {
  return (
    (f.platformIds !== null ? 1 : 0) +
    (f.epochs.length > 0 ? 1 : 0) +
    (f.tagIds.length > 0 ? 1 : 0) +
    (f.minImdb !== DEFAULT_FILTERS.minImdb ? 1 : 0) +
    (f.hideSeen !== DEFAULT_FILTERS.hideSeen ? 1 : 0) +
    (f.animation !== DEFAULT_FILTERS.animation ? 1 : 0)
  );
}

export interface ResultRef {
  card: TitleCard;
}

/** Local filters applied to a page of results: epochs between chosen decades, seen titles and every chosen genre tag. */
export function filterCards(cards: TitleCard[], f: ExploreFilters, library: Record<string, LibraryEntry>, isSeen: (e: LibraryEntry) => boolean, genreSets: number[][] = []): TitleCard[] {
  return cards.filter(
    (c) =>
      yearInEpochs(c.year, f.epochs) &&
      !(f.hideSeen && library[c.key] && isSeen(library[c.key])) &&
      !(f.animation === 'no' && c.genreIds.includes(ANIMATION_GENRE)) &&
      genreSets.every((set) => set.some((id) => c.genreIds.includes(id))),
  );
}

/** "Recién llegadas": by when it appeared on my platforms; unknown ones last, by release year. */
export function orderByArrival(cards: TitleCard[], firstSeen: Record<number, number>): TitleCard[] {
  return [...cards].sort((a, b) => {
    const fa = firstSeen[a.tmdbId];
    const fb = firstSeen[b.tmdbId];
    if (fa !== undefined && fb !== undefined) return fb - fa;
    if (fa !== undefined) return -1;
    if (fb !== undefined) return 1;
    return (b.year ?? 0) - (a.year ?? 0);
  });
}

export interface Profile {
  genreIds: Record<number, number>;
  decades: Record<number, number>;
}

/** What my titles with the chosen tags have in common (genres and decades), to reorder results by affinity. */
export function profileOf(titles: Title[]): Profile {
  const profile: Profile = { genreIds: {}, decades: {} };
  for (const t of titles) {
    for (const g of t.genres) profile.genreIds[g.id] = (profile.genreIds[g.id] ?? 0) + 1;
    if (t.year) profile.decades[Math.floor(t.year / 10)] = (profile.decades[Math.floor(t.year / 10)] ?? 0) + 1;
  }
  return profile;
}

export function affinity(card: TitleCard, profile: Profile): number {
  const genres = card.genreIds.reduce((n, id) => n + (profile.genreIds[id] ? 2 : 0), 0);
  const decade = card.year ? Math.floor(card.year / 10) : null;
  const decadeScore = decade === null ? 0 : profile.decades[decade] ? 3 : profile.decades[decade - 1] || profile.decades[decade + 1] ? 1 : 0;
  return genres + decadeScore;
}

export const orderByAffinity = (cards: TitleCard[], profile: Profile): TitleCard[] =>
  cards
    .map((c, i) => ({ c, i, s: affinity(c, profile) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);

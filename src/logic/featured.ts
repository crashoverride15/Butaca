import { myProviders } from './platform';
import { buildPool, plotScore, type PlotPool, type Ref } from './similar';
import type { LibraryEntry, Provider, Title } from '../store/types';

// Featured title on Home, by kind (movies / series) — spec §7.2 reworked (D28). Pure: the caller loads the data.

export type Kind = 'movie' | 'tv';
export const KINDS: { value: Kind; label: string }[] = [
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
];
export const EYEBROW: Record<Kind, string> = { movie: 'PELÍCULA PARA TI', tv: 'SERIE PARA TI' };

export interface Profile {
  refs: Ref[];
  topGenres: number[];
  decades: number[];
  /** the predominant kind in the profile */
  type: 'movie' | 'tv' | null;
}

const MAX_CANDIDATES = 5;
/** At most this many of the five may come from the same title of mine (D35). */
const MAX_PER_SOURCE = 2;

function profileFromEntries(chosen: LibraryEntry[], titles: Record<string, Title>): Profile {
  const refs: Ref[] = [...chosen].sort((a, b) => (b.myScore ?? 0) - (a.myScore ?? 0)).filter((e) => titles[e.key]).map((e) => ({ title: titles[e.key], tagIds: e.tagIds }));
  const genreCount = new Map<number, number>();
  const decades = new Set<number>();
  let movies = 0;
  let tv = 0;
  for (const { title } of refs) {
    for (const g of title.genres) genreCount.set(g.id, (genreCount.get(g.id) ?? 0) + 1);
    if (title.year) decades.add(Math.floor(title.year / 10));
    if (title.type === 'movie') movies++;
    else tv++;
  }
  const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
  return { refs, topGenres, decades: [...decades], type: refs.length === 0 ? null : movies >= tv ? 'movie' : 'tv' };
}

/** Profile of one kind: my titles of that kind rated 7 or more. */
export const buildKindProfile = (kind: Kind, entries: LibraryEntry[], titles: Record<string, Title>): Profile =>
  profileFromEntries(entries.filter((e) => e.type === kind && (e.myScore ?? 0) >= 7), titles);

/** Profile of my whole library: everything rated 7 or more (spec §9.5). */
export const buildLikedProfile = (entries: LibraryEntry[], titles: Record<string, Title>): Profile =>
  profileFromEntries(entries.filter((e) => (e.myScore ?? 0) >= 7), titles);

export interface FeaturedItem {
  title: Title;
  pill: string;
}

/** How much a title I rated pulls: 7 is a nudge, 10 is the whole weight. */
const weightOf = (score: number | null): number => Math.max(0.25, ((score ?? 7) - 6) / 4);

interface Taste {
  score: number;
  /** the title of mine that explains it best */
  source: Ref | null;
}

/**
 * How well a title fits my taste (D35): for each title I rated 7 or more, its plot score against the candidate
 * (TMDB recommendation, rare shared themes, synopsis), weighted by my score. Several of my favourites pointing at
 * the same title add up. Zero when no favourite of mine links to it.
 */
function tasteOf(profile: Profile, entryScores: Record<string, number | null>, title: Title, tagIds: string[], pool: PlotPool): Taste {
  const c: Ref = { title, tagIds };
  let score = 0;
  let best = 0;
  let source: Ref | null = null;
  for (const ref of profile.refs) {
    const r = plotScore(c, ref, ref.title.recommendations.includes(title.key), ref.title.similar.includes(title.key), pool);
    if (!r.linked) continue;
    const part = weightOf(entryScores[ref.title.key] ?? null) * Math.max(0, r.score);
    score += part;
    if (part > best) {
      best = part;
      source = ref;
    }
  }
  return { score, source };
}

/** How much a title I rated low pushes away: 4 is a nudge, 1 the whole weight (D41). */
const dislikeOf = (score: number): number => (5 - score) / 4;
/** Rated this or lower: I did not like it. */
export const DISLIKE_MAX = 4;

/** What my low-rated titles (1 to 4) say against a candidate: their plot score, weighted by how low I rated them. */
function distasteOf(disliked: Ref[], entryScores: Record<string, number | null>, title: Title, pool: PlotPool): number {
  let score = 0;
  for (const ref of disliked) {
    const r = plotScore({ title, tagIds: [] }, ref, ref.title.recommendations.includes(title.key), ref.title.similar.includes(title.key), pool);
    if (r.linked) score += dislikeOf(entryScores[ref.title.key] ?? DISLIKE_MAX) * Math.max(0, r.score);
  }
  return score;
}

/** Mean taste score of a title against the whole profile (0 when the profile is empty). */
export const profileAffinity = (profile: Profile, title: Title, tagIds: string[] = []): number => {
  if (profile.refs.length === 0) return 0;
  const pool = buildPool([title, ...profile.refs.map((r) => r.title)]);
  const total = profile.refs.reduce((sum, ref) => {
    const r = plotScore({ title, tagIds }, ref, false, false, pool);
    return sum + (r.linked ? r.score : 0);
  }, 0);
  return total / profile.refs.length;
};

export interface FeaturedInput {
  kind: Kind;
  entries: LibraryEntry[];
  titles: Record<string, Title>;
  seen: ReadonlySet<string>;
  /** candidates already loaded: what my favourites lead to, and `discover` results on my platforms */
  discovered: Title[];
  /** my platforms: nothing that is not on one of them is ever offered */
  mine: Provider[];
}

/** Fewer votes than this on TMDB: too obscure to offer. */
export const MIN_VOTES = 100;

export interface Ranked {
  title: Title;
  total: number;
  /** the title of mine that explains it best */
  source: Ref | null;
}

/**
 * Candidates ranked by how well they fit my taste (D35), less what is like the titles I rated 1 to 4 (D41), never one I have already watched or rated and only on my
 * platforms. `null` when there is no taste yet (nothing rated 7 or more).
 */
export function rankByTaste(input: FeaturedInput): { ranked: Ranked[]; scores: Record<string, number | null> } | null {
  const { kind, entries, seen, discovered, mine } = input;
  const onMine = (t: Title | undefined): t is Title => !!t && myProviders(t, mine).length > 0;
  const titles = Object.fromEntries(Object.entries(input.titles).filter(([, t]) => onMine(t)));
  const profile = buildKindProfile(kind, entries, input.titles);
  if (profile.refs.length === 0) return null;
  // watched or rated = already answered, whatever TMDB thinks
  const answered = new Set<string>(seen);
  for (const e of entries) if (e.seenAt !== null || e.myScore !== null || Object.keys(e.seenEpisodes).length > 0) answered.add(e.key);
  // obscure titles (few votes) are noise: the wider the net, the more it needs this
  const ofKind = discovered.filter((t) => onMine(t) && t.type === kind && !answered.has(t.key) && (t.voteCount ?? Infinity) >= MIN_VOTES);

  const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
  const scores = Object.fromEntries(entries.map((e) => [e.key, e.myScore]));
  const watchlist = entries.filter((e) => e.type === kind && e.inWatchlist && titles[e.key] && !answered.has(e.key)).map((e) => titles[e.key]);
  const disliked: Ref[] = entries
    .filter((e) => e.type === kind && e.myScore !== null && e.myScore <= DISLIKE_MAX && input.titles[e.key])
    .map((e) => ({ title: input.titles[e.key], tagIds: e.tagIds }));
  const pool = buildPool([...profile.refs.map((r) => r.title), ...disliked.map((r) => r.title), ...watchlist, ...ofKind]);
  const candidates = new Map<string, Title>();
  for (const t of [...watchlist, ...ofKind]) if (!candidates.has(t.key)) candidates.set(t.key, t);

  const ranked = [...candidates.values()]
    .map((title) => {
      const tagIds = byKey[title.key]?.tagIds ?? [];
      const taste = tasteOf(profile, scores, title, tagIds, pool);
      const push = byKey[title.key]?.inWatchlist ? 5 : 0;
      const against = distasteOf(disliked, scores, title, pool);
      return { title, source: taste.source, total: taste.score > 0 ? taste.score + push - against : 0 };
    })
    .filter((c) => c.total > 0)
    .sort((x, y) => y.total - x.total || (y.title.ratings.imdb ?? 0) - (x.title.ratings.imdb ?? 0));
  return { ranked, scores };
}

/**
 * Up to 5 candidates (D35): the best of `rankByTaste`, at most two from the same favourite of mine.
 * Without a taste yet, the best IMDb among recent discoveries. Empty = show the empty state.
 */
export function pickFeatured(input: FeaturedInput): FeaturedItem[] {
  const { kind, entries, seen, discovered, mine } = input;
  const result = rankByTaste(input);
  if (!result) {
    const answered = new Set<string>(seen);
    for (const e of entries) if (e.seenAt !== null || e.myScore !== null || Object.keys(e.seenEpisodes).length > 0) answered.add(e.key);
    const best = discovered
      .filter((t) => myProviders(t, mine).length > 0 && t.type === kind && !answered.has(t.key))
      .sort((a, b) => (b.ratings.imdb ?? 0) - (a.ratings.imdb ?? 0));
    return best.slice(0, MAX_CANDIDATES).map((title) => ({ title, pill: 'Dime tus gustos para afinar' }));
  }
  const { ranked, scores } = result;
  const out: FeaturedItem[] = [];
  const perSource = new Map<string, number>();
  for (const c of ranked) {
    if (out.length >= MAX_CANDIDATES) break;
    const from = c.source?.title.key ?? '';
    if ((perSource.get(from) ?? 0) >= MAX_PER_SOURCE) continue;
    perSource.set(from, (perSource.get(from) ?? 0) + 1);
    const mark = scores[from];
    out.push({ title: c.title, pill: c.source ? `Como ${c.source.title.title}${mark ? ` · tu nota ${mark}` : ''}` : 'Encaja con tus gustos' });
  }
  return out;
}

/** The next best after the ones already chosen, each saying which favourite of mine it follows from (D40). */
export function moreForYou(input: FeaturedInput, exclude: ReadonlySet<string>, max = 20): FeaturedItem[] {
  const result = rankByTaste(input);
  if (!result) return [];
  return result.ranked
    .filter((c) => !exclude.has(c.title.key))
    .slice(0, max)
    .map((c) => {
      const from = c.source?.title.key ?? '';
      const mark = result.scores[from];
      return { title: c.title, pill: c.source ? `Como ${c.source.title.title}${mark ? ` · ${mark}` : ''}` : 'Encaja con tus gustos' };
    });
}

/** The themes my favourites share most: the plot-level way to ask TMDB for more of the same. */
export function topKeywords(profile: Profile, max = 5): number[] {
  const count = new Map<number, number>();
  for (const { title } of profile.refs) for (const k of title.keywords) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n >= Math.min(2, profile.refs.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k);
}

/** Candidates that my favourites lead to: what TMDB recommends for the ones I rated best, most-recommended first. */
export function recommendedKeys(profile: Profile, exclude: ReadonlySet<string>, max = 120): string[] {
  const count = new Map<string, number>();
  const favourites = [...profile.refs].slice(0, 30);
  for (const { title } of favourites) {
    for (const k of [...title.recommendations.slice(0, 20), ...title.similar.slice(0, 6)]) {
      if (!exclude.has(k)) count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
}

export const discoverParamsFor = (profile: Profile, mine: Provider[]): Record<string, string | number> => {
  const decades = [...profile.decades].sort();
  const params: Record<string, string | number> = {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate',
    with_watch_providers: mine.map((p) => p.id).join('|'),
    'vote_count.gte': 200,
    sort_by: 'popularity.desc',
  };
  if (profile.topGenres.length > 0) params.with_genres = profile.topGenres.join('|');
  if (decades.length > 0) {
    const from = `${decades[0] * 10}-01-01`;
    const to = `${decades[decades.length - 1] * 10 + 9}-12-31`;
    const key = profile.type === 'tv' ? 'first_air_date' : 'primary_release_date';
    params[`${key}.gte`] = from;
    params[`${key}.lte`] = to;
  }
  return params;
};

/** Discover by plot: titles on my platforms that carry some of the given TMDB keywords. */
export const discoverByKeywords = (keywords: number[], mine: Provider[]): Record<string, string | number> => ({
  watch_region: 'ES',
  with_watch_monetization_types: 'flatrate',
  with_watch_providers: mine.map((p) => p.id).join('|'),
  'vote_count.gte': 150,
  sort_by: 'vote_average.desc',
  with_keywords: keywords.join('|'),
});

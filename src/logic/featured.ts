import { pairScore, type Ref } from './similar';
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
/** A title I have seen can be offered again from this score up (D28). */
export const REWATCH_SCORE = 8;
/** How many of the five may be ones I have already seen. */
const MAX_REWATCH = 2;

function profileFromEntries(chosen: LibraryEntry[], titles: Record<string, Title>): Profile {
  const refs: Ref[] = chosen.filter((e) => titles[e.key]).map((e) => ({ title: titles[e.key], tagIds: e.tagIds }));
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

/** Mean pair score of a title against the whole profile (0 when the profile is empty). */
export const profileAffinity = (profile: Profile, title: Title, tagIds: string[] = []): number =>
  profile.refs.length === 0 ? 0 : affinityTo(profile, title, tagIds).score;

/** Mean pair score against the whole profile, and how many tags/genres/decade they share (the pill's N). */
function affinityTo(profile: Profile, title: Title, tagIds: string[]): { score: number; shared: number } {
  const c: Ref = { title, tagIds };
  let total = 0;
  const sharedTags = new Set<string>();
  for (const ref of profile.refs) {
    total += pairScore(c, ref, false).score;
    tagIds.filter((t) => ref.tagIds.includes(t)).forEach((t) => sharedTags.add(t));
  }
  const genres = title.genres.filter((g) => profile.topGenres.includes(g.id)).length;
  const decade = title.year && profile.decades.includes(Math.floor(title.year / 10)) ? 1 : 0;
  return { score: total / Math.max(1, profile.refs.length), shared: sharedTags.size + genres + decade };
}

export interface FeaturedInput {
  kind: Kind;
  entries: LibraryEntry[];
  titles: Record<string, Title>;
  seen: ReadonlySet<string>;
  /** `discover` results on my platforms already loaded */
  discovered: Title[];
}

/** Up to 5 candidates: my watchlist first, then discoveries on my platforms; empty = show the empty state. */
export function pickFeatured(input: FeaturedInput): FeaturedItem[] {
  const { kind, entries, titles, seen, discovered } = input;
  const profile = buildKindProfile(kind, entries, titles);
  const ofKind = discovered.filter((t) => t.type === kind && !seen.has(t.key));

  if (profile.refs.length === 0) {
    // No taste yet: the best IMDb among recent discoveries.
    const best = [...ofKind].sort((a, b) => (b.ratings.imdb ?? 0) - (a.ratings.imdb ?? 0));
    return best.slice(0, MAX_CANDIDATES).map((title) => ({ title, pill: 'Dime tus gustos para afinar' }));
  }

  const watchlist = entries.filter((e) => e.type === kind && e.inWatchlist && titles[e.key] && !seen.has(e.key));
  const taken = new Set<string>();
  const out: FeaturedItem[] = [];
  const add = (candidates: { title: Title; tagIds: string[] }[]) => {
    const ranked = candidates
      .map((c) => ({ ...c, ...affinityTo(profile, c.title, c.tagIds) }))
      .sort((x, y) => y.score - x.score || (y.title.ratings.imdb ?? 0) - (x.title.ratings.imdb ?? 0));
    for (const c of ranked) {
      if (out.length >= MAX_CANDIDATES) return;
      if (taken.has(c.title.key)) continue;
      taken.add(c.title.key);
      out.push({ title: c.title, pill: `Coincide con ${c.shared} de tus gustos` });
    }
  };
  add(watchlist.map((e) => ({ title: titles[e.key], tagIds: e.tagIds })));
  add(ofKind.map((title) => ({ title, tagIds: [] as string[] })));

  // Titles I have seen and rated well may come back, saying so; never more than MAX_REWATCH of the five.
  const again = entries
    .filter((e) => e.type === kind && seen.has(e.key) && (e.myScore ?? 0) >= REWATCH_SCORE && titles[e.key])
    .sort((x, y) => (y.myScore ?? 0) - (x.myScore ?? 0))
    .map((e) => ({ title: titles[e.key], pill: `Ya la has visto · tu nota ${e.myScore}` }));
  const room = Math.min(MAX_REWATCH, again.length);
  const fresh = out.slice(0, MAX_CANDIDATES - room);
  return [...fresh, ...again.slice(0, room), ...out.slice(fresh.length)].slice(0, MAX_CANDIDATES);
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

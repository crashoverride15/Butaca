import { pairScore, type Ref } from './similar';
import type { LibraryEntry, Provider, Title } from '../store/types';

// "Para esta noche" — spec §7.2. Pure: the caller loads the data.

export type Moment = 'Noche' | 'Entre semana' | 'Para dormirme';
export const MOMENTS: Moment[] = ['Noche', 'Entre semana', 'Para dormirme'];
export const momentTagId = (m: Moment): string =>
  `momento:${m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export const EYEBROW: Record<Moment, string> = {
  Noche: 'PARA ESTA NOCHE',
  'Entre semana': 'PARA ENTRE SEMANA',
  'Para dormirme': 'PARA DORMIRTE',
};

/** Default moment by hour (spec §8.4). `now` is a local Date. */
export function defaultMoment(now: Date): Moment {
  const h = now.getHours();
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  if (h >= 21) return 'Noche';
  if (h < 6) return 'Para dormirme';
  return weekend ? 'Noche' : 'Entre semana';
}

export interface Profile {
  refs: Ref[];
  topGenres: number[];
  decades: number[];
  /** the predominant kind in the profile */
  type: 'movie' | 'tv' | null;
}

const MAX_CANDIDATES = 5;

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

/** Profile of a moment: my titles with its tag rated 7 or more; if none, all tagged with it (spec §7.2). */
export function buildProfile(moment: Moment, entries: LibraryEntry[], titles: Record<string, Title>): Profile {
  const tag = momentTagId(moment);
  const tagged = entries.filter((e) => e.tagIds.includes(tag) && titles[e.key]);
  const liked = tagged.filter((e) => (e.myScore ?? 0) >= 7);
  return profileFromEntries(liked.length > 0 ? liked : tagged, titles);
}

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
  moment: Moment;
  entries: LibraryEntry[];
  titles: Record<string, Title>;
  seen: ReadonlySet<string>;
  /** `discover` results on my platforms already loaded (step c) */
  discovered: Title[];
}

/** Up to 5 candidates in preference order a → b → c (spec §7.2); empty = show the empty state. */
export function pickFeatured(input: FeaturedInput): FeaturedItem[] {
  const { moment, entries, titles, seen, discovered } = input;
  const profile = buildProfile(moment, entries, titles);
  const momentTag = momentTagId(moment);
  const hasAnyMoment = (e: LibraryEntry) => e.tagIds.some((t) => t.startsWith('momento:'));

  if (profile.refs.length === 0) {
    // No profile: the best IMDb among recent discoveries.
    const best = [...discovered].filter((t) => !seen.has(t.key)).sort((a, b) => (b.ratings.imdb ?? 0) - (a.ratings.imdb ?? 0));
    const pill = `Elige títulos con el tag ${moment} para afinar`;
    return best.slice(0, MAX_CANDIDATES).map((title) => ({ title, pill }));
  }

  const watchlist = entries.filter((e) => e.inWatchlist && titles[e.key] && !seen.has(e.key));
  const a = watchlist.filter((e) => e.tagIds.includes(momentTag));
  const b = watchlist.filter((e) => !hasAnyMoment(e)).filter((e) => {
    const t = titles[e.key];
    const genreOk = t.genres.some((g) => profile.topGenres.includes(g.id));
    const decadeOk = t.year !== null && profile.decades.includes(Math.floor(t.year / 10));
    return genreOk && decadeOk;
  });

  const taken = new Set<string>();
  const out: FeaturedItem[] = [];
  const rank = (candidates: { title: Title; tagIds: string[] }[]) =>
    candidates
      .map((c) => ({ ...c, ...affinityTo(profile, c.title, c.tagIds) }))
      .sort((x, y) => y.score - x.score || (y.title.ratings.imdb ?? 0) - (x.title.ratings.imdb ?? 0));
  const add = (candidates: { title: Title; tagIds: string[] }[]) => {
    for (const c of rank(candidates)) {
      if (out.length >= MAX_CANDIDATES) return;
      if (taken.has(c.title.key)) continue;
      taken.add(c.title.key);
      out.push({ title: c.title, pill: `Coincide con ${c.shared} de tus tags` });
    }
  };

  add(a.map((e) => ({ title: titles[e.key], tagIds: e.tagIds })));
  add(b.map((e) => ({ title: titles[e.key], tagIds: e.tagIds })));
  add(
    discovered
      .filter((t) => !seen.has(t.key) && (profile.type === null || t.type === profile.type))
      .map((title) => ({ title, tagIds: [] as string[] })),
  );
  return out;
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

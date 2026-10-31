import { epochOf } from './autotags';
import type { LibraryEntry, Provider, Title } from '../store/types';

// "Parecidas" — spec §7.1. Pure scoring; loading the candidates is up to the caller.

export interface Ref {
  title: Title;
  /** my manual tags on it (empty if it is not in my library) */
  tagIds: string[];
}

const decadeOf = (year: number | null): number | null => (year ? Math.floor(year / 10) : null);

export interface PairScore {
  score: number;
  /** manual tags + genres shared + 1 for the same decade (the caption's N) */
  common: number;
  /** how many manual tags are shared — used to tell a tag match from a genre match */
  sharedTags: number;
}

/** Score of candidate C against reference T, by the formula of spec §7.1. */
export function pairScore(c: Ref, t: Ref, fromTmdbRecommendations: boolean): PairScore {
  const sharedTags = c.tagIds.filter((id) => t.tagIds.includes(id)).length;
  const sharedGenres = c.title.genres.filter((g) => t.title.genres.some((x) => x.id === g.id)).length;
  const sharedKeywords = c.title.keywords.filter((k) => t.title.keywords.includes(k)).length;
  const dc = decadeOf(c.title.year);
  const dt = decadeOf(t.title.year);
  const sameDecade = dc !== null && dc === dt;
  const nearDecade = dc !== null && dt !== null && Math.abs(dc - dt) === 1;
  const sameCountry = c.title.originCountry.some((x) => t.title.originCountry.includes(x));

  const score =
    3 * sharedTags +
    2 * sharedGenres +
    Math.min(4, sharedKeywords) +
    (sameDecade ? 3 : nearDecade ? 1 : 0) +
    (sameCountry ? 2 : 0) +
    (fromTmdbRecommendations ? 1 : 0) +
    ((c.title.ratings.imdb ?? 0) >= 7.5 ? 1 : 0);

  return { score, common: sharedTags + sharedGenres + (sameDecade ? 1 : 0), sharedTags };
}

export interface SimilarItem {
  title: Title;
  score: number;
  caption: string;
}

export const commonCaption = (n: number): string => (n === 0 ? 'Recomendada por TMDB' : `${n} ${n === 1 ? 'tag' : 'tags'} en común`);

export interface SimilarInput {
  target: Title;
  targetEntry?: LibraryEntry;
  candidates: Title[];
  library: Record<string, LibraryEntry>;
  /** keys I have watched (movies seen, series with every aired episode seen) */
  seen: ReadonlySet<string>;
  mine: Provider[];
}

const ANIMATION = 16;

/**
 * "Parecidas" must share the plot, not just the high-level labels (D34): TMDB recommendations and shared keywords
 * (plot-level themes) lead; genres, tags and decade only break ties. A cartoon never stands in for a live-action show.
 */
export function plotScore(c: Ref, t: Ref, recommended: boolean, inSimilar: boolean): { score: number; keywords: number; linked: boolean } {
  const keywords = c.title.keywords.filter((k) => t.title.keywords.includes(k)).length;
  const sharedGenres = c.title.genres.filter((g) => t.title.genres.some((x) => x.id === g.id)).length;
  const sharedTags = c.tagIds.filter((id) => t.tagIds.includes(id)).length;
  const dc = decadeOf(c.title.year);
  const sameDecade = dc !== null && dc === decadeOf(t.title.year);
  const sameCountry = c.title.originCountry.some((x) => t.title.originCountry.includes(x));
  const animated = (r: Ref) => r.title.genres.some((g) => g.id === ANIMATION);
  const score =
    (recommended ? 10 : 0) +
    (inSimilar ? 3 : 0) +
    3 * Math.min(keywords, 8) +
    1.5 * sharedGenres +
    sharedTags +
    (sameDecade ? 1 : 0) +
    (sameCountry ? 1 : 0) +
    ((c.title.ratings.imdb ?? 0) >= 7.5 ? 1 : 0) -
    (animated(c) !== animated(t) ? 15 : 0);
  // a link to the plot is required: TMDB recommends it, or they share themes
  return { score, keywords, linked: recommended || keywords >= 2 || (inSimilar && keywords >= 1) };
}

export const plotCaption = (recommended: boolean, keywords: number): string =>
  recommended ? 'Recomendada por TMDB' : keywords >= 2 ? `${keywords} temas en común` : 'Parecida en tema';

/** Up to 12 titles like the target: not seen, on my platforms, with a plot link, best score first. */
export function similarTo(input: SimilarInput, limit = 12): SimilarItem[] {
  const { target, targetEntry, library, seen, mine } = input;
  const mineIds = new Set(mine.map((p) => p.id));
  const tRef: Ref = { title: target, tagIds: targetEntry?.tagIds ?? [] };
  const recommended = new Set(target.recommendations);
  const similar = new Set(target.similar);
  const done = new Set<string>([target.key]);

  const items: (SimilarItem & { imdb: number })[] = [];
  for (const c of input.candidates) {
    if (done.has(c.key) || c.type !== target.type) continue;
    done.add(c.key);
    if (seen.has(c.key)) continue;
    if (!c.providers.some((p) => mineIds.has(p.id))) continue;
    const rec = recommended.has(c.key);
    const r = plotScore({ title: c, tagIds: library[c.key]?.tagIds ?? [] }, tRef, rec, similar.has(c.key));
    if (!r.linked) continue;
    items.push({ title: c, score: r.score, caption: plotCaption(rec, r.keywords), imdb: c.ratings.imdb ?? 0 });
  }
  return items
    .sort((a, b) => b.score - a.score || b.imdb - a.imdb)
    .slice(0, limit)
    .map(({ title, score, caption }) => ({ title, score, caption }));
}

/** Candidate keys of spec §7.1 step 1: TMDB recommendations and similar, plus my own of the same type. */
export function candidateKeys(target: Title, library: Record<string, LibraryEntry>): string[] {
  const mineOfType = Object.values(library).filter((e) => e.type === target.type).map((e) => e.key);
  return [...new Set([...target.recommendations, ...target.similar, ...mineOfType])].filter((k) => k !== target.key);
}

export { epochOf };

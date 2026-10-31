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

/** Up to 12 titles like the target: not seen, on my platforms, best score first. */
export function similarTo(input: SimilarInput, limit = 12): SimilarItem[] {
  const { target, targetEntry, library, seen, mine } = input;
  const mineIds = new Set(mine.map((p) => p.id));
  const tRef: Ref = { title: target, tagIds: targetEntry?.tagIds ?? [] };
  const recommended = new Set(target.recommendations);
  const done = new Set<string>([target.key]);

  const items: (SimilarItem & { imdb: number })[] = [];
  for (const c of input.candidates) {
    if (done.has(c.key) || c.type !== target.type) continue;
    done.add(c.key);
    if (seen.has(c.key)) continue;
    if (!c.providers.some((p) => mineIds.has(p.id))) continue;
    const r = pairScore({ title: c, tagIds: library[c.key]?.tagIds ?? [] }, tRef, recommended.has(c.key));
    items.push({ title: c, score: r.score, caption: commonCaption(r.common), imdb: c.ratings.imdb ?? 0 });
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

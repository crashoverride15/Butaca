import { epochOf } from './autotags';
import type { LibraryEntry, Provider, Title } from '../store/types';

// "Parecidas" — spec §7.1 as reworked in D34 and D35. Pure scoring; loading the candidates is up to the caller.

export interface Ref {
  title: Title;
  /** my manual tags on it (empty if it is not in my library) */
  tagIds: string[];
}

export interface SimilarItem {
  title: Title;
  score: number;
  caption: string;
}

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
const COMEDY = 35;

// Plot similarity (D34, D35). Three signals, the last two weighted by how rare they are in the pool being
// compared, so "new york city" or "robot" count little and "vigilante" or "surveillance" a lot:
//  - TMDB recommends it,
//  - shared TMDB keywords (themes), and
//  - shared words of the synopsis.
// A cartoon is never offered for live action, nor a comedy for a drama, whatever else they share.
const STOP = new Set(
  'para como pero este esta esto estos estas entre sobre desde hasta cuando donde cada otro otra otros otras mismo tambien muy mas menos tras ante bajo segun sino aunque mientras porque con sin por los las del una uno unos unas sus son fue ser han hay tiene tienen deben puede pueden cual quien quienes todo todos toda todas parte serie pelicula historia vida'.split(' '),
);

/** Words of a text that say something about the plot: no accents, no small or common words, cut to 6 letters. */
export function stems(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.slice(0, 6));
}

export interface PlotPool {
  n: number;
  words: Map<string, number>;
  keywords: Map<number, number>;
}

/** How many titles of the pool carry each theme and word. */
export function buildPool(titles: Title[]): PlotPool {
  const words = new Map<string, number>();
  const keywords = new Map<number, number>();
  for (const t of titles) {
    for (const w of new Set(stems(t.overview))) words.set(w, (words.get(w) ?? 0) + 1);
    for (const k of new Set(t.keywords)) keywords.set(k, (keywords.get(k) ?? 0) + 1);
  }
  return { n: titles.length, words, keywords };
}

// a small pool would make everything look common: count as if there were at least this many
const MIN_POOL = 30;
/** Rarity, squared: a theme that few titles carry is worth far more than one most of them do. */
const weight = (n: number, df: number): number => Math.log((Math.max(n, MIN_POOL) + 1) / (df + 1)) ** 2;

/** Weighted shared themes needed to count as the same plot, and the synopsis similarity that also does. */
export const KEYWORD_MIN = 5;
export const TEXT_MIN = 0.12;

export interface PlotScore {
  score: number;
  /** the plot links them: TMDB recommends it, or they share rare themes or words */
  linked: boolean;
  /** how many themes (TMDB keywords) they share */
  keywords: number;
}

export function plotScore(c: Ref, t: Ref, recommended: boolean, inSimilar: boolean, pool: PlotPool): PlotScore {
  const has = (x: Title, id: number) => x.genres.some((g) => g.id === id);
  if (has(c.title, ANIMATION) !== has(t.title, ANIMATION) || has(c.title, COMEDY) !== has(t.title, COMEDY)) {
    return { score: 0, linked: false, keywords: 0 };
  }
  const shared = [...new Set(c.title.keywords)].filter((k) => t.title.keywords.includes(k));
  const kw = shared.reduce((sum, k) => sum + weight(pool.n, pool.keywords.get(k) ?? 1), 0);

  const a = [...new Set(stems(c.title.overview))];
  const b = new Set(stems(t.title.overview));
  const w = (x: string) => weight(pool.n, pool.words.get(x) ?? 1);
  const dot = a.filter((x) => b.has(x)).reduce((sum, x) => sum + w(x), 0);
  const na = a.reduce((sum, x) => sum + w(x), 0);
  const nb = [...b].reduce((sum, x) => sum + w(x), 0);
  const text = na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;

  const sharedGenres = c.title.genres.filter((g) => t.title.genres.some((x) => x.id === g.id)).length;
  const sharedTags = c.tagIds.filter((id) => t.tagIds.includes(id)).length;
  const sameKind = recommended || sharedGenres > 0; // other genres need TMDB's word, not just generic themes
  const linked = sameKind && (recommended || kw >= KEYWORD_MIN || text >= TEXT_MIN || (inSimilar && (kw >= 2.5 || text >= TEXT_MIN / 2)));
  const score = (recommended ? 10 : 0) + (inSimilar ? 2 : 0) + kw + 25 * text + 1.5 * sharedGenres + 0.5 * sharedTags + ((c.title.ratings.imdb ?? 0) >= 7.5 ? 1 : 0);
  return { score, linked, keywords: shared.length };
}

/** Moment tags (Maratón, Random, Entre semana, Para dormirme): 'same' or 'different' only when both have one. */
export function momentMatch(candidateTags: string[], targetTags: string[]): 'same' | 'different' | 'unknown' {
  const moments = (ids: string[]) => ids.filter((i) => i.startsWith('momento:'));
  const mt = moments(targetTags);
  const mc = moments(candidateTags);
  if (mt.length === 0 || mc.length === 0) return 'unknown';
  return mc.some((x) => mt.includes(x)) ? 'same' : 'different';
}

export const plotCaption = (recommended: boolean, sharedKeywords: number): string =>
  recommended ? 'Recomendada por TMDB' : sharedKeywords >= 2 ? `${sharedKeywords} temas en común` : 'Parecida en la trama';

/** Up to 12 titles like the target: not seen, on my platforms, same plot, same moment, best plot score first. */
export function similarTo(input: SimilarInput, limit = 12): SimilarItem[] {
  const { target, targetEntry, library, seen, mine } = input;
  const mineIds = new Set(mine.map((p) => p.id));
  const tRef: Ref = { title: target, tagIds: targetEntry?.tagIds ?? [] };
  const recommended = new Set(target.recommendations);
  const similar = new Set(target.similar);
  const pool = buildPool([target, ...input.candidates]);
  const done = new Set<string>([target.key]);

  const items: (SimilarItem & { imdb: number })[] = [];
  for (const c of input.candidates) {
    if (done.has(c.key) || c.type !== target.type) continue;
    done.add(c.key);
    if (seen.has(c.key)) continue;
    if (!c.providers.some((p) => mineIds.has(p.id))) continue;
    const tags = library[c.key]?.tagIds ?? [];
    const moment = momentMatch(tags, tRef.tagIds);
    if (moment === 'different') continue;

    const rec = recommended.has(c.key);
    const r = plotScore({ title: c, tagIds: tags }, tRef, rec, similar.has(c.key), pool);
    if (!r.linked) continue;
    items.push({ title: c, score: r.score + (moment === 'same' ? 4 : 0), caption: plotCaption(rec, r.keywords), imdb: c.ratings.imdb ?? 0 });
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

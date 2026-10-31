import type { EpisodeSignal } from './episodes';
import { buildPool, plotScore } from './similar';
import type { Title } from '../store/types';

// What kind of series this is and when it suits (D39): Maratón (short, continuous plot), Entre semana (long, middling
// plot, like Person of Interest) or Para dormirme (minimal plot, a case per episode, like Bones). Pure.

export const MOMENT_IDS = ['momento:maraton', 'momento:entre-semana', 'momento:para-dormirme', 'momento:random'] as const;
export type MomentId = (typeof MOMENT_IDS)[number];
export const MOMENT_LABELS: Record<MomentId, string> = {
  'momento:maraton': 'Maratón',
  'momento:entre-semana': 'Entre semana',
  'momento:para-dormirme': 'Para dormir',
  'momento:random': 'Random',
};

const zero = (): Record<MomentId, number> => Object.fromEntries(MOMENT_IDS.map((m) => [m, 0])) as Record<MomentId, number>;

// TMDB keyword names (English, lower case). A hint, not a verdict: the series I already classified weigh more.
const CASE_WORDS = ['procedural', 'detective', 'forensic', 'serial killer', 'murder', 'investigation', 'fbi', 'profiler', 'medical drama', 'lawyer', 'courtroom', 'whodunit', 'police'];
const SERIAL_WORDS = ['conspiracy', 'mythology', 'time travel', 'post-apocalyptic', 'dystopia', 'survival', 'revenge', 'heist', 'political intrigue', 'cliffhanger', 'miniseries', 'limited series'];
const CASE_GENRES = [80, 9648, 18]; // crime, mystery, drama (medical, legal)

export interface Shape {
  seasons: number;
  episodes: number;
  perSeason: number;
  minutes: number | null;
  ended: boolean;
  miniseries: boolean;
  /** how many keywords point to a case per episode / to a story that goes on */
  caseHints: number;
  serialHints: number;
  caseGenre: boolean;
  /** comedy or animation */
  light: boolean;
  /** what the synopses of one season say (D42), when read */
  story: EpisodeSignal | null;
}

const count = (names: string[], words: string[]): number => words.filter((w) => names.some((n) => n.includes(w))).length;

export function seriesShape(t: Title): Shape {
  const seasons = t.seasons?.length ?? t.numberOfSeasons ?? 0;
  const episodes = t.numberOfEpisodes ?? (t.seasons ?? []).reduce((sum, s) => sum + s.episodeCount, 0);
  const names = t.keywordNames ?? [];
  const ended = t.status === 'Ended' || t.status === 'Canceled' || t.inProduction === false;
  return {
    seasons,
    episodes,
    perSeason: seasons > 0 ? episodes / seasons : 0,
    minutes: t.episodeRuntime ?? null,
    ended,
    miniseries: t.tvType === 'Miniseries' || (seasons <= 1 && ended),
    caseHints: count(names, CASE_WORDS),
    serialHints: count(names, SERIAL_WORDS),
    caseGenre: t.genres.some((g) => CASE_GENRES.includes(g.id)) && t.genres.some((g) => g.id === 80 || g.id === 9648),
    light: t.genres.some((g) => g.id === 35 || g.id === 16),
    story: t.episodeSignal ?? null,
  };
}

/** Points by shape alone, 0 to 3, for each moment. */
export function shapePrior(s: Shape): Record<MomentId, number> {
  const prior = zero();
  if (s.seasons === 0) return prior; // nothing known
  // the episodes, when read, settle whether it is a case per episode; the keywords and genres only guess (D42)
  const byStory = s.story ? s.story.caseRatio >= 0.5 && s.story.guestRatio >= 0.35 : null;
  const noCases = s.story ? s.story.caseRatio < 0.3 : false;
  const procedural = byStory ?? (!noCases && (s.caseHints >= 1 || (s.caseGenre && s.perSeason >= 18 && s.seasons >= 7)));
  if (s.seasons <= 3 && s.episodes <= 36) prior['momento:maraton'] = 3;
  else if (s.seasons <= 3) prior['momento:maraton'] = 1.5;
  if (s.miniseries) prior['momento:maraton'] += 1;
  if (s.serialHints > 0 && s.seasons <= 5) prior['momento:maraton'] += 1;
  if (s.caseHints >= 2) prior['momento:maraton'] -= 2;

  if (s.seasons >= 4 && s.seasons <= 7 && !procedural) prior['momento:entre-semana'] = 2.5;
  else if (s.seasons >= 8 && !procedural) prior['momento:entre-semana'] = 2;
  else if (s.seasons >= 4) prior['momento:entre-semana'] = 1;
  if (s.serialHints > 0 && s.seasons >= 4) prior['momento:entre-semana'] += 0.5;

  if (procedural && s.perSeason >= 12) prior['momento:para-dormirme'] = 2.5 + Math.min(1, s.caseHints * 0.5);
  else if (s.caseGenre && s.perSeason >= 18 && s.seasons >= 4) prior['momento:para-dormirme'] = 0.5;
  if (s.serialHints >= 2) prior['momento:para-dormirme'] -= 1;
  // a sitcom or cartoon that goes on for seasons is watched in no order (Los Simpson)
  const light = s.light && s.perSeason >= 18 && s.seasons >= 5;
  if (light) prior['momento:random'] = 3;
  else if (s.light && s.seasons >= 4) prior['momento:random'] = 1.5;
  if (prior['momento:random'] >= 3) {
    prior['momento:entre-semana'] -= 1.5;
    prior['momento:para-dormirme'] -= 1;
  }
  addEpisodes(prior, s);
  for (const m of MOMENT_IDS) prior[m] = Math.max(0, prior[m]);
  return prior;
}

/**
 * What the episodes themselves say (D42), on top of the shape: the closest thing to measuring the plot.
 *  - a case nearly every episode, with new names each time → Para dormir;
 *  - cases, but a story that carries over too (Person of Interest) → Entre semana when it is long;
 *  - no cases, the same names, a story that goes on → Maratón if short, Entre semana if long;
 *  - a comedy whose episodes stand alone → Random.
 */
function addEpisodes(prior: Record<MomentId, number>, s: Shape): void {
  const e = s.story;
  if (!e) return;
  const long = s.seasons >= 4;
  const procedural = e.caseRatio >= 0.5 && e.guestRatio >= 0.35;
  const serial = e.caseRatio < 0.3 && (e.serialRatio >= 0.25 || e.guestRatio < 0.3);
  if (procedural && e.serialRatio < 0.3) {
    prior['momento:para-dormirme'] += 2;
    prior['momento:maraton'] -= 1.5;
  } else if (procedural) {
    prior[long ? 'momento:entre-semana' : 'momento:para-dormirme'] += 1.5;
    prior['momento:maraton'] -= 1;
  } else if (serial && !s.light) {
    prior[long ? 'momento:entre-semana' : 'momento:maraton'] += 1.5;
    prior['momento:para-dormirme'] -= 1.5;
  }
  if (s.light && e.caseRatio < 0.3 && e.serialRatio < 0.2 && long) prior['momento:random'] += 1;
}

export interface LabelledSeries {
  title: Title;
  /** the moment tags I gave it */
  moments: string[];
}

const NEIGHBOURS = 5;
const LEARNED_WEIGHT = 4;
const MIN_SCORE = 2.5;
const MIN_LEAD = 1;

const lengthClass = (s: Shape): number => (s.seasons === 0 ? -1 : s.seasons <= 3 ? 0 : s.seasons <= 7 ? 1 : 2);

/** How much two series alike: plot and themes first, then how they are built. */
function likeness(a: Title, b: Title, pool: ReturnType<typeof buildPool>): number {
  const plot = plotScore({ title: a, tagIds: [] }, { title: b, tagIds: [] }, false, false, pool);
  const sa = seriesShape(a);
  const sb = seriesShape(b);
  let s = plot.linked ? plot.score : Math.min(plot.score, 3);
  if (lengthClass(sa) >= 0 && lengthClass(sa) === lengthClass(sb)) s += 2;
  if (sa.perSeason > 0 && sb.perSeason > 0 && Math.abs(sa.perSeason - sb.perSeason) <= 3) s += 1;
  if (sa.caseHints > 0 && sb.caseHints > 0) s += 1;
  // told the same way: as many cases and guests per episode
  if (sa.story && sb.story) s += 3 * (1 - Math.abs(sa.story.caseRatio - sb.story.caseRatio)) - 1.5 * Math.abs(sa.story.guestRatio - sb.story.guestRatio);
  return s;
}

/**
 * The moment a series suits, or null when it is not clear (better no answer than a wrong one). The shape of the series
 * gives a first guess; the most alike series I already classified correct it.
 */
export function estimateMoment(title: Title, labelled: LabelledSeries[]): { moment: MomentId | null; scores: Record<MomentId, number> } {
  const prior = shapePrior(seriesShape(title));
  const known = labelled.filter((l) => l.title.key !== title.key && l.moments.some((m) => (MOMENT_IDS as readonly string[]).includes(m)));
  const learned = zero();
  if (known.length > 0) {
    const pool = buildPool([title, ...known.map((k) => k.title)]);
    const top = known
      .map((k) => ({ k, s: likeness(title, k.title, pool) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, NEIGHBOURS);
    const total = top.reduce((sum, t) => sum + t.s, 0);
    if (total > 0) {
      for (const { k, s } of top) {
        const mine = k.moments.filter((m): m is MomentId => (MOMENT_IDS as readonly string[]).includes(m));
        for (const m of mine) learned[m] += s / total / mine.length;
      }
    }
  }
  const scores = Object.fromEntries(MOMENT_IDS.map((m) => [m, prior[m] + LEARNED_WEIGHT * learned[m]])) as Record<MomentId, number>;
  const ranked = [...MOMENT_IDS].sort((a, b) => scores[b] - scores[a]);
  const [first, second] = ranked;
  const moment = scores[first] >= MIN_SCORE && scores[first] - scores[second] >= MIN_LEAD ? first : null;
  return { moment, scores };
}

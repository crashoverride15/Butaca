// How a series tells its story, read from the synopses of one season's episodes (D42). Pure.
// A case per episode (Bones): most synopses bring a crime, a patient or a client, and new names each time.
// A plot that goes on (Maratón): few cases, the same names, and words of a story that carries over.

export interface EpisodeSignal {
  /** episodes with a usable synopsis */
  sampled: number;
  /** share of episodes whose synopsis brings a case (crime, victim, patient, client…) */
  caseRatio: number;
  /** share of episodes whose synopsis carries the story over (meanwhile, aftermath, plan…) */
  serialRatio: number;
  /** share of names in a synopsis that appear in no other episode: guests of the week */
  guestRatio: number;
}

export interface EpisodeText {
  name?: string;
  overview?: string;
}

// TMDB synopses in English (they are far more complete than the Spanish ones).
const CASE = /\b(murder(ed|s|er)?|kill(ed|er|ing|s)?|victims?|bod(y|ies)|corpse|cases?|patients?|clients?|suspects?|homicide|found dead|investigat\w*|crime scene|robbery|kidnapp\w*|unsub|remains|defend\w*|trial|lawsuit|missing (girl|boy|woman|man|child|person|teen))\b/;
const SERIAL = /\b(meanwhile|continues?|aftermath|after the events|the truth about|plans? to|alliance|betray\w*|escape\w*|revenge|uprising|conspiracy|power struggle|takes? control|hunts? for|on the run|final confrontation|ultimate|cliffhanger|in the wake of)\b/;
const NAME = /\b[A-Z][a-z]{2,}\b/g;
// capitalised words that are not names
const NOT_NAMES = new Set(
  'The When After While With Meanwhile Then But And Also Their They This That When Where What Who His Her Its One Two Three Four Five Season Episode Part Back Now Elsewhere Later Finally Soon Before During'.split(' '),
);

const MIN_TEXT = 40;
const MIN_EPISODES = 4;
/** a name in at least this share of the episodes is a regular character */
const REGULAR = 0.3;

function names(text: string): Set<string> {
  const out = new Set<string>();
  // the first word of each sentence is capitalised anyway
  for (const sentence of text.split(/[.!?]\s+/)) {
    const found = sentence.match(NAME) ?? [];
    for (const [i, w] of found.entries()) {
      if (i === 0 && sentence.trimStart().startsWith(w)) continue;
      if (!NOT_NAMES.has(w)) out.add(w);
    }
  }
  return out;
}

/** The signal of one season, or null with too few synopses to say anything. */
export function episodeSignal(episodes: EpisodeText[]): EpisodeSignal | null {
  const texts = episodes.map((e) => (e.overview ?? '').trim()).filter((t) => t.length >= MIN_TEXT);
  if (texts.length < MIN_EPISODES) return null;
  const lower = texts.map((t) => t.toLowerCase());
  const perEpisode = texts.map(names);
  const seenIn = new Map<string, number>();
  for (const set of perEpisode) for (const n of set) seenIn.set(n, (seenIn.get(n) ?? 0) + 1);
  const regular = (n: string) => (seenIn.get(n) ?? 0) / texts.length >= REGULAR;
  const guestShares = perEpisode.filter((s) => s.size > 0).map((s) => [...s].filter((n) => seenIn.get(n) === 1 && !regular(n)).length / s.size);
  const share = (re: RegExp) => lower.filter((t) => re.test(t)).length / texts.length;
  return {
    sampled: texts.length,
    caseRatio: share(CASE),
    serialRatio: share(SERIAL),
    guestRatio: guestShares.length > 0 ? guestShares.reduce((a, b) => a + b, 0) / guestShares.length : 0,
  };
}

/** The season to read: the first one with enough episodes to judge. */
export function seasonToSample(seasons: { number: number; episodeCount: number }[]): number | null {
  const ok = seasons.filter((s) => s.number > 0 && s.episodeCount >= MIN_EPISODES).sort((a, b) => a.number - b.number);
  return ok[0]?.number ?? null;
}

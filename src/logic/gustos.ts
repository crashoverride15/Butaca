import { toggleSeries, isSeriesSeen, type SeasonInfo } from './watched';
import { discoverParamsFor, type Profile } from './featured';
import type { LibraryEntry, Provider, TitleCard } from '../store/types';

// "Gustos" deck (D28): titles on my platforms that I answer "seen (with a score)" or "not seen". Pure.

/** Seen: a movie gets its date, a series all its aired episodes; the score is kept if given. */
export function markSeen(entry: LibraryEntry, seasons: SeasonInfo[] | null, score: number | null, now = Date.now()): LibraryEntry {
  let next: LibraryEntry = { ...entry, notSeenAt: null, inWatchlist: false, myScore: score ?? entry.myScore };
  if (entry.type === 'movie') next = { ...next, seenAt: entry.seenAt ?? now };
  else if (seasons && !isSeriesSeen(next, seasons)) next = toggleSeries(next, seasons);
  return next;
}

export const markNotSeen = (entry: LibraryEntry, now = Date.now()): LibraryEntry => ({ ...entry, notSeenAt: now });

/** What to ask TMDB for: my taste when there is one (genres only: decades would narrow the deck), else what is popular. */
export function deckParams(profile: Profile, mine: Provider[]): Record<string, string | number> {
  if (profile.refs.length > 0) return { ...discoverParamsFor({ ...profile, decades: [] }, mine), 'vote_count.gte': 300 };
  return {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate',
    with_watch_providers: mine.map((p) => p.id).join('|'),
    'vote_count.gte': 500,
    sort_by: 'popularity.desc',
  };
}

/** Cards not yet answered, the ones that share my favourite genres first (the rest keep TMDB's order). */
export function rankDeck(cards: TitleCard[], profile: Profile, exclude: ReadonlySet<string>): TitleCard[] {
  const seen = new Set<string>();
  const fresh = cards.filter((c) => {
    if (exclude.has(c.key) || seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
  const overlap = (c: TitleCard) => c.genreIds.filter((g) => profile.topGenres.includes(g)).length;
  return fresh.map((c, i) => ({ c, i })).sort((a, b) => overlap(b.c) - overlap(a.c) || a.i - b.i).map((x) => x.c);
}

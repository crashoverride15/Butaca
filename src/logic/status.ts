import type { LibraryEntry, Title } from '../store/types';
import { isSeen, isSeriesSeen, seasonsOf, seenAired } from './watched';

// Derived state — spec §5. Never stored.

export type WatchStatus = 'por_ver' | 'en_curso' | 'vista' | null;

export function watchStatus(title: Title, entry: LibraryEntry | undefined, today: string): WatchStatus {
  if (!entry) return null;
  if (title.type === 'movie') {
    if (entry.seenAt !== null) return 'vista';
    return entry.inWatchlist ? 'por_ver' : null;
  }
  const seasons = seasonsOf(title, today);
  const seen = seenAired(entry, seasons);
  if (seen === 0) return entry.inWatchlist ? 'por_ver' : null;
  return isSeriesSeen(entry, seasons) ? 'vista' : 'en_curso';
}

export const RANDOM_TAG = 'momento:random';

/** First aired episode not yet watched, walking the seasons in order. A series tagged Random is watched in no order: it has none. */
export function nextEpisode(title: Title, entry: LibraryEntry | undefined, today: string): { season: number; episode: number } | null {
  if (title.type !== 'tv' || entry?.tagIds.includes(RANDOM_TAG)) return null;
  const blank = entry ?? ({ seenEpisodes: {} } as LibraryEntry);
  for (const s of seasonsOf(title, today)) {
    for (let episode = 1; episode <= s.aired; episode++) {
      if (!isSeen(blank, s.number, episode)) return { season: s.number, episode };
    }
  }
  return null;
}

export const todayIso = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

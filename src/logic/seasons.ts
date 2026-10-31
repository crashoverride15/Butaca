import { seasonsOf } from './watched';
import type { Alert, LibraryEntry, Title } from '../store/types';

// Season alerts — spec §7.4. Pure.

/** Followed: series I am in the middle of or have finished, or saved with some episode seen. */
export function isFollowed(title: Title, entry: LibraryEntry | undefined): boolean {
  if (title.type !== 'tv' || !entry) return false;
  return Object.values(entry.seenEpisodes).some((e) => e.length > 0);
}

export interface SeasonResult {
  alerts: Alert[];
  knownSeasons: number | null;
}

export function seasonAlerts(title: Title, entry: LibraryEntry, today: string, now: number): SeasonResult {
  const total = title.numberOfSeasons ?? null;
  if (total === null) return { alerts: [], knownSeasons: entry.knownSeasons };
  // first time it is followed: remember how many there are, no alert
  if (entry.knownSeasons === null) return { alerts: [], knownSeasons: total };

  const alerts: Alert[] = [];
  let known = entry.knownSeasons;
  const seasons = seasonsOf(title, today);
  const last = seasons.find((s) => s.number === total);

  if (total > known && last && last.aired > 0) {
    alerts.push({
      id: `new_season:${title.key}:${total}`,
      kind: 'new_season',
      key: title.key,
      season: total,
      episodeCount: last.total,
      airDate: title.seasons?.find((s) => s.number === total)?.airDate ?? null,
      createdAt: now,
      read: false,
    });
    known = total;
  }

  const next = title.nextEpisodeToAir;
  const lastAired = Math.max(0, ...seasons.filter((s) => s.aired > 0).map((s) => s.number));
  if (next && next.episode === 1 && next.season > lastAired) {
    alerts.push({
      id: `upcoming_season:${title.key}:${next.season}`,
      kind: 'upcoming_season',
      key: title.key,
      season: next.season,
      airDate: next.airDate,
      createdAt: now,
      read: false,
    });
  }
  return { alerts, knownSeasons: known };
}

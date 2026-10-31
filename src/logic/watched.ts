import type { LibraryEntry, Title } from '../store/types';

// Watched episodes — spec §5 and §9.2. Pure functions: they return a new entry.

export interface SeasonInfo {
  number: number;
  /** episodes that have already aired */
  aired: number;
  /** episodes the season will have */
  total: number;
}

/** Seasons with how many episodes are out by `today` (YYYY-MM-DD). Specials (season 0) never appear. */
export function seasonsOf(title: Title, today: string): SeasonInfo[] {
  const last = title.lastEpisodeToAir;
  return (title.seasons ?? []).map((s) => {
    let aired = 0;
    if (s.airDate && s.airDate <= today) {
      aired = s.episodeCount;
      if (last && last.season === s.number) aired = Math.min(last.episode, s.episodeCount);
      else if (last && last.season < s.number) aired = 0;
    } else if (last && last.season >= s.number) {
      // the date is missing but TMDB says a later episode already aired
      aired = last.season === s.number ? Math.min(last.episode, s.episodeCount) : s.episodeCount;
    }
    return { number: s.number, aired, total: s.episodeCount };
  });
}

const seenIn = (entry: LibraryEntry, season: number): number[] => entry.seenEpisodes[season] ?? [];
export const isSeen = (entry: LibraryEntry, season: number, episode: number): boolean =>
  seenIn(entry, season).includes(episode);

const withSeason = (entry: LibraryEntry, season: number, episodes: number[]): LibraryEntry => {
  const seenEpisodes = { ...entry.seenEpisodes };
  if (episodes.length === 0) delete seenEpisodes[season];
  else seenEpisodes[season] = [...new Set(episodes)].sort((a, b) => a - b);
  return { ...entry, seenEpisodes };
};

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

export function seenAired(entry: LibraryEntry, seasons: SeasonInfo[]): number {
  return seasons.reduce((sum, s) => sum + seenIn(entry, s.number).filter((e) => e <= s.aired).length, 0);
}

export const totalAired = (seasons: SeasonInfo[]): number => seasons.reduce((sum, s) => sum + s.aired, 0);

export function toggleEpisode(entry: LibraryEntry, season: number, episode: number): LibraryEntry {
  const current = seenIn(entry, season);
  return withSeason(entry, season, current.includes(episode) ? current.filter((e) => e !== episode) : [...current, episode]);
}

/** "Marcar hasta aquí": every aired episode before this one, in every season, plus this one. */
export function markUpTo(entry: LibraryEntry, seasons: SeasonInfo[], season: number, episode: number): LibraryEntry {
  let next = entry;
  for (const s of seasons) {
    if (s.number < season) next = withSeason(next, s.number, [...seenIn(next, s.number), ...range(s.aired)]);
    else if (s.number === season) next = withSeason(next, s.number, [...seenIn(next, s.number), ...range(Math.min(episode, s.aired))]);
  }
  return next;
}

export const isSeasonSeen = (entry: LibraryEntry, s: SeasonInfo): boolean =>
  s.aired > 0 && seenIn(entry, s.number).filter((e) => e <= s.aired).length >= s.aired;

export function toggleSeason(entry: LibraryEntry, s: SeasonInfo): LibraryEntry {
  return isSeasonSeen(entry, s) ? withSeason(entry, s.number, []) : withSeason(entry, s.number, range(s.aired));
}

export const isSeriesSeen = (entry: LibraryEntry, seasons: SeasonInfo[]): boolean => {
  const total = totalAired(seasons);
  return total > 0 && seenAired(entry, seasons) >= total;
};

export function toggleSeries(entry: LibraryEntry, seasons: SeasonInfo[]): LibraryEntry {
  if (isSeriesSeen(entry, seasons)) return { ...entry, seenEpisodes: {} };
  let next = entry;
  for (const s of seasons) if (s.aired > 0) next = withSeason(next, s.number, range(s.aired));
  return next;
}

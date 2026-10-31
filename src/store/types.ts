// Data model — spec §5.

export type MediaType = 'movie' | 'tv';

export interface Provider {
  id: number;
  name: string;
}

export interface Title {
  key: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  originalTitle: string;
  year: number | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: { id: number; name: string }[];
  keywords: number[];
  originCountry: string[];
  originalLanguage: string;
  runtime: number | null;
  imdbId: string | null;
  // series only
  status?: string;
  numberOfSeasons?: number;
  seasons?: { number: number; episodeCount: number; airDate: string | null }[];
  lastEpisodeToAir?: { season: number; episode: number; airDate: string } | null;
  nextEpisodeToAir?: { season: number; episode: number; airDate: string } | null;
  providers: Provider[];
  recommendations: string[];
  similar: string[];
  ratings: { imdb: number | null; rt: number | null; fetchedAt: number | null };
  fetchedAt: number;
  providersFetchedAt: number;
}

export interface LibraryEntry {
  key: string;
  type: MediaType;
  inWatchlist: boolean;
  myScore: number | null;
  tagIds: string[];
  seenAt: number | null;
  seenEpisodes: Record<string, number[]>;
  knownSeasons: number | null;
  addedAt: number;
  updatedAt: number;
}

export type TagGroup = 'momento' | 'estilo' | 'epoca' | 'origen' | 'libre';

export interface Tag {
  id: string;
  name: string;
  group: TagGroup;
  order: number;
}

export interface Alert {
  id: string;
  kind: 'new_season' | 'upcoming_season' | 'new_on_platform';
  key: string;
  season?: number;
  episodeCount?: number;
  airDate?: string | null;
  providerName?: string;
  createdAt: number;
  read: boolean;
}

export interface Snapshot {
  id: string;
  providerId: number;
  type: MediaType;
  firstSeen: Record<number, number>;
  takenAt: number;
}

export interface Settings {
  id: 'main';
  tmdbToken: string;
  omdbKey: string;
  platforms: Provider[];
  region: 'ES';
  language: 'es-ES';
  lastRefreshAt: number | null;
  lastNoveltyRunAt: number | null;
  /** last time a backup file was made (spec §7.6) */
  lastBackupAt?: number | null;
}

// Cache for lists that are not titles (genres, provider catalogue): key → value + fetchedAt.
export interface CacheRecord {
  id: string;
  value: unknown;
  fetchedAt: number;
}

/** Light version of a title, enough to draw a tile before its detail is loaded. */
export interface TitleCard {
  key: string;
  type: MediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  genreIds: number[];
  voteAverage: number;
}

export const makeKey = (type: MediaType, tmdbId: number): string => `${type}:${tmdbId}`;

import { DAY, HOUR, isFresh, readCache, writeCache } from '../store/cache';
import { getTitleCached, putTitle } from '../store/titles';
import { getSettings } from '../store/settings';
import { makeKey, type MediaType, type Provider, type Title, type TitleCard } from '../store/types';
import { ApiError, logApiFailure } from './errors';
import { createQueue } from './queue';

// TMDB client — spec §6.1. Bearer token (v4), language es-ES, region ES, flatrate only.

const BASE = 'https://api.themoviedb.org/3';
export const TITLE_TTL = DAY;
export const PROVIDERS_TTL = 48 * HOUR;
export const GENRES_TTL = 30 * DAY;

const queue = createQueue(6);

type Params = Record<string, string | number | undefined>;

export async function tmdbGet<T>(path: string, params: Params = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? (await getSettings()).tmdbToken;
  if (!token) throw new ApiError('auth', 'Falta el token de TMDB. Añádelo en Ajustes.');
  const url = new URL(BASE + path);
  url.searchParams.set('language', 'es-ES');
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  return queue.run(async () => {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch (e) {
      logApiFailure(`TMDB ${path}`, e);
      throw new ApiError('network', 'No hay conexión con TMDB.');
    }
    if (res.status === 401) throw new ApiError('auth', 'El token de TMDB no es válido. Cópialo de nuevo.');
    if (res.status === 404) throw new ApiError('missing', 'TMDB no tiene ese título.');
    if (res.status === 429) throw new ApiError('limit', 'TMDB pide esperar un momento. Prueba de nuevo en un minuto.');
    if (!res.ok) {
      logApiFailure(`TMDB ${path}`, res.status);
      throw new ApiError('http', 'TMDB no ha respondido bien. Prueba de nuevo más tarde.');
    }
    return (await res.json()) as T;
  });
}

/** Cheap call that needs a valid token. */
export async function checkTmdbToken(token: string): Promise<void> {
  await tmdbGet('/configuration', {}, token.trim());
}

// ---- Mapping (pure) -------------------------------------------------------------------------

interface RawResult {
  id: number;
  name?: string;
}

interface RawDetail {
  id: number;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { id: number; name: string }[];
  runtime?: number | null;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  origin_country?: string[];
  production_countries?: { iso_3166_1: string }[];
  original_language?: string;
  status?: string;
  number_of_seasons?: number;
  seasons?: { season_number: number; episode_count: number; air_date: string | null }[];
  last_episode_to_air?: { season_number: number; episode_number: number; air_date: string; runtime?: number | null } | null;
  next_episode_to_air?: { season_number: number; episode_number: number; air_date: string } | null;
  keywords?: { keywords?: RawResult[]; results?: RawResult[] };
  'watch/providers'?: { results?: Record<string, { flatrate?: { provider_id: number; provider_name: string }[] }> };
  recommendations?: { results?: RawResult[] };
  similar?: { results?: RawResult[] };
  // D39
  tagline?: string;
  vote_count?: number;
  popularity?: number;
  type?: string;
  number_of_episodes?: number;
  episode_run_time?: number[];
  in_production?: boolean;
  last_air_date?: string | null;
  networks?: { name: string }[];
  created_by?: { name: string }[];
  content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  release_dates?: { results?: { iso_3166_1: string; release_dates?: { certification?: string }[] }[] };
  aggregate_credits?: { cast?: { name: string }[] };
  credits?: { cast?: { name: string }[]; crew?: { name: string; job?: string }[] };
}

const yearOf = (date?: string): number | null => {
  const y = Number(date?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
};

const episodeRef = (e?: { season_number: number; episode_number: number; air_date: string } | null) =>
  e ? { season: e.season_number, episode: e.episode_number, airDate: e.air_date } : null;

/** Bump it when `mapTitle` starts keeping more: older cached titles are then fetched again the next time they are asked for. */
export const DETAIL_VERSION = 2;

const MAIN_CAST = 6;

function contentRatingOf(raw: RawDetail): string | null {
  const tv = raw.content_ratings?.results ?? [];
  const pick = tv.find((r) => r.iso_3166_1 === 'ES') ?? tv.find((r) => r.iso_3166_1 === 'US');
  if (pick?.rating) return pick.rating;
  const movie = raw.release_dates?.results ?? [];
  const m = movie.find((r) => r.iso_3166_1 === 'ES') ?? movie.find((r) => r.iso_3166_1 === 'US');
  return m?.release_dates?.find((d) => d.certification)?.certification ?? null;
}

export function mapTitle(type: MediaType, raw: RawDetail, now = Date.now(), previous?: Title): Title {
  const isTv = type === 'tv';
  const flatrate = raw['watch/providers']?.results?.ES?.flatrate ?? [];
  const keywordList = isTv ? raw.keywords?.results : raw.keywords?.keywords;
  const title: Title = {
    key: makeKey(type, raw.id),
    tmdbId: raw.id,
    type,
    title: (isTv ? raw.name : raw.title) ?? '',
    originalTitle: (isTv ? raw.original_name : raw.original_title) ?? '',
    year: yearOf(isTv ? raw.first_air_date : raw.release_date),
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    genres: raw.genres ?? [],
    keywords: (keywordList ?? []).map((k) => k.id),
    originCountry: isTv ? (raw.origin_country ?? []) : (raw.production_countries ?? []).map((c) => c.iso_3166_1),
    originalLanguage: raw.original_language ?? '',
    runtime: isTv ? null : (raw.runtime ?? null),
    imdbId: raw.external_ids?.imdb_id ?? raw.imdb_id ?? null,
    providers: flatrate.map((p) => ({ id: p.provider_id, name: p.provider_name })),
    recommendations: (raw.recommendations?.results ?? []).map((r) => makeKey(type, r.id)),
    similar: (raw.similar?.results ?? []).map((r) => makeKey(type, r.id)),
    ratings: previous?.ratings ?? { imdb: null, rt: null, fetchedAt: null },
    fetchedAt: now,
    providersFetchedAt: now,
    detailVersion: DETAIL_VERSION,
    keywordNames: (keywordList ?? []).map((k) => (k.name ?? '').toLowerCase()).filter(Boolean),
    cast: [
      ...(isTv ? raw.aggregate_credits?.cast : raw.credits?.cast)?.slice(0, MAIN_CAST).map((c) => c.name) ?? [],
      ...(isTv ? (raw.created_by ?? []).map((c) => c.name) : (raw.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name)),
    ],
    tagline: raw.tagline || undefined,
    contentRating: contentRatingOf(raw),
    voteCount: raw.vote_count,
    popularity: raw.popularity,
  };
  if (isTv) {
    title.tvType = raw.type;
    title.numberOfEpisodes = raw.number_of_episodes;
    title.episodeRuntime = raw.episode_run_time?.[0] ?? raw.last_episode_to_air?.runtime ?? null;
    title.inProduction = raw.in_production;
    title.lastAirDate = raw.last_air_date ?? null;
    title.networks = (raw.networks ?? []).map((n) => n.name);
    title.createdBy = (raw.created_by ?? []).map((c) => c.name);
    title.status = raw.status;
    title.numberOfSeasons = raw.number_of_seasons;
    title.seasons = (raw.seasons ?? [])
      .filter((s) => s.season_number > 0)
      .map((s) => ({ number: s.season_number, episodeCount: s.episode_count, airDate: s.air_date }));
    title.lastEpisodeToAir = episodeRef(raw.last_episode_to_air);
    title.nextEpisodeToAir = episodeRef(raw.next_episode_to_air);
  }
  return title;
}

// ---- Title detail with cache ----------------------------------------------------------------

/**
 * Detail for one title. Fresh cache wins; if the network fails the stale cache is used and
 * nothing is shown to the user unless there is nothing at all (spec §6.1).
 */
export async function getTitle(type: MediaType, tmdbId: number, opts: { force?: boolean } = {}): Promise<Title> {
  const key = makeKey(type, tmdbId);
  const cached = await getTitleCached(key);
  if (cached && !opts.force && isFresh(cached.fetchedAt, TITLE_TTL) && cached.detailVersion === DETAIL_VERSION) return cached;
  try {
    const raw = await tmdbGet<RawDetail>(`/${type}/${tmdbId}`, {
      append_to_response: `external_ids,watch/providers,recommendations,similar,keywords,${type === 'tv' ? 'content_ratings,aggregate_credits' : 'release_dates,credits'}`,
    });
    if (!raw.overview?.trim()) {
      // No Spanish synopsis: use the English one (spec §9.2).
      const en = await tmdbGet<{ overview?: string }>(`/${type}/${tmdbId}`, { language: 'en-US' }).catch(() => null);
      raw.overview = en?.overview ?? '';
    }
    const title = mapTitle(type, raw, Date.now(), cached);
    await putTitle(title);
    return title;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

// ---- Platform catalogue and genres ----------------------------------------------------------

export interface CatalogueProvider extends Provider {
  logoPath: string | null;
}

interface RawProviders {
  results?: { provider_id: number; provider_name: string; logo_path: string | null; display_priority?: number }[];
}

export async function getProviderCatalogue(): Promise<CatalogueProvider[]> {
  const id = 'providers:ES';
  const cached = await readCache<CatalogueProvider[]>(id);
  if (cached && isFresh(cached.fetchedAt, PROVIDERS_TTL)) return cached.value;
  try {
    const [movie, tv] = await Promise.all([
      tmdbGet<RawProviders>('/watch/providers/movie', { watch_region: 'ES' }),
      tmdbGet<RawProviders>('/watch/providers/tv', { watch_region: 'ES' }),
    ]);
    const byId = new Map<number, CatalogueProvider & { priority: number }>();
    for (const p of [...(movie.results ?? []), ...(tv.results ?? [])]) {
      const priority = p.display_priority ?? 999;
      const known = byId.get(p.provider_id);
      if (!known || priority < known.priority) {
        byId.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logoPath: p.logo_path, priority });
      }
    }
    const list = [...byId.values()].sort((a, b) => a.priority - b.priority).map(({ priority: _p, ...rest }) => rest);
    await writeCache(id, list);
    return list;
  } catch (e) {
    if (cached) return cached.value;
    throw e;
  }
}

export async function getGenres(type: MediaType): Promise<{ id: number; name: string }[]> {
  const id = `genres:${type}`;
  const cached = await readCache<{ id: number; name: string }[]>(id);
  if (cached && isFresh(cached.fetchedAt, GENRES_TTL)) return cached.value;
  try {
    const res = await tmdbGet<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`);
    await writeCache(id, res.genres);
    return res.genres;
  } catch (e) {
    if (cached) return cached.value;
    throw e;
  }
}

// ---- Platforms: names, colours, defaults ----------------------------------------------------

/** Pre-selected on first run: names containing Prime Video, Disney, or HBO Max / Max (spec §6.1). */
export function isDefaultPlatform(name: string): boolean {
  return /prime video/i.test(name) || /disney/i.test(name) || /hbo/i.test(name) || /\bmax\b/i.test(name);
}

export function shortPlatformName(name: string): string {
  if (/prime/i.test(name)) return 'Prime Video';
  if (/disney/i.test(name)) return 'Disney+';
  if (/hbo|\bmax\b/i.test(name)) return 'HBO Max';
  return name;
}

export function platformColor(name: string): string {
  if (/prime/i.test(name)) return 'var(--prime)';
  if (/disney/i.test(name)) return 'var(--disney)';
  if (/hbo|\bmax\b/i.test(name)) return 'var(--hbo)';
  return 'var(--platform-other)';
}

export const logoUrl = (path: string | null): string | null => (path ? `https://image.tmdb.org/t/p/w92${path}` : null);

// ---- Lists: discover, search, credits -------------------------------------------------------

interface RawListItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  popularity?: number;
}

export function cardFromRaw(type: MediaType, raw: RawListItem): TitleCard {
  return {
    key: makeKey(type, raw.id),
    type,
    tmdbId: raw.id,
    title: (type === 'tv' ? raw.name : raw.title) ?? '',
    year: yearOf(type === 'tv' ? raw.first_air_date : raw.release_date),
    posterPath: raw.poster_path ?? null,
    genreIds: raw.genre_ids ?? [],
    voteAverage: raw.vote_average ?? 0,
  };
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

export async function discover(type: MediaType, params: Params, page: number): Promise<Page<TitleCard>> {
  const res = await tmdbGet<{ results: RawListItem[]; total_pages: number }>(`/discover/${type}`, { ...params, page });
  return { items: res.results.map((r) => cardFromRaw(type, r)), page, totalPages: res.total_pages };
}

export interface PersonHit {
  id: number;
  name: string;
}

export interface SearchResult {
  cards: TitleCard[];
  person: PersonHit | null;
}

/** Search across movies, series and people; the first result being a person is reported (spec §9.3). */
export async function searchMulti(query: string): Promise<SearchResult> {
  const res = await tmdbGet<{ results: (RawListItem & { media_type?: string })[] }>('/search/multi', { query, include_adult: 'false', page: 1 });
  const first = res.results[0];
  const person = first?.media_type === 'person' ? { id: first.id, name: first.name ?? '' } : null;
  const cards = res.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => cardFromRaw(r.media_type as MediaType, r));
  return { cards, person };
}

/** Titles of a person as actor or director, most popular first, no duplicates. */
export async function personCredits(id: number): Promise<TitleCard[]> {
  const res = await tmdbGet<{ cast?: RawListItem[]; crew?: (RawListItem & { job?: string })[] }>(`/person/${id}/combined_credits`);
  const all = [...(res.cast ?? []), ...(res.crew ?? []).filter((c) => c.job === 'Director')].filter(
    (r) => r.media_type === 'movie' || r.media_type === 'tv',
  );
  const seen = new Set<string>();
  return all
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((r) => cardFromRaw(r.media_type as MediaType, r))
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

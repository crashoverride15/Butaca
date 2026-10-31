import { DAY, isFresh } from '../store/cache';
import { putTitle } from '../store/titles';
import { getSettings } from '../store/settings';
import type { Title } from '../store/types';
import { ApiError, logApiFailure } from './errors';
import { createQueue } from './queue';

// OMDb client — spec §6.2. IMDb and Rotten Tomatoes ratings, 7-day cache, 3 at a time.

const BASE = 'https://www.omdbapi.com/';
export const RATINGS_TTL = 7 * DAY;

const queue = createQueue(3);

interface RawOmdb {
  Response?: string;
  Error?: string;
  imdbRating?: string;
  Ratings?: { Source: string; Value: string }[];
}

export interface Ratings {
  imdb: number | null;
  rt: number | null;
}

/** "8.0" → 8, "N/A" → null; Rotten Tomatoes "91%" → 91, absent → null (normal for series). */
export function parseRatings(raw: RawOmdb): Ratings {
  const imdb = Number.parseFloat(raw.imdbRating ?? '');
  const rtText = raw.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value ?? '';
  const rt = Number.parseInt(rtText, 10);
  return {
    imdb: Number.isFinite(imdb) ? imdb : null,
    rt: Number.isFinite(rt) ? rt : null,
  };
}

async function omdbGet(imdbId: string, apiKey: string): Promise<RawOmdb> {
  const url = new URL(BASE);
  url.searchParams.set('i', imdbId);
  url.searchParams.set('apikey', apiKey);
  return queue.run(async () => {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      logApiFailure('OMDb', e);
      throw new ApiError('network', 'No hay conexión con OMDb.');
    }
    if (res.status === 401) throw new ApiError('auth', 'La clave de OMDb no es válida. Cópiala de nuevo.');
    if (!res.ok) {
      logApiFailure('OMDb', res.status);
      throw new ApiError('http', 'OMDb no ha respondido bien. Prueba de nuevo más tarde.');
    }
    const body = (await res.json()) as RawOmdb;
    if (body.Response === 'False') {
      logApiFailure('OMDb', body.Error);
      if (/invalid api key/i.test(body.Error ?? '')) throw new ApiError('auth', 'La clave de OMDb no es válida. Cópiala de nuevo.');
      if (/limit/i.test(body.Error ?? '')) throw new ApiError('limit', 'OMDb ha llegado al límite de hoy.');
      throw new ApiError('missing', 'OMDb no tiene nota para ese título.');
    }
    return body;
  });
}

/** Cheap call that needs a valid key (a well-known title). */
export async function checkOmdbKey(apiKey: string): Promise<void> {
  await omdbGet('tt0111161', apiKey.trim());
}

/**
 * Ratings for a title on screen. Cached 7 days inside the title; errors keep what was there
 * (the slot shows `–`, never disappears).
 */
export async function ensureRatings(title: Title): Promise<Title> {
  if (!title.imdbId) return title;
  const fetchedAt = title.ratings.fetchedAt;
  if (fetchedAt !== null && isFresh(fetchedAt, RATINGS_TTL)) return title;
  const { omdbKey } = await getSettings();
  if (!omdbKey) return title;
  try {
    const ratings = parseRatings(await omdbGet(title.imdbId, omdbKey));
    const next = { ...title, ratings: { ...ratings, fetchedAt: Date.now() } };
    await putTitle(next);
    return next;
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'missing') {
      // OMDb has no entry: remember it for a week so the daily allowance is not wasted.
      const next = { ...title, ratings: { imdb: null, rt: null, fetchedAt: Date.now() } };
      await putTitle(next);
      return next;
    }
    return title;
  }
}

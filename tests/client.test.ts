import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/errors';
import { checkOmdbKey, ensureRatings } from '../src/api/omdb';
import { checkTmdbToken, getTitle, TITLE_TTL } from '../src/api/tmdb';
import { saveSettings } from '../src/store/settings';
import { getTitleCached, putTitle } from '../src/store/titles';
import { freshDb, jsonResponse } from './helpers';

const fetchMock = vi.fn();

beforeEach(async () => {
  await freshDb();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await saveSettings({ tmdbToken: 'test-token', omdbKey: 'test-key' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const detail = (overview = 'Sinopsis') => ({ id: 949, title: 'Heat', release_date: '1995-12-15', overview, imdb_id: 'tt0113277' });

describe('getTitle', () => {
  it('fetches, caches, and serves the cache while fresh', async () => {
    fetchMock.mockResolvedValue(jsonResponse(detail()));
    const first = await getTitle('movie', 949);
    expect(first.title).toBe('Heat');
    expect(await getTitleCached('movie:949')).toBeDefined();
    await getTitle('movie', 949);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the bearer token, region language and appended data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(detail()));
    await getTitle('movie', 949);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/movie/949');
    expect(String(url)).toContain('language=es-ES');
    expect(String(url)).toContain('append_to_response=');
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('falls back to the English synopsis when there is none in Spanish', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detail('')))
      .mockResolvedValueOnce(jsonResponse({ overview: 'English synopsis' }));
    expect((await getTitle('movie', 949)).overview).toBe('English synopsis');
    expect(String(fetchMock.mock.calls[1][0])).toContain('language=en-US');
  });

  it('uses the expired cache when the network fails, without raising', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
    const first = await getTitle('movie', 949);
    await putTitle({ ...first, fetchedAt: Date.now() - TITLE_TTL - 1 });
    fetchMock.mockRejectedValue(new TypeError('offline'));
    expect((await getTitle('movie', 949)).title).toBe('Heat');
  });

  it('raises when the network fails and there is nothing cached', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(getTitle('movie', 1)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('error messages', () => {
  it('reports an invalid TMDB token in one sentence, never the response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status_message: 'SECRET-BODY' }, 401));
    const error = await checkTmdbToken('bad').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('auth');
    expect((error as ApiError).message).toBe('El token de TMDB no es válido. Cópialo de nuevo.');
    expect((error as ApiError).message).not.toContain('SECRET-BODY');
  });

  it('reports an invalid OMDb key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ Response: 'False', Error: 'Invalid API key!' }));
    await expect(checkOmdbKey('bad')).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('ensureRatings', () => {
  const base = async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
    return getTitle('movie', 949);
  };

  it('fills and stores the ratings once, then uses the 7-day cache', async () => {
    const title = await base();
    fetchMock.mockResolvedValue(jsonResponse({ Response: 'True', imdbRating: '8.3', Ratings: [{ Source: 'Rotten Tomatoes', Value: '87%' }] }));
    const rated = await ensureRatings(title);
    expect(rated.ratings).toMatchObject({ imdb: 8.3, rt: 87 });
    await ensureRatings(rated);
    expect(fetchMock).toHaveBeenCalledTimes(2); // detail + one OMDb call
    expect((await getTitleCached('movie:949'))?.ratings.imdb).toBe(8.3);
  });

  it('leaves the ratings empty on network failure so the slot shows a dash', async () => {
    const title = await base();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    expect((await ensureRatings(title)).ratings).toEqual({ imdb: null, rt: null, fetchedAt: null });
  });

  it('does nothing without an OMDb key', async () => {
    const title = await base();
    await saveSettings({ omdbKey: '' });
    await ensureRatings(title);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

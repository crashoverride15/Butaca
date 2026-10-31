import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProfile, defaultMoment, EYEBROW, momentTagId, pickFeatured } from '../src/logic/featured';
import { diffSnapshot, isNew, noveltyDue, recentArrivals, relativeArrival, DAY_MS } from '../src/logic/novelties';
import { runRefresh, refreshDue, REFRESH_INTERVAL_MS } from '../src/logic/refresh';
import { isFollowed, seasonAlerts } from '../src/logic/seasons';
import { candidateKeys, commonCaption, pairScore, similarTo } from '../src/logic/similar';
import { addAlerts, listAlerts, markRead, unreadCount } from '../src/store/alerts';
import { emptyEntry, getEntry, saveEntry } from '../src/store/library';
import { getSettings, saveSettings } from '../src/store/settings';
import { getAllSnapshots } from '../src/store/snapshots';
import type { LibraryEntry, Title } from '../src/store/types';
import { freshDb, jsonResponse } from './helpers';

const title = (key: string, patch: Partial<Title> = {}): Title =>
  ({
    key, tmdbId: Number(key.split(':')[1]), type: key.startsWith('tv') ? 'tv' : 'movie', title: key, originalTitle: '', year: 1995, overview: '',
    posterPath: null, backdropPath: null, genres: [], keywords: [], originCountry: ['US'], originalLanguage: 'en', runtime: null, imdbId: null,
    providers: [{ id: 119, name: 'Prime' }], recommendations: [], similar: [], ratings: { imdb: null, rt: null, fetchedAt: null }, fetchedAt: 0, providersFetchedAt: 0, ...patch,
  }) as Title;
const entry = (key: string, patch: Partial<LibraryEntry> = {}): LibraryEntry => ({ ...emptyEntry(key, key.startsWith('tv') ? 'tv' : 'movie', 0), ...patch });
const mine = [{ id: 119, name: 'Prime' }];

describe('similar (spec §7.1)', () => {
  const target = title('movie:1', { genres: [{ id: 80, name: 'Crimen' }, { id: 28, name: 'Acción' }], keywords: [1, 2, 3, 4, 5, 6], year: 1995 });

  it('adds up each rule', () => {
    const c = title('movie:2', { genres: [{ id: 80, name: 'Crimen' }], keywords: [1, 2, 3, 4, 5, 6], year: 1999, ratings: { imdb: 8, rt: null, fetchedAt: 1 } });
    // 3 tags + 2 genre + 4 keywords(max) + 3 decade + 2 country + 1 recommended + 1 imdb>=7.5
    const r = pairScore({ title: c, tagIds: ['a'] }, { title: target, tagIds: ['a'] }, true);
    expect(r.score).toBe(3 + 2 + 4 + 3 + 2 + 1 + 1);
    expect(r.common).toBe(1 + 1 + 1);
  });
  it('contiguous decade is worth 1', () => {
    const c = title('movie:3', { year: 2003 });
    expect(pairScore({ title: c, tagIds: [] }, { title: target, tagIds: [] }, false).score).toBe(1 + 2);
  });
  it('drops seen titles and those off my platforms, orders by score then IMDb, and caps at 12', () => {
    const library: Record<string, LibraryEntry> = {};
    const cands = [
      title('movie:2', { genres: [{ id: 80, name: 'Crimen' }] }),
      title('movie:3', { genres: [{ id: 80, name: 'Crimen' }, { id: 28, name: 'Acción' }] }),
      title('movie:4', { providers: [{ id: 8, name: 'Netflix' }], genres: [{ id: 80, name: 'Crimen' }] }),
      title('movie:5', { genres: [{ id: 80, name: 'Crimen' }] }),
      title('tv:6', { genres: [{ id: 80, name: 'Crimen' }] }),
    ];
    const out = similarTo({ target, candidates: cands, library, seen: new Set(['movie:5']), mine });
    expect(out.map((i) => i.title.key)).toEqual(['movie:3', 'movie:2']);
    const many = Array.from({ length: 30 }, (_, i) => title(`movie:${100 + i}`));
    expect(similarTo({ target, candidates: many, library, seen: new Set(), mine })).toHaveLength(12);
  });
  it('captions: shared tags or "Recomendada por TMDB"', () => {
    expect(commonCaption(0)).toBe('Recomendada por TMDB');
    expect(commonCaption(1)).toBe('1 tag en común');
    expect(commonCaption(4)).toBe('4 tags en común');
  });
  it('candidates are TMDB recommendations, similar and my own of the same kind, without the target', () => {
    const t = title('movie:1', { recommendations: ['movie:2'], similar: ['movie:3', 'movie:2'] });
    const lib = { 'movie:9': entry('movie:9'), 'tv:8': entry('tv:8'), 'movie:1': entry('movie:1') };
    expect(candidateKeys(t, lib).sort()).toEqual(['movie:2', 'movie:3', 'movie:9']);
  });
});

describe('featured (spec §7.2)', () => {
  const noche = momentTagId('Noche');
  const titles = {
    'movie:1': title('movie:1', { genres: [{ id: 80, name: 'Crimen' }], year: 1995 }),
    'movie:2': title('movie:2', { genres: [{ id: 80, name: 'Crimen' }], year: 1996, ratings: { imdb: 8, rt: null, fetchedAt: 1 } }),
    'movie:3': title('movie:3', { genres: [{ id: 35, name: 'Comedia' }], year: 2020 }),
    'movie:4': title('movie:4', { genres: [{ id: 80, name: 'Crimen' }], year: 1998 }),
  };

  it('knows the default moment by hour and weekday', () => {
    expect(defaultMoment(new Date(2026, 9, 28, 22))).toBe('Noche');
    expect(defaultMoment(new Date(2026, 9, 29, 2))).toBe('Para dormirme');
    expect(defaultMoment(new Date(2026, 9, 28, 12))).toBe('Entre semana');
    expect(defaultMoment(new Date(2026, 9, 31, 12))).toBe('Noche'); // Saturday
    expect(EYEBROW['Para dormirme']).toBe('PARA DORMIRTE');
  });
  it('builds the profile from tagged titles rated 7 or more, else all tagged', () => {
    const entries = [entry('movie:1', { tagIds: [noche], myScore: 9 }), entry('movie:3', { tagIds: [noche], myScore: 3 })];
    expect(buildProfile('Noche', entries, titles).refs.map((r) => r.title.key)).toEqual(['movie:1']);
    expect(buildProfile('Noche', [entry('movie:3', { tagIds: [noche], myScore: 3 })], titles).refs).toHaveLength(1);
    expect(buildProfile('Entre semana', entries, titles).refs).toHaveLength(0);
  });
  it('prefers saved titles with the moment tag, then saved untagged that fit, then discovered; never seen ones', () => {
    const entries = [
      entry('movie:1', { tagIds: [noche], myScore: 9, seenAt: 1 }),
      entry('movie:2', { inWatchlist: true, tagIds: [noche] }),
      entry('movie:4', { inWatchlist: true }),
      entry('movie:3', { inWatchlist: true }), // does not fit the profile
    ];
    const discovered = [title('movie:7', { genres: [{ id: 80, name: 'Crimen' }], year: 1997 })];
    const out = pickFeatured({ moment: 'Noche', entries, titles, seen: new Set(['movie:1']), discovered });
    expect(out.map((o) => o.title.key)).toEqual(['movie:2', 'movie:4', 'movie:7']);
    expect(out[0].pill).toMatch(/^Coincide con \d+ de tus tags$/);
  });
  it('without a profile it offers the best IMDb of the discoveries and asks to tag titles', () => {
    const discovered = [title('movie:7', { ratings: { imdb: 6, rt: null, fetchedAt: 1 } }), title('movie:8', { ratings: { imdb: 8.5, rt: null, fetchedAt: 1 } })];
    const out = pickFeatured({ moment: 'Noche', entries: [], titles: {}, seen: new Set(), discovered });
    expect(out[0].title.key).toBe('movie:8');
    expect(out[0].pill).toBe('Elige títulos con el tag Noche para afinar');
    expect(pickFeatured({ moment: 'Noche', entries: [], titles: {}, seen: new Set(), discovered: [] })).toEqual([]);
  });
  it('gives at most five', () => {
    const many = Array.from({ length: 9 }, (_, i) => title(`movie:${50 + i}`));
    expect(pickFeatured({ moment: 'Noche', entries: [], titles: {}, seen: new Set(), discovered: many })).toHaveLength(5);
  });
});

describe('novelties (spec §7.3)', () => {
  const NOW = 10 * DAY_MS;
  it('the first run is only the baseline: nothing is new', () => {
    const d = diffSnapshot(undefined, 119, 'movie', [1, 2, 3], NOW);
    expect(d.baseline).toBe(true);
    expect(d.newIds).toEqual([]);
    expect(Object.keys(d.snapshot.firstSeen)).toHaveLength(3);
    expect(d.snapshot.id).toBe('119:movie');
  });
  it('the next run marks only ids that were not there, keeping the old dates', () => {
    const first = diffSnapshot(undefined, 119, 'movie', [1, 2], NOW);
    const next = diffSnapshot(first.snapshot, 119, 'movie', [1, 2, 3], NOW + DAY_MS);
    expect(next.newIds).toEqual([3]);
    expect(next.snapshot.firstSeen).toEqual({ 1: NOW, 2: NOW, 3: NOW + DAY_MS });
  });
  it('runs at most once a day; "new" is the last 14 days', () => {
    expect(noveltyDue(null, NOW)).toBe(true);
    expect(noveltyDue(NOW - DAY_MS + 1, NOW)).toBe(false);
    expect(noveltyDue(NOW - DAY_MS, NOW)).toBe(true);
    expect(isNew(NOW - 14 * DAY_MS, NOW)).toBe(true);
    expect(isNew(NOW - 15 * DAY_MS, NOW)).toBe(false);
  });
  it('lists recent arrivals once per title, newest first', () => {
    const a = diffSnapshot(undefined, 1, 'movie', [], NOW).snapshot;
    a.firstSeen = { 5: NOW - 2 * DAY_MS, 6: NOW - 20 * DAY_MS };
    const b = { ...a, id: '2:movie', providerId: 2, firstSeen: { 5: NOW - 5 * DAY_MS, 7: NOW - DAY_MS } };
    expect(recentArrivals([a, b], NOW).map((x) => [x.tmdbId, x.firstSeen])).toEqual([[7, NOW - DAY_MS], [5, NOW - 5 * DAY_MS]]);
  });
  it('writes relative dates in Spanish', () => {
    expect(relativeArrival(NOW, NOW)).toBe('Hoy');
    expect(relativeArrival(NOW - DAY_MS, NOW)).toBe('Ayer');
    expect(relativeArrival(NOW - 3 * DAY_MS, NOW)).toBe('Hace 3 días');
    expect(relativeArrival(NOW - 7 * DAY_MS, NOW)).toBe('Hace 1 semana');
    expect(relativeArrival(NOW - 21 * DAY_MS, NOW)).toBe('Hace 3 semanas');
  });
});

describe('season alerts (spec §7.4)', () => {
  const TODAY = '2026-10-30';
  const series = (patch: Partial<Title> = {}) =>
    title('tv:1', {
      numberOfSeasons: 3,
      seasons: [{ number: 1, episodeCount: 8, airDate: '2022-01-01' }, { number: 2, episodeCount: 8, airDate: '2023-01-01' }, { number: 3, episodeCount: 10, airDate: '2026-10-01' }],
      lastEpisodeToAir: { season: 3, episode: 2, airDate: '2026-10-08' },
      ...patch,
    });
  const e = (known: number | null) => entry('tv:1', { seenEpisodes: { 1: [1] }, knownSeasons: known });

  it('follows series with episodes seen', () => {
    expect(isFollowed(series(), e(null))).toBe(true);
    expect(isFollowed(series(), entry('tv:1', { inWatchlist: true }))).toBe(false);
    expect(isFollowed(title('movie:1'), e(null))).toBe(false);
  });
  it('the first time only remembers how many seasons there are', () => {
    expect(seasonAlerts(series(), e(null), TODAY, 1)).toEqual({ alerts: [], knownSeasons: 3 });
  });
  it('a new season that is already out raises "Ya disponible" and updates the count', () => {
    const r = seasonAlerts(series(), e(2), TODAY, 1);
    expect(r.knownSeasons).toBe(3);
    expect(r.alerts).toMatchObject([{ id: 'new_season:tv:1:3', kind: 'new_season', season: 3, episodeCount: 10, read: false }]);
    expect(seasonAlerts(series(), e(3), TODAY, 1).alerts).toEqual([]);
  });
  it('an announced season with a date raises "Próximamente"; one without a date raises nothing', () => {
    const upcoming = series({ numberOfSeasons: 3, lastEpisodeToAir: { season: 3, episode: 10, airDate: '2026-10-20' }, nextEpisodeToAir: { season: 4, episode: 1, airDate: '2027-01-14' } });
    const r = seasonAlerts(upcoming, e(3), TODAY, 1);
    expect(r.alerts).toMatchObject([{ id: 'upcoming_season:tv:1:4', kind: 'upcoming_season', airDate: '2027-01-14' }]);
    expect(seasonAlerts(series(), e(3), TODAY, 1).alerts).toEqual([]);
  });
});

describe('alerts store and refresh', () => {
  beforeEach(freshDb);

  it('keeps the read state of an alert that already exists and counts the unread', async () => {
    const a = { id: 'x:1', kind: 'new_season' as const, key: 'tv:1', createdAt: 1, read: false };
    expect(await addAlerts([a])).toBe(1);
    await markRead(['x:1']);
    expect(await addAlerts([a])).toBe(0);
    expect((await listAlerts())[0].read).toBe(true);
    expect(await unreadCount()).toBe(0);
    await addAlerts([{ ...a, id: 'y:2', createdAt: 2 }]);
    expect(await unreadCount()).toBe(1);
  });

  it('the refresh is due after 6 hours', () => {
    expect(refreshDue(null, 0)).toBe(true);
    expect(refreshDue(0, REFRESH_INTERVAL_MS - 1)).toBe(false);
    expect(refreshDue(0, REFRESH_INTERVAL_MS)).toBe(true);
  });

  it('does nothing without a token, or before it is due; forced it runs', async () => {
    expect((await runRefresh()).ran).toBe(false);
    await saveSettings({ tmdbToken: 't', lastRefreshAt: Date.now() });
    expect((await runRefresh()).ran).toBe(false);
  });

  it('a full refresh: baseline first, then new arrivals and a new season become alerts', async () => {
    const NOW = Date.now();
    const lists: Record<string, number[]> = { movie: [1, 2], tv: [10] };
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      const m = url.pathname.match(/\/discover\/(movie|tv)/);
      if (m) {
        return jsonResponse({ total_pages: 1, results: lists[m[1]].map((id) => ({ id, title: `t${id}`, name: `t${id}` })) });
      }
      if (url.pathname === '/3/tv/77') {
        return jsonResponse({ id: 77, name: 'Show', first_air_date: '2022-01-01', number_of_seasons: 3, overview: 'x',
          seasons: [{ season_number: 1, episode_count: 8, air_date: '2022-01-01' }, { season_number: 2, episode_count: 8, air_date: '2023-01-01' }, { season_number: 3, episode_count: 8, air_date: '2024-01-01' }],
          last_episode_to_air: { season_number: 3, episode_number: 8, air_date: '2024-03-01' } });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await saveSettings({ tmdbToken: 't', platforms: [{ id: 119, name: 'Prime Video' }] });
    await saveEntry(entry('tv:77', { seenEpisodes: { 1: [1] }, knownSeasons: 2 }));

    const first = await runRefresh({ now: NOW });
    expect(first).toEqual({ ran: true, noveltiesRan: true });
    expect((await getAllSnapshots()).map((s) => s.id).sort()).toEqual(['119:movie', '119:tv']);
    expect((await listAlerts()).map((a) => a.kind)).toEqual(['new_season']); // baseline raises no platform alert
    expect((await getEntry('tv:77'))?.knownSeasons).toBe(3);
    expect((await getSettings()).lastRefreshAt).toBe(NOW);

    lists.movie = [1, 2, 3];
    const second = await runRefresh({ now: NOW + 7 * 3_600_000 }); // due again, but novelties only once a day
    expect(second).toEqual({ ran: true, noveltiesRan: false });
    const third = await runRefresh({ now: NOW + 25 * 3_600_000 });
    expect(third.noveltiesRan).toBe(true);
    expect((await listAlerts()).map((a) => a.kind).sort()).toEqual(['new_on_platform', 'new_season']);
    vi.unstubAllGlobals();
  });
});

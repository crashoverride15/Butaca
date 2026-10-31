import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildKindProfile, EYEBROW, pickFeatured } from '../src/logic/featured';
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

describe('featured (D28: movies / series)', () => {
  const titles = {
    'movie:1': title('movie:1', { genres: [{ id: 80, name: 'Crimen' }], year: 1995 }),
    'movie:2': title('movie:2', { genres: [{ id: 80, name: 'Crimen' }], year: 1996, ratings: { imdb: 8, rt: null, fetchedAt: 1 } }),
    'movie:3': title('movie:3', { genres: [{ id: 35, name: 'Comedia' }], year: 2020 }),
    'tv:5': title('tv:5', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }], year: 2020 }),
  };

  it('has one eyebrow per kind', () => {
    expect(EYEBROW.movie).toBe('PELÍCULA PARA TI');
    expect(EYEBROW.tv).toBe('SERIE PARA TI');
  });
  it('builds the profile from titles of that kind rated 7 or more', () => {
    const entries = [entry('movie:1', { myScore: 9 }), entry('movie:3', { myScore: 3 }), entry('tv:5', { type: 'tv', myScore: 10 })];
    expect(buildKindProfile('movie', entries, titles).refs.map((r) => r.title.key)).toEqual(['movie:1']);
    expect(buildKindProfile('tv', entries, titles).refs.map((r) => r.title.key)).toEqual(['tv:5']);
    expect(buildKindProfile('tv', [entry('movie:1', { myScore: 9 })], titles).refs).toHaveLength(0);
  });
  it('offers my saved titles of the kind first, then discoveries, then a well-rated one I saw; never another kind', () => {
    const entries = [
      entry('movie:1', { myScore: 9, seenAt: 1 }),
      entry('movie:2', { inWatchlist: true }),
      entry('movie:3', { inWatchlist: true }),
      entry('tv:5', { type: 'tv', inWatchlist: true }),
    ];
    const discovered = [title('movie:7', { genres: [{ id: 80, name: 'Crimen' }], year: 1997 }), title('tv:9', { type: 'tv' })];
    const out = pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries, titles, seen: new Set(['movie:1']), discovered });
    expect(out.map((o) => o.title.key)).toEqual(['movie:2', 'movie:3', 'movie:7', 'movie:1']);
    expect(out[3].pill).toBe('Ya la has visto · tu nota 9');
    expect(out[0].pill).toMatch(/^Coincide con \d+ de tus gustos$/);
  });
  it('without a profile it offers the best IMDb of the discoveries and asks for tastes', () => {
    const discovered = [title('movie:7', { ratings: { imdb: 6, rt: null, fetchedAt: 1 } }), title('movie:8', { ratings: { imdb: 8.5, rt: null, fetchedAt: 1 } })];
    const out = pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries: [], titles: {}, seen: new Set(), discovered });
    expect(out[0].title.key).toBe('movie:8');
    expect(out[0].pill).toBe('Dime tus gustos para afinar');
    expect(pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries: [], titles: {}, seen: new Set(), discovered: [] })).toEqual([]);
  });
  it('may offer a title I saw and rated 8 or more, saying so, at most two and never a weak one', () => {
    const entries = [
      entry('movie:1', { myScore: 9, seenAt: 1 }),
      entry('movie:2', { myScore: 8, seenAt: 1 }),
      entry('movie:3', { myScore: 8, seenAt: 1 }),
      entry('movie:4', { myScore: 5, seenAt: 1 }),
    ];
    const t = { ...titles, 'movie:4': title('movie:4') };
    const discovered = Array.from({ length: 6 }, (_, i) => title(`movie:${60 + i}`, { genres: [{ id: 80, name: 'Crimen' }] }));
    const out = pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries, titles: t, seen: new Set(['movie:1', 'movie:2', 'movie:3', 'movie:4']), discovered });
    expect(out).toHaveLength(5);
    const again = out.filter((o) => o.pill.startsWith('Ya la has visto'));
    expect(again.map((o) => o.title.key)).toEqual(['movie:1', 'movie:2']);
    expect(again[0].pill).toBe('Ya la has visto · tu nota 9');
    expect(out.some((o) => o.title.key === 'movie:4')).toBe(false);
  });
  it('never offers a title that is not on my platforms, seen or not', () => {
    const elsewhere = title('movie:70', { providers: [{ id: 999, name: 'Otra' }] });
    const entries = [entry('movie:70', { inWatchlist: true }), entry('movie:71', { myScore: 10, seenAt: 1 })];
    const t = { ...titles, 'movie:70': elsewhere, 'movie:71': title('movie:71', { providers: [] }), 'movie:1': titles['movie:1'] };
    const out = pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries: [...entries, entry('movie:1', { myScore: 9, seenAt: 1 })], titles: t, seen: new Set(['movie:71', 'movie:1']), discovered: [elsewhere, title('movie:72')] });
    expect(out.map((o) => o.title.key).sort()).toEqual(['movie:1', 'movie:72']);
  });
  it('gives at most five', () => {
    const many = Array.from({ length: 9 }, (_, i) => title(`movie:${50 + i}`));
    expect(pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries: [], titles: {}, seen: new Set(), discovered: many })).toHaveLength(5);
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

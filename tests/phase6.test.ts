import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildKindProfile, EYEBROW, moreForYou, pickFeatured, recommendedKeys, topKeywords } from '../src/logic/featured';
import { diffSnapshot, isNew, noveltyDue, recentArrivals, relativeArrival, DAY_MS } from '../src/logic/novelties';
import { runRefresh, refreshDue, REFRESH_INTERVAL_MS } from '../src/logic/refresh';
import { isFollowed, seasonAlerts } from '../src/logic/seasons';
import { candidateKeys, momentMatch, plotCaption, similarTo, stems } from '../src/logic/similar';
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

  it('drops seen titles, those off my platforms and those with no plot link; orders by score then IMDb; caps at 12', () => {
    const library: Record<string, LibraryEntry> = {};
    const plot = { genres: [{ id: 80, name: 'Crimen' }], keywords: [1, 2, 3] };
    const t = { ...target, recommendations: ['movie:3'] };
    const cands = [
      title('movie:2', plot),
      title('movie:3', { ...plot, keywords: [] }), // only recommended
      title('movie:4', { ...plot, providers: [{ id: 8, name: 'Netflix' }] }),
      title('movie:5', plot),
      title('movie:6', { genres: [{ id: 80, name: 'Crimen' }, { id: 28, name: 'Acción' }] }), // same genres, no plot link
      title('tv:7', plot),
    ];
    const out = similarTo({ target: t, candidates: cands, library, seen: new Set(['movie:5']), mine });
    expect(out.map((i) => i.title.key)).toEqual(['movie:3', 'movie:2']);
    expect(out.map((i) => i.caption)).toEqual(['Recomendada por TMDB', '3 temas en común']);
    const many = Array.from({ length: 30 }, (_, i) => title(`movie:${100 + i}`, plot));
    expect(similarTo({ target: { ...t, recommendations: many.map((m) => m.key) }, candidates: many, library, seen: new Set(), mine })).toHaveLength(12);
  });
  it('a cartoon does not stand in for a live-action show, even with the same genres and tags (Person of Interest vs Invincible)', () => {
    const poi = title('tv:1', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }, { id: 18, name: 'Drama' }], keywords: [10, 11, 12, 13], year: 2011 });
    const invincible = title('tv:2', { type: 'tv', genres: [{ id: 16, name: 'Animación' }, { id: 80, name: 'Crimen' }, { id: 18, name: 'Drama' }], keywords: [10], year: 2021 });
    const mindhunter = title('tv:3', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }, { id: 18, name: 'Drama' }], keywords: [10, 11, 99], year: 2017 });
    const lib = { 'tv:1': entry('tv:1', { tagIds: ['estilo:thriller'] }), 'tv:2': entry('tv:2', { tagIds: ['estilo:thriller'] }) } as Record<string, LibraryEntry>;
    const out = similarTo({ target: poi, targetEntry: lib['tv:1'], candidates: [invincible, mindhunter], library: lib, seen: new Set(), mine });
    expect(out.map((i) => i.title.key)).toEqual(['tv:3']);
    // not even when TMDB recommends it: a cartoon is not live action
    const rec = similarTo({ target: { ...poi, recommendations: ['tv:2'] }, candidates: [invincible, mindhunter], library: lib, seen: new Set(), mine });
    expect(rec.map((i) => i.title.key)).toEqual(['tv:3']);
  });
  it('Person of Interest does not get Futurama: no genre in common and a cartoon, however many generic themes they share', () => {
    const poi = title('tv:1', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }, { id: 18, name: 'Drama' }, { id: 10765, name: 'Sci-Fi' }], keywords: [1, 2, 3, 4], year: 2011 });
    const futurama = title('tv:2', { type: 'tv', genres: [{ id: 16, name: 'Animación' }, { id: 35, name: 'Comedia' }, { id: 10765, name: 'Sci-Fi' }], keywords: [1, 2, 3], year: 1999 });
    const out = similarTo({ target: { ...poi, similar: ['tv:2'] }, candidates: [futurama], library: {}, seen: new Set(), mine });
    expect(out).toEqual([]);
  });
  it('a live-action show with other genres needs more than generic themes', () => {
    const t = title('tv:1', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }], keywords: [1, 2, 3], year: 2011 });
    const wrongGenre = title('tv:2', { type: 'tv', genres: [{ id: 35, name: 'Comedia' }], keywords: [1, 2, 3], year: 2011 });
    expect(similarTo({ target: t, candidates: [wrongGenre], library: {}, seen: new Set(), mine })).toEqual([]);
  });
  it('a theme every candidate has proves little: the rare one wins', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const t = title('movie:1', { genres: crime, keywords: [1, 2, 99] });
    const common = Array.from({ length: 8 }, (_, i) => title(`movie:${10 + i}`, { genres: crime, keywords: [1, 2] }));
    const rare = title('movie:50', { genres: crime, keywords: [99, 98] });
    const out = similarTo({ target: t, candidates: [...common, rare], library: {}, seen: new Set(), mine });
    expect(out[0].title.key).toBe('movie:50');
  });
  it('the synopsis links two titles that share no keyword', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const t = title('tv:1', { type: 'tv', genres: crime, overview: 'Un exmilitar y un millonario evitan crímenes con una máquina que predice asesinatos en Nueva York' });
    const same = title('tv:2', { type: 'tv', genres: crime, overview: 'Una máquina que predice asesinatos permite a un exmilitar evitar crímenes en la ciudad' });
    const other = title('tv:3', { type: 'tv', genres: crime, overview: 'Una chef recupera su restaurante familiar durante una difícil temporada de verano' });
    const out = similarTo({ target: t, candidates: [same, other], library: {}, seen: new Set(), mine });
    expect(out.map((i) => i.title.key)).toEqual(['tv:2']);
    expect(out[0].caption).toBe('Parecida en la trama');
  });
  it('stems drop accents, small words and plural endings', () => {
    expect(stems('Las máquinas predicen asesinatos')).toEqual(['maquin', 'predic', 'asesin']);
  });
  it('keeps the moment: a Random series is not offered for one of Entre semana, a same-moment one goes first', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const t = title('tv:1', { type: 'tv', genres: crime, keywords: [1, 2, 3], recommendations: ['tv:2', 'tv:3', 'tv:4'] });
    const random = title('tv:2', { type: 'tv', genres: crime, keywords: [1, 2, 3] });
    const weekday = title('tv:3', { type: 'tv', genres: crime, keywords: [1, 2, 3] });
    const untagged = title('tv:4', { type: 'tv', genres: crime, keywords: [1] });
    const lib = {
      'tv:1': entry('tv:1', { tagIds: ['momento:entre-semana'] }),
      'tv:2': entry('tv:2', { tagIds: ['momento:random'] }),
      'tv:3': entry('tv:3', { tagIds: ['momento:entre-semana'] }),
    } as Record<string, LibraryEntry>;
    const out = similarTo({ target: t, targetEntry: lib['tv:1'], candidates: [random, weekday, untagged], library: lib, seen: new Set(), mine });
    expect(out.map((i) => i.title.key)).toEqual(['tv:3', 'tv:4']);
  });
  it('uses the estimated moment of series I have not classified (D41): a sure clash is out, a guessed one goes last', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const t = title('tv:1', { type: 'tv', genres: crime, keywords: [1, 2, 3], recommendations: ['tv:2', 'tv:3', 'tv:4'] });
    const sleepy = title('tv:2', { type: 'tv', genres: crime, keywords: [1, 2, 3] });
    const marathon = title('tv:3', { type: 'tv', genres: crime, keywords: [1, 2] });
    const unknown = title('tv:4', { type: 'tv', genres: crime, keywords: [1, 2] });
    const lib = { 'tv:1': entry('tv:1', { tagIds: ['momento:maraton'] }) } as Record<string, LibraryEntry>;
    const estimated = { 'tv:2': 'momento:para-dormirme', 'tv:3': 'momento:maraton' };
    const out = similarTo({ target: t, targetEntry: lib['tv:1'], candidates: [sleepy, marathon, unknown], library: lib, seen: new Set(), mine, estimated });
    expect(out.map((i) => i.title.key)).toEqual(['tv:3', 'tv:4', 'tv:2']);
    // the target itself guessed: still a guess, so nothing is hidden
    const guessed = similarTo({ target: t, candidates: [sleepy, marathon], library: {}, seen: new Set(), mine, estimated: { ...estimated, 'tv:1': 'momento:maraton' } });
    expect(guessed.map((i) => i.title.key)).toEqual(['tv:3', 'tv:2']);
  });
  it('moment match only disagrees when both have a moment tag', () => {
    expect(momentMatch(['momento:random'], ['momento:entre-semana'])).toBe('different');
    expect(momentMatch(['momento:random', 'estilo:thriller'], ['momento:random'])).toBe('same');
    expect(momentMatch(['estilo:thriller'], ['momento:random'])).toBe('unknown');
    expect(momentMatch([], [])).toBe('unknown');
  });
  it('plot captions', () => {
    expect(plotCaption(true, 0)).toBe('Recomendada por TMDB');
    expect(plotCaption(false, 3)).toBe('3 temas en común');
    expect(plotCaption(false, 1)).toBe('Parecida en la trama');
  });
  it('candidates are TMDB recommendations, similar and my own of the same kind, without the target', () => {
    const t = title('movie:1', { recommendations: ['movie:2'], similar: ['movie:3', 'movie:2'] });
    const lib = { 'movie:9': entry('movie:9'), 'tv:8': entry('tv:8'), 'movie:1': entry('movie:1') };
    expect(candidateKeys(t, lib).sort()).toEqual(['movie:2', 'movie:3', 'movie:9']);
  });
});

describe('featured (D28, D35: movies / series, by taste)', () => {
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
  it('what I rated 1 to 4 pushes away what is like it (D41)', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const fav = title('movie:1', { genres: crime, keywords: [1, 2, 3], recommendations: ['movie:7', 'movie:8'] });
    const bad = title('movie:9', { genres: crime, keywords: [20, 21, 22, 23], recommendations: ['movie:8'] });
    const entries = [entry('movie:1', { myScore: 9, seenAt: 1 }), entry('movie:9', { myScore: 2, seenAt: 1 })];
    const like = title('movie:7', { genres: crime, keywords: [1, 2] });
    const both = title('movie:8', { genres: crime, keywords: [1, 2, 20, 21, 22, 23] });
    const input = { kind: 'movie' as const, entries, titles: { 'movie:1': fav, 'movie:9': bad }, seen: new Set<string>(), discovered: [both, like], mine };
    expect(pickFeatured(input).map((i) => i.title.key)).toEqual(['movie:7']);
    const neutral = { ...input, entries: [entries[0], entry('movie:9', { myScore: 6, seenAt: 1 })] };
    expect(pickFeatured(neutral).map((i) => i.title.key)).toEqual(['movie:8', 'movie:7']);
  });
  it('builds the profile from titles of that kind rated 7 or more', () => {
    const entries = [entry('movie:1', { myScore: 9 }), entry('movie:3', { myScore: 3 }), entry('tv:5', { type: 'tv', myScore: 10 })];
    expect(buildKindProfile('movie', entries, titles).refs.map((r) => r.title.key)).toEqual(['movie:1']);
    expect(buildKindProfile('tv', entries, titles).refs.map((r) => r.title.key)).toEqual(['tv:5']);
    expect(buildKindProfile('tv', [entry('movie:1', { myScore: 9 })], titles).refs).toHaveLength(0);
  });
  it('offers titles that follow from what I rated well, never another kind and never one I have rated or seen', () => {
    const fav = title('movie:1', { genres: [{ id: 80, name: 'Crimen' }], keywords: [1, 2, 3], year: 1995, recommendations: ['movie:7', 'movie:8'] });
    const entries = [entry('movie:1', { myScore: 9, seenAt: 1 }), entry('movie:8', { myScore: 4, seenAt: 1 })];
    const discovered = [
      title('movie:7', { genres: [{ id: 80, name: 'Crimen' }], year: 1997 }), // recommended for my favourite
      title('movie:8', { genres: [{ id: 80, name: 'Crimen' }] }), // recommended but I already rated it
      title('movie:9', { genres: [{ id: 35, name: 'Comedia' }], keywords: [50] }), // nothing links it to my taste
      title('tv:9', { type: 'tv' }),
    ];
    const out = pickFeatured({ mine, kind: 'movie', entries, titles: { 'movie:1': fav }, seen: new Set(['movie:1']), discovered });
    expect(out.map((o) => o.title.key)).toEqual(['movie:7']);
    expect(out[0].pill).toBe('Como movie:1 · tu nota 9');
  });
  it('never brings back a title I watched, even one I loved, nor one with episodes seen', () => {
    const fav = title('tv:1', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }], recommendations: ['tv:2', 'tv:3'] });
    const entries = [entry('tv:1', { myScore: 10, seenAt: 1 }), entry('tv:2', { seenEpisodes: { '1': [1] } })];
    const discovered = [title('tv:2', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }] }), title('tv:3', { type: 'tv', genres: [{ id: 80, name: 'Crimen' }] })];
    const out = pickFeatured({ mine, kind: 'tv', entries, titles: { 'tv:1': fav }, seen: new Set(['tv:1']), discovered });
    expect(out.map((o) => o.title.key)).toEqual(['tv:3']);
  });
  it('the more of my favourites lead to a title, the higher it goes; my watchlist gets a push', () => {
    const a = title('movie:1', { genres: [{ id: 80, name: 'Crimen' }], recommendations: ['movie:20', 'movie:21'] });
    const b = title('movie:2', { genres: [{ id: 80, name: 'Crimen' }], recommendations: ['movie:20'] });
    const entries = [entry('movie:1', { myScore: 9, seenAt: 1 }), entry('movie:2', { myScore: 9, seenAt: 1 }), entry('movie:22', { inWatchlist: true })];
    const crime = [{ id: 80, name: 'Crimen' }];
    const discovered = [title('movie:21', { genres: crime }), title('movie:20', { genres: crime })];
    const saved = title('movie:22', { genres: crime, recommendations: [] });
    const out = pickFeatured({ mine, kind: 'movie', entries, titles: { 'movie:1': a, 'movie:2': b, 'movie:22': { ...saved, keywords: [1] } }, seen: new Set(['movie:1', 'movie:2']), discovered });
    expect(out.map((o) => o.title.key)[0]).toBe('movie:20');
  });
  it('at most two of the five come from the same favourite', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const fav = title('movie:1', { genres: crime, recommendations: ['movie:30', 'movie:31', 'movie:32', 'movie:33', 'movie:34'] });
    const discovered = [30, 31, 32, 33, 34].map((n) => title(`movie:${n}`, { genres: crime }));
    const out = pickFeatured({ mine, kind: 'movie', entries: [entry('movie:1', { myScore: 9, seenAt: 1 })], titles: { 'movie:1': fav }, seen: new Set(['movie:1']), discovered });
    expect(out).toHaveLength(2);
  });
  it('asks TMDB for what my favourites recommend and the themes they share', () => {
    const f1 = title('movie:1', { keywords: [5, 6, 7], recommendations: ['movie:20', 'movie:21'] });
    const f2 = title('movie:2', { keywords: [5, 6, 9], recommendations: ['movie:20'] });
    const profile = buildKindProfile('movie', [entry('movie:1', { myScore: 9 }), entry('movie:2', { myScore: 8 })], { 'movie:1': f1, 'movie:2': f2 });
    expect(topKeywords(profile)).toEqual([5, 6]);
    expect(recommendedKeys(profile, new Set(['movie:21']))).toEqual(['movie:20']);
  });
  it('without a profile it offers the best IMDb of the discoveries and asks for tastes', () => {
    const discovered = [title('movie:7', { ratings: { imdb: 6, rt: null, fetchedAt: 1 } }), title('movie:8', { ratings: { imdb: 8.5, rt: null, fetchedAt: 1 } })];
    const out = pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries: [], titles: {}, seen: new Set(), discovered });
    expect(out[0].title.key).toBe('movie:8');
    expect(out[0].pill).toBe('Dime tus gustos para afinar');
    expect(pickFeatured({ mine: [{ id: 119, name: 'Prime' }], kind: 'movie', entries: [], titles: {}, seen: new Set(), discovered: [] })).toEqual([]);
  });
  it('never offers a title that is not on my platforms', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const fav = title('movie:1', { genres: crime, recommendations: ['movie:70', 'movie:72'] });
    const elsewhere = title('movie:70', { genres: crime, providers: [{ id: 999, name: 'Otra' }] });
    const out = pickFeatured({ mine, kind: 'movie', entries: [entry('movie:1', { myScore: 9, seenAt: 1 })], titles: { 'movie:1': fav }, seen: new Set(['movie:1']), discovered: [elsewhere, title('movie:72', { genres: crime })] });
    expect(out.map((o) => o.title.key)).toEqual(['movie:72']);
  });
  it('leaves out titles with too few votes, and "more for you" continues after the five on top', () => {
    const crime = [{ id: 80, name: 'Crimen' }];
    const fav = title('movie:1', { genres: crime, recommendations: Array.from({ length: 12 }, (_, i) => `movie:${40 + i}`) });
    const discovered = [...Array.from({ length: 11 }, (_, i) => title(`movie:${40 + i}`, { genres: crime, voteCount: 5000 })), title('movie:51', { genres: crime, voteCount: 3 })];
    const input = { mine, kind: 'movie' as const, entries: [entry('movie:1', { myScore: 9, seenAt: 1 })], titles: { 'movie:1': fav }, seen: new Set(['movie:1']), discovered };
    const top = pickFeatured(input);
    const more = moreForYou(input, new Set(top.map((t) => t.title.key)));
    expect(top.length + more.length).toBe(11);
    expect(more.some((m) => top.some((t) => t.title.key === m.title.key))).toBe(false);
    expect([...top, ...more].some((x) => x.title.key === 'movie:51')).toBe(false);
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

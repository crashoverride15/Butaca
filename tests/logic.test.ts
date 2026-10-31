import { describe, expect, it } from 'vitest';
import { autoTags, epochOf, originName, withoutShown } from '../src/logic/autotags';
import { formatDate, formatEpisode, formatImdb, formatRt, formatRuntime, metaLine } from '../src/logic/format';
import { nextEpisode, watchStatus } from '../src/logic/status';
import { isSeasonSeen, isSeriesSeen, markUpTo, seasonsOf, seenAired, toggleEpisode, toggleSeason, toggleSeries, totalAired } from '../src/logic/watched';
import { emptyEntry, isEmptyEntry } from '../src/store/library';
import type { Title } from '../src/store/types';

const reacher = {
  key: 'tv:108978', tmdbId: 108978, type: 'tv', title: 'Reacher', year: 2022, status: 'Returning Series', numberOfSeasons: 3,
  seasons: [
    { number: 1, episodeCount: 8, airDate: '2022-02-03' },
    { number: 2, episodeCount: 8, airDate: '2023-12-15' },
    { number: 3, episodeCount: 8, airDate: '2025-02-20' },
    { number: 4, episodeCount: 8, airDate: '2027-01-01' },
  ],
  lastEpisodeToAir: { season: 3, episode: 5, airDate: '2025-03-20' },
} as unknown as Title;

const TODAY = '2026-10-30';
const entry = () => emptyEntry('tv:108978', 'tv', 0);

describe('format', () => {
  it('writes IMDb with a comma and Rotten Tomatoes as a whole percentage', () => {
    expect(formatImdb(8.3)).toBe('8,3');
    expect(formatImdb(8)).toBe('8,0');
    expect(formatImdb(null)).toBe('–');
    expect(formatRt(91)).toBe('91%');
    expect(formatRt(null)).toBe('–');
  });
  it('writes durations, episodes and dates', () => {
    expect(formatRuntime(170)).toBe('2 h 50 min');
    expect(formatRuntime(48)).toBe('48 min');
    expect(formatRuntime(120)).toBe('2 h');
    expect(formatEpisode(3, 6)).toBe('T3 · E6');
    expect(formatDate('2026-10-12')).toBe('12 oct 2026');
  });
  it('builds the meta line for series and movies', () => {
    expect(metaLine({ ...reacher } as Title)).toBe('Serie · 2022 – · 3 temporadas');
    const ended = { ...reacher, status: 'Ended', numberOfSeasons: 12, year: 2005, lastEpisodeToAir: { season: 12, episode: 12, airDate: '2017-03-28' } } as Title;
    expect(metaLine(ended)).toBe('Serie · 2005 – 2017 · 12 temporadas');
    expect(metaLine({ type: 'movie', year: 1995, runtime: 170 } as Title)).toBe('Película · 1995 · 2 h 50 min');
  });
});

describe('automatic tags', () => {
  it.each([[1979, 'Clásico'], [1980, '80s'], [1995, '90s'], [2000, '00s'], [2014, '10s'], [2026, '20s']])('%i is %s', (year, tag) => {
    expect(epochOf(year)).toBe(tag);
  });
  it('names the origin in Spanish', () => {
    expect(originName('ES')).toBe('Española');
    expect(originName('US')).toBe('EE. UU.');
    expect(originName('GB')).toBe('Reino Unido');
    expect(originName('FR')).toBe('Francia');
  });
  it('shows a style once when a manual tag has the same name', () => {
    const auto = autoTags({ year: 1995, originCountry: ['US'], genres: [{ id: 1, name: 'Acción' }, { id: 2, name: 'Crimen' }] });
    expect(auto.estilo).toEqual(['Acción', 'Crimen']);
    expect(withoutShown(auto.estilo, ['accion'])).toEqual(['Crimen']);
  });
});

describe('aired episodes', () => {
  it('counts only what is out: past seasons whole, the current one up to the last aired, future none', () => {
    expect(seasonsOf(reacher, TODAY).map((s) => s.aired)).toEqual([8, 8, 5, 0]);
    expect(totalAired(seasonsOf(reacher, TODAY))).toBe(21);
  });
});

describe('marking watched', () => {
  const seasons = seasonsOf(reacher, TODAY);

  it('toggles one episode on and off', () => {
    const on = toggleEpisode(entry(), 1, 3);
    expect(on.seenEpisodes).toEqual({ 1: [3] });
    expect(toggleEpisode(on, 1, 3).seenEpisodes).toEqual({});
  });
  it('"hasta aquí" marks every aired episode before, across seasons', () => {
    const next = markUpTo(entry(), seasons, 2, 4);
    expect(next.seenEpisodes[1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(next.seenEpisodes[2]).toEqual([1, 2, 3, 4]);
    expect(next.seenEpisodes[3]).toBeUndefined();
  });
  it('marks and unmarks a whole season', () => {
    const marked = toggleSeason(entry(), seasons[2]);
    expect(marked.seenEpisodes[3]).toEqual([1, 2, 3, 4, 5]);
    expect(isSeasonSeen(marked, seasons[2])).toBe(true);
    expect(toggleSeason(marked, seasons[2]).seenEpisodes).toEqual({});
  });
  it('marks and unmarks the whole series, never an episode that has not aired', () => {
    const all = toggleSeries(entry(), seasons);
    expect(seenAired(all, seasons)).toBe(21);
    expect(all.seenEpisodes[4]).toBeUndefined();
    expect(isSeriesSeen(all, seasons)).toBe(true);
    expect(toggleSeries(all, seasons).seenEpisodes).toEqual({});
  });
});

describe('derived status', () => {
  const none = { ...entry() };
  it('series: nothing → por ver only if saved; some → en curso; all aired → vista; new season → en curso again', () => {
    expect(watchStatus(reacher, undefined, TODAY)).toBeNull();
    expect(watchStatus(reacher, { ...none, inWatchlist: true }, TODAY)).toBe('por_ver');
    expect(watchStatus(reacher, toggleEpisode(none, 1, 1), TODAY)).toBe('en_curso');
    const all = toggleSeries(none, seasonsOf(reacher, TODAY));
    expect(watchStatus(reacher, all, TODAY)).toBe('vista');
    const later = { ...reacher, lastEpisodeToAir: { season: 3, episode: 8, airDate: '2025-04-10' } } as Title;
    expect(watchStatus(later, all, TODAY)).toBe('en_curso');
  });
  it('movie: seen → vista, saved → por ver', () => {
    const movie = { type: 'movie' } as Title;
    expect(watchStatus(movie, { ...none, seenAt: 1 }, TODAY)).toBe('vista');
    expect(watchStatus(movie, { ...none, inWatchlist: true }, TODAY)).toBe('por_ver');
  });
  it('next episode is the first aired one not seen', () => {
    expect(nextEpisode(reacher, undefined, TODAY)).toEqual({ season: 1, episode: 1 });
    const upTo = markUpTo(none, seasonsOf(reacher, TODAY), 3, 2);
    expect(nextEpisode(reacher, upTo, TODAY)).toEqual({ season: 3, episode: 3 });
    expect(nextEpisode(reacher, toggleSeries(none, seasonsOf(reacher, TODAY)), TODAY)).toBeNull();
  });
  it('a title with only an empty season list has nothing in it', () => {
    expect(isEmptyEntry({ ...none, seenEpisodes: { 1: [] } })).toBe(true);
  });
});

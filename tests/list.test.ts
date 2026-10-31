import { describe, expect, it } from 'vitest';
import { buildRows, countByTab, filterRows, sortRows } from '../src/logic/list';
import { emptyEntry } from '../src/store/library';
import type { LibraryEntry, Title } from '../src/store/types';

const TODAY = '2026-10-30';
const mkTitle = (key: string, type: 'movie' | 'tv', title: string, imdb: number | null): Title =>
  ({
    key, type, tmdbId: Number(key.split(':')[1]), title, year: 2000,
    seasons: type === 'tv' ? [{ number: 1, episodeCount: 4, airDate: '2020-01-01' }] : undefined,
    lastEpisodeToAir: type === 'tv' ? { season: 1, episode: 4, airDate: '2020-02-01' } : null,
    ratings: { imdb, rt: null, fetchedAt: null },
  }) as unknown as Title;

const titles: Record<string, Title> = {
  'movie:1': mkTitle('movie:1', 'movie', 'Zeta', 7.1),
  'movie:2': mkTitle('movie:2', 'movie', 'Alfa', 8.4),
  'tv:3': mkTitle('tv:3', 'tv', 'Beta', null),
};
const entry = (key: string, patch: Partial<LibraryEntry>): LibraryEntry => ({ ...emptyEntry(key, key.startsWith('tv') ? 'tv' : 'movie', 0), ...patch });

const entries = [
  entry('movie:1', { seenAt: 1, myScore: 6, tagIds: ['momento:noche'], updatedAt: 10 }),
  entry('movie:2', { seenAt: 1, myScore: 9, updatedAt: 30 }),
  entry('tv:3', { seenEpisodes: { 1: [1, 2] }, updatedAt: 20 }),
  entry('movie:9', { inWatchlist: true }), // no title loaded yet
];

describe('Mi lista rows', () => {
  const rows = buildRows(entries, titles, TODAY);

  it('skips entries whose title is not loaded yet and derives each status', () => {
    expect(rows).toHaveLength(3);
    expect(Object.fromEntries(rows.map((r) => [r.entry.key, r.status]))).toEqual({ 'movie:1': 'vista', 'movie:2': 'vista', 'tv:3': 'en_curso' });
  });

  it('counts the tabs and gives a series its next episode and progress', () => {
    expect(countByTab(rows)).toEqual({ en_curso: 1, por_ver: 0, vista: 2 });
    const tv = rows.find((r) => r.entry.key === 'tv:3')!;
    expect(tv.next).toEqual({ season: 1, episode: 3 });
    expect(tv.progress).toBe(0.5);
  });

  it('filters by tab, type and tags (a title must have every chosen tag)', () => {
    expect(filterRows(rows, 'vista', { types: [], tagIds: [] })).toHaveLength(2);
    expect(filterRows(rows, 'vista', { types: ['tv'], tagIds: [] })).toHaveLength(0);
    expect(filterRows(rows, 'vista', { types: [], tagIds: ['momento:noche'] }).map((r) => r.entry.key)).toEqual(['movie:1']);
    expect(filterRows(rows, 'vista', { types: [], tagIds: ['momento:noche', 'estilo:accion'] })).toHaveLength(0);
  });

  it('sorts by my score, IMDb, recent and A–Z', () => {
    const vistas = filterRows(rows, 'vista', { types: [], tagIds: [] });
    expect(sortRows(vistas, 'nota').map((r) => r.title.title)).toEqual(['Alfa', 'Zeta']);
    expect(sortRows(vistas, 'imdb').map((r) => r.title.title)).toEqual(['Alfa', 'Zeta']);
    expect(sortRows(vistas, 'reciente').map((r) => r.title.title)).toEqual(['Alfa', 'Zeta']);
    expect(sortRows(vistas, 'az').map((r) => r.title.title)).toEqual(['Alfa', 'Zeta']);
    expect(sortRows(rows, 'imdb').at(-1)?.title.title).toBe('Beta'); // no IMDb goes last
  });
});

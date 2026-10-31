import { describe, expect, it } from 'vitest';
import {
  activeCount, affinity, DEFAULT_FILTERS, discoverParams, filterCards, genreSetsForTags, loadFilters, localOnlyTags, orderByAffinity,
  orderByArrival, profileOf, saveFilters, yearInEpochs,
} from '../src/logic/explore';
import { emptyEntry } from '../src/store/library';
import type { Tag, Title, TitleCard } from '../src/store/types';

const genres = [{ id: 28, name: 'Acción' }, { id: 80, name: 'Crimen' }];
const tag = (id: string, name: string, group: Tag['group']): Tag => ({ id, name, group, order: 0 });
const card = (tmdbId: number, year: number | null, genreIds: number[] = []): TitleCard => ({ key: `movie:${tmdbId}`, type: 'movie', tmdbId, title: `T${tmdbId}`, year, posterPath: null, genreIds, voteAverage: 0 });
const mine = [{ id: 119, name: 'Prime' }, { id: 337, name: 'Disney' }, { id: 1899, name: 'Max' }];

describe('discover query', () => {
  it('asks for flatrate titles in Spain on my platforms, with the minimum votes and note', () => {
    const p = discoverParams(DEFAULT_FILTERS, mine, []);
    expect(p).toMatchObject({
      watch_region: 'ES', with_watch_monetization_types: 'flatrate', with_watch_providers: '119|337|1899',
      'vote_count.gte': 100, 'vote_average.gte': 6, sort_by: 'popularity.desc',
    });
  });
  it('uses only the chosen platforms, genres and the best-note order', () => {
    const p = discoverParams({ ...DEFAULT_FILTERS, platformIds: [337], order: 'nota' }, mine, [[28], [80]]);
    expect(p.with_watch_providers).toBe('337');
    expect(p.with_genres).toBe('28,80'); // both genres at once
    expect(p.sort_by).toBe('vote_average.desc');
  });
  it('turns epochs into one date range for the right kind of title, then filters the decades in between locally', () => {
    const movie = discoverParams({ ...DEFAULT_FILTERS, epochs: ['90s', '10s'] }, mine, []);
    expect(movie['primary_release_date.gte']).toBe('1990-01-01');
    expect(movie['primary_release_date.lte']).toBe('2019-12-31');
    const tv = discoverParams({ ...DEFAULT_FILTERS, type: 'tv', epochs: ['20s'] }, mine, []);
    expect(tv['first_air_date.gte']).toBe('2020-01-01');
    expect(yearInEpochs(2005, ['90s', '10s'])).toBe(false);
    expect(yearInEpochs(2015, ['90s', '10s'])).toBe(true);
    expect(yearInEpochs(null, [])).toBe(true);
    expect(yearInEpochs(null, ['90s'])).toBe(false);
  });
});

describe('tags in Explorar', () => {
  const tags = [tag('estilo:accion', 'Acción', 'estilo'), tag('estilo:procedimental', 'Procedimental', 'estilo'), tag('momento:noche', 'Noche', 'momento')];
  it('style tags that match a TMDB genre filter the catalogue; the rest reorder', () => {
    expect(genreSetsForTags(tags, genres)).toEqual([[28]]);
    expect(localOnlyTags(tags, genres).map((t) => t.name)).toEqual(['Procedimental', 'Noche']);
  });
  it('series use their own genres: Acción is Action & Adventure, Thriller is mystery or crime; every tag must hold', () => {
    const t = [tag('estilo:accion', 'Acción', 'estilo'), tag('estilo:thriller', 'Thriller', 'estilo'), tag('momento:random', 'Random', 'momento')];
    expect(genreSetsForTags(t, genres, 'movie')).toEqual([[28], [53]]);
    expect(genreSetsForTags(t, genres, 'tv')).toEqual([[10759], [9648, 80]]);
    expect(localOnlyTags(t, genres, 'tv').map((x) => x.name)).toEqual(['Random']);
    expect(discoverParams(DEFAULT_FILTERS, mine, [[10759], [9648, 80]]).with_genres).toBe('10759|9648|80');
    const cards = [card(1, 2020, [16, 35]), card(2, 2020, [10759, 80]), card(3, 2020, [10759]), card(4, 2020, [9648])];
    const keep = filterCards(cards, DEFAULT_FILTERS, {}, () => false, [[10759], [9648, 80]]);
    expect(keep.map((c) => c.tmdbId)).toEqual([2]);
  });
  it('orders by what my tagged titles share, keeping the original order on ties', () => {
    const profile = profileOf([{ genres: [{ id: 80, name: 'Crimen' }], year: 1995 } as unknown as Title]);
    const cards = [card(1, 2020, [35]), card(2, 1996, [80]), card(3, 1998, [35]), card(4, 2024, [80])];
    expect(affinity(cards[1], profile)).toBe(5);
    expect(orderByAffinity(cards, profile).map((c) => c.tmdbId)).toEqual([2, 3, 4, 1]);
  });
});

describe('results', () => {
  it('hides what I have seen unless asked not to, and applies epochs', () => {
    const cards = [card(1, 1995), card(2, 2005), card(3, 1999)];
    const library = { 'movie:1': { ...emptyEntry('movie:1', 'movie'), seenAt: 1 } };
    const seen = (e: { seenAt: number | null }) => e.seenAt !== null;
    expect(filterCards(cards, { ...DEFAULT_FILTERS, epochs: ['90s'] }, library, seen).map((c) => c.tmdbId)).toEqual([3]);
    expect(filterCards(cards, { ...DEFAULT_FILTERS, hideSeen: false, epochs: ['90s'] }, library, seen).map((c) => c.tmdbId)).toEqual([1, 3]);
  });
  it('"Recién llegadas": newest arrival first, unknown ones last by year', () => {
    const cards = [card(1, 1990), card(2, 2020), card(3, 2000), card(4, 2010)];
    expect(orderByArrival(cards, { 3: 100, 4: 200 }).map((c) => c.tmdbId)).toEqual([4, 3, 2, 1]);
  });
  it('counts the filters that are not the default', () => {
    expect(activeCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeCount({ ...DEFAULT_FILTERS, platformIds: [1], epochs: ['80s'], tagIds: ['x'], minImdb: 8, hideSeen: false })).toBe(5);
  });
});

describe('remembered filters', () => {
  it('saves and loads them, and survives garbage', () => {
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
    saveFilters({ ...DEFAULT_FILTERS, epochs: ['90s'], minImdb: 7.5 }, storage);
    expect(loadFilters(storage)).toMatchObject({ epochs: ['90s'], minImdb: 7.5, hideSeen: true });
    store['butaca.filtros'] = '{no json';
    expect(loadFilters(storage)).toEqual(DEFAULT_FILTERS);
  });
});

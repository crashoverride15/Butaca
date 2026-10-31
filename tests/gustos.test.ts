import { describe, expect, it } from 'vitest';
import { deckParams, isParked, markNotSeen, markSeen, markSeriesSeen, rankDeck } from '../src/logic/gustos';
import { nextEpisode } from '../src/logic/status';
import { isEmptyEntry, emptyEntry } from '../src/store/library';
import type { TitleCard } from '../src/store/types';

const card = (tmdbId: number, genreIds: number[]): TitleCard => ({ key: `movie:${tmdbId}`, type: 'movie', tmdbId, title: `T${tmdbId}`, year: 2020, posterPath: null, genreIds, voteAverage: 7 });
const profile = (topGenres: number[], withRefs = true) => ({ refs: withRefs ? [{} as never] : [], topGenres, decades: [199], type: 'movie' as const });
const seasons = [{ number: 1, aired: 2, total: 2 }];

describe('Gustos deck (D28)', () => {
  it('seen movie: date, score, out of the watchlist', () => {
    const e = { ...emptyEntry('movie:1', 'movie', 0), inWatchlist: true };
    const out = markSeen(e, null, 8, 100);
    expect(out).toMatchObject({ seenAt: 100, myScore: 8, inWatchlist: false, notSeenAt: null });
  });
  it('seen without a score keeps the one it had', () => {
    const e = { ...emptyEntry('movie:1', 'movie', 0), myScore: 6 };
    expect(markSeen(e, null, null, 100).myScore).toBe(6);
  });
  it('seen series: every aired episode', () => {
    const out = markSeen(emptyEntry('tv:1', 'tv', 0), seasons, 9, 100);
    expect(out.seenEpisodes).toEqual({ 1: [1, 2] });
    expect(out.myScore).toBe(9);
  });
  it('seen series twice stays seen (never toggles back)', () => {
    const once = markSeen(emptyEntry('tv:1', 'tv', 0), seasons, 9, 100);
    expect(markSeen(once, seasons, 9, 200).seenEpisodes).toEqual({ 1: [1, 2] });
  });
  it('not seen: marked, and the entry is not empty so it is kept', () => {
    const out = markNotSeen(emptyEntry('movie:1', 'movie', 0), 100);
    expect(out.notSeenAt).toBe(100);
    expect(isEmptyEntry(out)).toBe(false);
    expect(isEmptyEntry(emptyEntry('movie:1', 'movie', 0))).toBe(true);
  });
  it('asks TMDB for my genres when I have a taste, popular titles when I do not', () => {
    const mine = [{ id: 8, name: 'Netflix' }];
    const withTaste = deckParams(profile([80, 18]), mine);
    expect(withTaste.with_genres).toBe('80|18');
    expect(withTaste.with_watch_providers).toBe('8');
    expect(Object.keys(withTaste).some((k) => k.includes('release_date') || k.includes('air_date'))).toBe(false);
    const none = deckParams(profile([], false), mine);
    expect(none.with_genres).toBeUndefined();
    expect(none.sort_by).toBe('popularity.desc');
  });
  it('ranks my genres first, drops answered and repeated cards', () => {
    const out = rankDeck([card(1, [35]), card(2, [80]), card(3, [80, 18]), card(2, [80]), card(4, [35])], profile([80, 18]), new Set(['movie:4']));
    expect(out.map((c) => c.tmdbId)).toEqual([3, 2, 1]);
  });
  it('a not-seen card rests 30 days and then can be asked again; anything else stays out', () => {
    const day = 86_400_000;
    const notSeen = markNotSeen(emptyEntry('movie:1', 'movie', 0), 1000);
    expect(isParked(notSeen, 10 * day + 1000)).toBe(true);
    expect(isParked(notSeen, 31 * day + 1000)).toBe(false);
    expect(isParked({ ...notSeen, inWatchlist: true }, 31 * day)).toBe(true);
    expect(isParked(markSeen(emptyEntry('movie:2', 'movie', 0), null, 8, 0), 31 * day)).toBe(true);
  });
  it('series seen up to a season: that season and the ones before, still in progress, with its tags and score', () => {
    const three = [{ number: 1, aired: 2, total: 2 }, { number: 2, aired: 3, total: 3 }, { number: 3, aired: 4, total: 4 }];
    const out = markSeriesSeen(emptyEntry('tv:1', 'tv', 0), three, 2, 8, ['momento:noche', 'momento:maraton']);
    expect(out.seenEpisodes).toEqual({ 1: [1, 2], 2: [1, 2, 3] });
    expect(out).toMatchObject({ myScore: 8, tagIds: ['momento:noche', 'momento:maraton'], notSeenAt: null });
    expect(markSeriesSeen(emptyEntry('tv:1', 'tv', 0), three, null, null, []).seenEpisodes).toEqual({ 1: [1, 2], 2: [1, 2, 3], 3: [1, 2, 3, 4] });
  });
  it('a series tagged Random has no next episode (no order), any other keeps it', () => {
    const title = { type: 'tv', seasons: [{ number: 1, episodeCount: 3, airDate: '2000-01-01' }], lastEpisodeToAir: { season: 1, episode: 3, airDate: '2000-02-01' } } as never;
    const plain = { ...emptyEntry('tv:1', 'tv', 0), seenEpisodes: { 1: [1] } };
    expect(nextEpisode(title, plain, '2026-10-31')).toEqual({ season: 1, episode: 2 });
    expect(nextEpisode(title, { ...plain, tagIds: ['momento:random'] }, '2026-10-31')).toBeNull();
  });
});

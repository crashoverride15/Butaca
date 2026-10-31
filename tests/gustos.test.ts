import { describe, expect, it } from 'vitest';
import { deckParams, markNotSeen, markSeen, rankDeck } from '../src/logic/gustos';
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
});

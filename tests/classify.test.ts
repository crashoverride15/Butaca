import { describe, expect, it } from 'vitest';
import { momentsOf, seriesToClassify, toggleMoment } from '../src/logic/classify';
import { emptyEntry } from '../src/store/library';
import type { LibraryEntry } from '../src/store/types';

const entry = (key: string, patch: Partial<LibraryEntry> = {}): LibraryEntry => ({ ...emptyEntry(key, key.startsWith('tv') ? 'tv' : 'movie', 0), ...patch });

describe('classify series (D42)', () => {
  it('lists the series I watched or rated, those without a moment first', () => {
    const list = seriesToClassify([
      entry('tv:1', { seenEpisodes: { '1': [1] }, tagIds: ['momento:maraton'], updatedAt: 5 }),
      entry('tv:2', { myScore: 8, updatedAt: 1 }),
      entry('tv:3', { inWatchlist: true }), // not watched
      entry('movie:4', { seenAt: 1 }),
      entry('tv:5', { seenAt: 1, updatedAt: 3 }),
    ]);
    expect(list.map((e) => e.key)).toEqual(['tv:5', 'tv:2', 'tv:1']);
  });
  it('puts a moment on and takes it off, keeping the other tags', () => {
    const e = entry('tv:1', { tagIds: ['estilo:thriller'] });
    const on = toggleMoment(e, 'momento:random', 9);
    expect(on.tagIds).toEqual(['estilo:thriller', 'momento:random']);
    expect(on.updatedAt).toBe(9);
    expect(momentsOf(on)).toEqual(['momento:random']);
    expect(toggleMoment(on, 'momento:random').tagIds).toEqual(['estilo:thriller']);
  });
});

import { describe, expect, it } from 'vitest';
import { estimateMoment, seriesShape, shapePrior } from '../src/logic/seriesMoment';
import type { Title } from '../src/store/types';

const show = (key: string, p: { seasons: number; perSeason: number; genres?: number[]; keywords?: string[]; status?: string; tvType?: string; overview?: string; keywordIds?: number[] }): Title =>
  ({
    key, tmdbId: Number(key.split(':')[1]), type: 'tv', title: key, originalTitle: '', year: 2010, overview: p.overview ?? '',
    posterPath: null, backdropPath: null, genres: (p.genres ?? [18]).map((id) => ({ id, name: String(id) })), keywords: p.keywordIds ?? [], keywordNames: p.keywords ?? [],
    originCountry: ['US'], originalLanguage: 'en', runtime: null, imdbId: null, providers: [], recommendations: [], similar: [], ratings: { imdb: null, rt: null, fetchedAt: null },
    fetchedAt: 0, providersFetchedAt: 0, status: p.status ?? 'Ended', tvType: p.tvType ?? 'Scripted',
    numberOfSeasons: p.seasons, numberOfEpisodes: p.seasons * p.perSeason,
    seasons: Array.from({ length: p.seasons }, (_, i) => ({ number: i + 1, episodeCount: p.perSeason, airDate: '2010-01-01' })),
  }) as Title;

describe('series moment (D39)', () => {
  it('measures a series: seasons, episodes, per season, hints from the keywords', () => {
    const s = seriesShape(show('tv:1', { seasons: 5, perSeason: 22, genres: [80], keywords: ['police procedural', 'cia'] }));
    expect(s).toMatchObject({ seasons: 5, episodes: 110, perSeason: 22, ended: true, caseHints: 2, caseGenre: true });
  });
  it('a short, continuous series is a Maratón', () => {
    expect(estimateMoment(show('tv:1', { seasons: 2, perSeason: 10, keywords: ['conspiracy'] }), []).moment).toBe('momento:maraton');
    expect(estimateMoment(show('tv:2', { seasons: 1, perSeason: 6, tvType: 'Miniseries' }), []).moment).toBe('momento:maraton');
  });
  it('a long running case-per-episode crime show is Para dormir (Bones, Mentes Criminales)', () => {
    const bones = show('tv:1', { seasons: 12, perSeason: 22, genres: [80, 18], keywords: ['forensic', 'murder'] });
    expect(estimateMoment(bones, []).moment).toBe('momento:para-dormirme');
  });
  it('a mid-length series with a plot going on is Entre semana (Person of Interest)', () => {
    const poi = show('tv:1', { seasons: 5, perSeason: 22, genres: [80, 18], keywords: ['artificial intelligence', 'surveillance'] });
    expect(estimateMoment(poi, []).moment).toBe('momento:entre-semana');
  });
  it('with nothing known, or no clear winner, it says nothing', () => {
    expect(estimateMoment(show('tv:1', { seasons: 0, perSeason: 0 }), []).moment).toBeNull();
    const tie = shapePrior(seriesShape(show('tv:2', { seasons: 3, perSeason: 22 })));
    expect(Object.values(tie).every((v) => v >= 0)).toBe(true);
  });
  it('the series I already classified decide when the shape is not enough', () => {
    // 5 seasons of 22 episodes of crime: the shape says Entre semana, but the closest series I classified are all Para dormir
    const candidate = show('tv:9', { seasons: 5, perSeason: 22, genres: [80], keywordIds: [1, 2, 3, 4], overview: 'Un equipo del FBI investiga asesinatos cada semana' });
    expect(estimateMoment(candidate, []).moment).toBe('momento:entre-semana');
    const sleepy = [10, 11, 12].map((n) => ({
      title: show(`tv:${n}`, { seasons: 5, perSeason: 22, genres: [80], keywordIds: [1, 2, 3, 4], overview: 'Un equipo del FBI investiga asesinatos cada semana' }),
      moments: ['momento:para-dormirme'],
    }));
    expect(estimateMoment(candidate, sleepy).moment).toBe('momento:para-dormirme');
  });
  it('never uses itself as a neighbour', () => {
    const me = show('tv:1', { seasons: 2, perSeason: 10 });
    expect(estimateMoment(me, [{ title: me, moments: ['momento:para-dormirme'] }]).moment).toBe('momento:maraton');
  });
});

import { describe, expect, it } from 'vitest';
import { episodeSignal, seasonToSample } from '../src/logic/episodes';
import { estimateMoment } from '../src/logic/seriesMoment';
import type { Title } from '../src/store/types';

const procedural = [
  'Brennan and Booth investigate the remains of a woman found in a lake, and Hodgins studies the insects on the body.',
  'The team is called when the body of a college student turns up in a dumpster; Sweets profiles the killer.',
  'A corpse is discovered at a construction site and Booth suspects the foreman, while Angela reconstructs the face of Marcus.',
  'The murder of a magician leads Brennan to a circus where Delilah and Oscar had a feud.',
  'When a skeleton is found in a freezer, the investigation takes Booth and Brennan to a restaurant run by Pietro.',
  'Bones and Booth investigate the death of a surfer whose remains wash up on a beach near Malibu where Kenji worked.',
].map((overview) => ({ overview }));

const serial = [
  'Walter learns he is dying and makes a choice that will change his family forever, with Jesse at his side.',
  'Walter and Jesse try to get rid of the evidence, while Skyler grows suspicious of Walter and his lies.',
  'Meanwhile Hank continues the hunt for the new cook in town, and Walter plans to expand with Jesse.',
  'In the aftermath of the deal, Jesse falls apart, and Walter must decide how far he is willing to go for Skyler.',
  'Walter and Jesse plan to escape a desert standoff while Hank closes in and Skyler confronts Walter.',
  'The truth about Walter begins to surface as Skyler and Hank piece together what Jesse knows.',
].map((overview) => ({ overview }));

const show = (key: string, seasons: number, perSeason: number, genres: number[], signal: Title['episodeSignal']): Title =>
  ({
    key, tmdbId: 1, type: 'tv', title: key, originalTitle: '', year: 2010, overview: '', posterPath: null, backdropPath: null,
    genres: genres.map((id) => ({ id, name: String(id) })), keywords: [], keywordNames: [], originCountry: ['US'], originalLanguage: 'en', runtime: null, imdbId: null,
    providers: [], recommendations: [], similar: [], ratings: { imdb: null, rt: null, fetchedAt: null }, fetchedAt: 0, providersFetchedAt: 0,
    status: 'Ended', tvType: 'Scripted', numberOfSeasons: seasons, numberOfEpisodes: seasons * perSeason,
    seasons: Array.from({ length: seasons }, (_, i) => ({ number: i + 1, episodeCount: perSeason, airDate: '2010-01-01' })),
    episodeSignal: signal,
  }) as Title;

describe('episodes tell the plot (D42)', () => {
  it('a case per episode: cases in most synopses and new names every week', () => {
    const s = episodeSignal(procedural)!;
    expect(s.sampled).toBe(6);
    expect(s.caseRatio).toBeGreaterThanOrEqual(0.8);
    expect(s.guestRatio).toBeGreaterThanOrEqual(0.35);
  });
  it('a story that goes on: few cases, the same names', () => {
    const s = episodeSignal(serial)!;
    expect(s.caseRatio).toBeLessThan(0.3);
    expect(s.guestRatio).toBeLessThan(0.3);
    expect(s.serialRatio).toBeGreaterThanOrEqual(0.25);
  });
  it('says nothing with too few synopses', () => {
    expect(episodeSignal([{ overview: 'Short.' }, ...procedural.slice(0, 2)])).toBeNull();
  });
  it('reads the first season with enough episodes', () => {
    expect(seasonToSample([{ number: 0, episodeCount: 10 }, { number: 1, episodeCount: 2 }, { number: 2, episodeCount: 10 }])).toBe(2);
    expect(seasonToSample([])).toBeNull();
  });
  it('turns a mid-length drama into Para dormir when its episodes are cases, and into Entre semana when they carry on', () => {
    const asCases = show('tv:1', 5, 13, [18], episodeSignal(procedural));
    const asStory = show('tv:2', 5, 13, [18], episodeSignal(serial));
    expect(estimateMoment(show('tv:3', 5, 13, [18], undefined), []).moment).not.toBe('momento:para-dormirme');
    expect(estimateMoment(asCases, []).moment).toBe('momento:para-dormirme');
    expect(estimateMoment(asStory, []).moment).toBe('momento:entre-semana');
  });
  it('a short series whose episodes carry on is a Maratón', () => {
    expect(estimateMoment(show('tv:1', 2, 10, [18], episodeSignal(serial)), []).moment).toBe('momento:maraton');
  });
});

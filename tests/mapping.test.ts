import { describe, expect, it } from 'vitest';
import { parseRatings } from '../src/api/omdb';
import { DETAIL_VERSION, isDefaultPlatform, mapTitle, platformColor, shortPlatformName } from '../src/api/tmdb';
import { isFresh } from '../src/store/cache';

const NOW = 1_800_000_000_000;

describe('mapTitle keeps more of what TMDB knows (D39)', () => {
  it('a series: kind, episodes, runtime, networks, creators, theme names, cast, rating, version', () => {
    const t = mapTitle(
      'tv',
      {
        id: 1,
        name: 'Person of Interest',
        type: 'Scripted',
        number_of_episodes: 103,
        number_of_seasons: 5,
        episode_run_time: [],
        last_episode_to_air: { season_number: 5, episode_number: 13, air_date: '2016-06-21', runtime: 43 },
        in_production: false,
        last_air_date: '2016-06-21',
        networks: [{ name: 'CBS' }],
        created_by: [{ name: 'Jonathan Nolan' }],
        keywords: { results: [{ id: 5, name: 'Surveillance' }, { id: 6, name: 'Artificial Intelligence' }] },
        aggregate_credits: { cast: [{ name: 'Jim Caviezel' }, { name: 'Michael Emerson' }] },
        content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-14' }] },
        vote_count: 4000,
        popularity: 55,
        tagline: 'Sabían demasiado',
      },
      NOW,
    );
    expect(t).toMatchObject({
      detailVersion: DETAIL_VERSION,
      tvType: 'Scripted',
      numberOfEpisodes: 103,
      episodeRuntime: 43,
      inProduction: false,
      networks: ['CBS'],
      createdBy: ['Jonathan Nolan'],
      keywordNames: ['surveillance', 'artificial intelligence'],
      cast: ['Jim Caviezel', 'Michael Emerson', 'Jonathan Nolan'],
      contentRating: 'TV-14',
      voteCount: 4000,
      tagline: 'Sabían demasiado',
    });
  });
  it('a movie: director after the cast and the age rating of the release', () => {
    const t = mapTitle('movie', { id: 2, title: 'Heat', credits: { cast: [{ name: 'Al Pacino' }], crew: [{ name: 'Michael Mann', job: 'Director' }, { name: 'X', job: 'Editor' }] }, release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }] } }, NOW);
    expect(t.cast).toEqual(['Al Pacino', 'Michael Mann']);
    expect(t.contentRating).toBe('R');
  });
});

describe('mapTitle', () => {
  it('maps a movie: Spanish title, year, runtime, countries, ES flatrate providers only', () => {
    const title = mapTitle(
      'movie',
      {
        id: 949,
        title: 'Heat',
        original_title: 'Heat',
        release_date: '1995-12-15',
        overview: 'Un policía persigue a un ladrón.',
        poster_path: '/p.jpg',
        backdrop_path: '/b.jpg',
        genres: [{ id: 80, name: 'Crimen' }],
        runtime: 170,
        imdb_id: 'tt0113277',
        production_countries: [{ iso_3166_1: 'US' }],
        original_language: 'en',
        keywords: { keywords: [{ id: 1 }, { id: 2 }] },
        'watch/providers': {
          results: {
            ES: { flatrate: [{ provider_id: 119, provider_name: 'Amazon Prime Video' }] },
            US: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] },
          },
        },
        recommendations: { results: [{ id: 1 }] },
        similar: { results: [{ id: 2 }, { id: 3 }] },
      },
      NOW,
    );
    expect(title).toMatchObject({
      key: 'movie:949',
      year: 1995,
      runtime: 170,
      imdbId: 'tt0113277',
      originCountry: ['US'],
      keywords: [1, 2],
      providers: [{ id: 119, name: 'Amazon Prime Video' }],
      recommendations: ['movie:1'],
      similar: ['movie:2', 'movie:3'],
      fetchedAt: NOW,
    });
    expect(title.seasons).toBeUndefined();
  });

  it('maps a series: no specials, IMDb id from external_ids, episode refs', () => {
    const title = mapTitle(
      'tv',
      {
        id: 108978,
        name: 'Reacher',
        original_name: 'Reacher',
        first_air_date: '2022-02-03',
        status: 'Returning Series',
        number_of_seasons: 3,
        origin_country: ['US'],
        external_ids: { imdb_id: 'tt9288030' },
        keywords: { results: [{ id: 9 }] },
        seasons: [
          { season_number: 0, episode_count: 5, air_date: null },
          { season_number: 1, episode_count: 8, air_date: '2022-02-03' },
          { season_number: 2, episode_count: 8, air_date: '2023-12-15' },
        ],
        last_episode_to_air: { season_number: 2, episode_number: 8, air_date: '2024-01-19' },
        next_episode_to_air: null,
      },
      NOW,
    );
    expect(title.key).toBe('tv:108978');
    expect(title.imdbId).toBe('tt9288030');
    expect(title.keywords).toEqual([9]);
    expect(title.runtime).toBeNull();
    expect(title.seasons).toEqual([
      { number: 1, episodeCount: 8, airDate: '2022-02-03' },
      { number: 2, episodeCount: 8, airDate: '2023-12-15' },
    ]);
    expect(title.lastEpisodeToAir).toEqual({ season: 2, episode: 8, airDate: '2024-01-19' });
    expect(title.nextEpisodeToAir).toBeNull();
  });

  it('keeps ratings already known when a title is refreshed', () => {
    const first = mapTitle('movie', { id: 1, title: 'A' }, NOW);
    const known = { ...first, ratings: { imdb: 8.3, rt: 91, fetchedAt: NOW } };
    expect(mapTitle('movie', { id: 1, title: 'A' }, NOW + 1, known).ratings).toEqual(known.ratings);
  });
});

describe('parseRatings', () => {
  it('reads IMDb and Rotten Tomatoes', () => {
    expect(parseRatings({ imdbRating: '8.3', Ratings: [{ Source: 'Rotten Tomatoes', Value: '91%' }] })).toEqual({ imdb: 8.3, rt: 91 });
  });
  it('treats N/A and a missing Rotten Tomatoes entry as no rating', () => {
    expect(parseRatings({ imdbRating: 'N/A', Ratings: [{ Source: 'Internet Movie Database', Value: '8/10' }] })).toEqual({ imdb: null, rt: null });
  });
});

describe('platforms', () => {
  it.each([
    ['Amazon Prime Video', true],
    ['Disney Plus', true],
    ['HBO Max', true],
    ['Max', true],
    ['Netflix', false],
    ['Cinemax', false],
  ])('%s is a default: %s', (name, expected) => {
    expect(isDefaultPlatform(name)).toBe(expected);
  });

  it('shortens names and picks colours', () => {
    expect(shortPlatformName('Amazon Prime Video')).toBe('Prime Video');
    expect(shortPlatformName('Disney Plus')).toBe('Disney+');
    expect(shortPlatformName('Max')).toBe('HBO Max');
    expect(shortPlatformName('Filmin')).toBe('Filmin');
    expect(platformColor('Disney Plus')).toBe('var(--disney)');
    expect(platformColor('Filmin')).toBe('var(--platform-other)');
  });
});

describe('isFresh', () => {
  it('is fresh before the TTL and stale after', () => {
    expect(isFresh(1000, 500, 1499)).toBe(true);
    expect(isFresh(1000, 500, 1500)).toBe(false);
  });
});

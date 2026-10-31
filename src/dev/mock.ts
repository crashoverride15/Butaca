// Development only (`?mock` in the URL): a fake TMDB/OMDb so screens can be checked without keys.
// Not part of the production build: main.tsx imports it behind `import.meta.env.DEV`.

import { getDb } from '../store/db';

const GENRES = [
  { id: 28, name: 'Acción' }, { id: 35, name: 'Comedia' }, { id: 80, name: 'Crimen' }, { id: 18, name: 'Drama' },
  { id: 53, name: 'Suspense' }, { id: 9648, name: 'Misterio' },
];
const NAMES = [
  'Heat', 'Casino', 'Seven', 'Memento', 'Fargo', 'Alerta Máxima', 'La Casa de Papel', 'El Reino', 'Reacher', 'Bones',
  'Mentes criminales', 'Lost', 'Narcos', 'Vis a vis', 'Los Soprano', 'Mindhunter', 'Ozark', 'Sherlock', 'Dexter', 'The Wire',
];
const PROVIDERS = [
  { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: null, display_priority: 1 },
  { provider_id: 337, provider_name: 'Disney Plus', logo_path: null, display_priority: 2 },
  { provider_id: 1899, provider_name: 'Max', logo_path: null, display_priority: 3 },
  { provider_id: 8, provider_name: 'Netflix', logo_path: null, display_priority: 4 },
];

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

function item(type: 'movie' | 'tv', i: number) {
  const id = (type === 'movie' ? 1000 : 2000) + i;
  const year = 1992 + ((i * 7) % 33);
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
  const g = [GENRES[i % 6], GENRES[(i + 2) % 6]];
  const seasons = 1 + (i % 5);
  const base = {
    id, overview: `Sinopsis de ${name}.`, poster_path: null, backdrop_path: null, genres: g, genre_ids: g.map((x) => x.id),
    vote_average: 6 + (i % 4), vote_count: 500 + i, original_language: 'en', keywords: { keywords: [{ id: i % 5 }], results: [{ id: i % 5 }] },
    'watch/providers': { results: { ES: { flatrate: [PROVIDERS[i % 3]] } } }, recommendations: { results: [{ id: id + 1 }, { id: id + 2 }] }, similar: { results: [{ id: id + 3 }] },
  };
  return type === 'movie'
    ? { ...base, title: name, original_title: name, release_date: `${year}-05-01`, runtime: 95 + i, imdb_id: `tt${id}`, production_countries: [{ iso_3166_1: i % 4 === 0 ? 'ES' : 'US' }] }
    : {
        ...base, name, original_name: name, first_air_date: `${year}-01-10`, status: i % 3 === 0 ? 'Ended' : 'Returning Series', number_of_seasons: seasons,
        origin_country: [i % 4 === 0 ? 'ES' : 'US'], external_ids: { imdb_id: `tt${id}` },
        seasons: Array.from({ length: seasons }, (_, s) => ({ season_number: s + 1, episode_count: 8, air_date: `${year + s}-02-01` })),
        last_episode_to_air: { season_number: seasons, episode_number: 8, air_date: `${year + seasons - 1}-04-01` },
        next_episode_to_air: i % 5 === 1 ? { season_number: seasons + 1, episode_number: 1, air_date: iso(-20) } : null,
      };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function route(url: URL): Response | null {
  const p = url.pathname.replace(/^\/3/, '');
  const page = Number(url.searchParams.get('page') ?? 1);
  if (p === '/configuration') return json({});
  if (p.startsWith('/watch/providers')) return json({ results: PROVIDERS });
  if (p.startsWith('/genre/')) return json({ genres: GENRES });
  const disc = p.match(/^\/discover\/(movie|tv)$/);
  if (disc) {
    const type = disc[1] as 'movie' | 'tv';
    const list = Array.from({ length: 20 }, (_, k) => item(type, ((page - 1) * 20 + k) % 40));
    const withProviders = url.searchParams.get('with_watch_providers');
    const rows = withProviders ? list.filter((x) => withProviders.split('|').includes(String(x['watch/providers'].results.ES.flatrate[0].provider_id))) : list;
    return json({ page, total_pages: 3, results: rows });
  }
  if (p === '/search/multi') {
    const q = (url.searchParams.get('query') ?? '').toLowerCase();
    if (q.includes('denzel')) return json({ page: 1, total_pages: 1, results: [{ media_type: 'person', id: 5, name: 'Denzel Washington' }] });
    const all = [...Array.from({ length: 20 }, (_, i) => ({ media_type: 'movie', ...item('movie', i) })), ...Array.from({ length: 20 }, (_, i) => ({ media_type: 'tv', ...item('tv', i) }))];
    return json({ page: 1, total_pages: 1, results: all.filter((x) => ((x as { title?: string; name?: string }).title ?? (x as { name?: string }).name ?? '').toLowerCase().includes(q)) });
  }
  if (p === '/person/5/combined_credits') {
    return json({ cast: [{ media_type: 'movie', ...item('movie', 3), popularity: 5 }, { media_type: 'tv', ...item('tv', 4), popularity: 9 }], crew: [] });
  }
  const detail = p.match(/^\/(movie|tv)\/(\d+)$/);
  if (detail) {
    const type = detail[1] as 'movie' | 'tv';
    const i = Number(detail[2]) - (type === 'movie' ? 1000 : 2000);
    return json(item(type, ((i % 40) + 40) % 40));
  }
  return null;
}

export async function installMock(): Promise<void> {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.hostname === 'api.themoviedb.org') return route(url) ?? new Response('{}', { status: 404 });
    if (url.hostname === 'www.omdbapi.com') {
      const n = Number(url.searchParams.get('i')?.slice(2)) || 0;
      return json({ Response: 'True', imdbRating: (6 + ((n * 7) % 30) / 10).toFixed(1), Ratings: n % 3 === 0 ? [] : [{ Source: 'Rotten Tomatoes', Value: `${60 + (n % 40)}%` }] });
    }
    return real(input, init);
  };
  const db = await getDb();
  if (!(await db.get('settings', 'main'))?.tmdbToken) {
    await db.put('settings', {
      id: 'main', tmdbToken: 'mock', omdbKey: 'mock', platforms: PROVIDERS.slice(0, 3).map((p) => ({ id: p.provider_id, name: p.provider_name })),
      region: 'ES', language: 'es-ES', lastRefreshAt: null, lastNoveltyRunAt: null,
    });
  }
}

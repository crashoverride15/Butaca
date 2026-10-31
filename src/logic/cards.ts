import { makeKey, type MediaType, type Title, type TitleCard } from '../store/types';

export const titleToCard = (t: Title): TitleCard => ({
  key: t.key,
  type: t.type,
  tmdbId: t.tmdbId,
  title: t.title,
  year: t.year,
  posterPath: t.posterPath,
  genreIds: t.genres.map((g) => g.id),
  voteAverage: 0,
});

export const parseKey = (key: string): { type: MediaType; tmdbId: number } | null => {
  const [type, id] = key.split(':');
  const tmdbId = Number(id);
  return (type === 'movie' || type === 'tv') && Number.isInteger(tmdbId) ? { type, tmdbId } : null;
};

export { makeKey };

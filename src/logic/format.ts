import type { Title } from '../store/types';

// Number, date and text formats — spec §4.3.

const ONE_DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** IMDb with a comma: 8,3. */
export const formatImdb = (n: number | null): string => (n === null ? '–' : ONE_DECIMAL.format(n));
export const formatRt = (n: number | null): string => (n === null ? '–' : `${n}%`);

/** "12 oct 2026" (the month's dot removed). */
export function formatDate(value: number | string): string {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : new Date(value);
  return DATE.format(date).replace(/\./g, '');
}

/** "2 h 50 min"; under an hour "48 min". */
export function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "T3 · E6". */
export const formatEpisode = (season: number, episode: number): string => `T${season} · E${episode}`;

const seasonsText = (n: number): string => `${n} ${n === 1 ? 'temporada' : 'temporadas'}`;

/** "Serie · 2022 – · 3 temporadas", "Serie · 2005 – 2017 · 12 temporadas", "Película · 1995 · 2 h 50 min". */
export function metaLine(title: Title): string {
  if (title.type === 'movie') {
    return ['Película', title.year, formatRuntime(title.runtime)].filter(Boolean).join(' · ');
  }
  const ended = title.status === 'Ended' || title.status === 'Canceled';
  const endYear = ended ? Number(title.lastEpisodeToAir?.airDate.slice(0, 4)) || null : null;
  const span = title.year ? `${title.year} – ${endYear ?? ''}`.trim() : '';
  const seasons = title.numberOfSeasons ? seasonsText(title.numberOfSeasons) : '';
  return ['Serie', span, seasons].filter(Boolean).join(' · ');
}

const SHORT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
/** "14 nov" */
export const formatDateShort = (iso: string): string => SHORT.format(new Date(`${iso}T12:00:00`)).replace(/\./g, '');

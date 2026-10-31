import type { LibraryEntry, MediaType, Title } from '../store/types';
import { nextEpisode, watchStatus, type WatchStatus } from './status';
import { seasonsOf, seenAired, totalAired } from './watched';

// "Mi lista" — spec §9.4: rows, tabs, filters, sorting. Pure.

export interface ListRowData {
  entry: LibraryEntry;
  title: Title;
  status: Exclude<WatchStatus, null>;
  next: { season: number; episode: number } | null;
  /** 0..1 of aired episodes seen (series) */
  progress: number;
}

export type ListTab = 'en_curso' | 'por_ver' | 'vista';
export type SortKey = 'nota' | 'imdb' | 'reciente' | 'az';
export const SORT_ORDER: SortKey[] = ['nota', 'imdb', 'reciente', 'az'];
export const SORT_LABEL: Record<SortKey, string> = { nota: 'Tu nota', imdb: 'IMDb', reciente: 'Reciente', az: 'A–Z' };

export function buildRows(entries: LibraryEntry[], titles: Record<string, Title>, today: string): ListRowData[] {
  const rows: ListRowData[] = [];
  for (const entry of entries) {
    const title = titles[entry.key];
    if (!title) continue;
    const status = watchStatus(title, entry, today);
    if (!status) continue;
    let progress = 0;
    if (title.type === 'tv') {
      const seasons = seasonsOf(title, today);
      const total = totalAired(seasons);
      progress = total ? seenAired(entry, seasons) / total : 0;
    } else if (status === 'vista') progress = 1;
    rows.push({ entry, title, status, next: nextEpisode(title, entry, today), progress });
  }
  return rows;
}

export function countByTab(rows: ListRowData[]): Record<ListTab, number> {
  const counts: Record<ListTab, number> = { en_curso: 0, por_ver: 0, vista: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

export interface ListFilters {
  types: MediaType[];
  tagIds: string[];
}

export function filterRows(rows: ListRowData[], tab: ListTab, f: ListFilters): ListRowData[] {
  return rows.filter(
    (r) =>
      r.status === tab &&
      (f.types.length === 0 || f.types.includes(r.title.type)) &&
      f.tagIds.every((id) => r.entry.tagIds.includes(id)),
  );
}

export function sortRows(rows: ListRowData[], key: SortKey): ListRowData[] {
  const num = (n: number | null | undefined) => n ?? -1;
  const by: Record<SortKey, (a: ListRowData, b: ListRowData) => number> = {
    nota: (a, b) => num(b.entry.myScore) - num(a.entry.myScore),
    imdb: (a, b) => num(b.title.ratings.imdb) - num(a.title.ratings.imdb),
    reciente: (a, b) => b.entry.updatedAt - a.entry.updatedAt,
    az: (a, b) => a.title.title.localeCompare(b.title.title, 'es'),
  };
  return [...rows].sort((a, b) => by[key](a, b) || a.title.title.localeCompare(b.title.title, 'es'));
}

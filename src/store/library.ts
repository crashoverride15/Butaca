import { getDb } from './db';
import type { LibraryEntry, MediaType } from './types';

export const emptyEntry = (key: string, type: MediaType, now = Date.now()): LibraryEntry => ({
  key,
  type,
  inWatchlist: false,
  myScore: null,
  tagIds: [],
  seenAt: null,
  seenEpisodes: {},
  knownSeasons: null,
  addedAt: now,
  updatedAt: now,
});

/** An entry with nothing in it is deleted (spec §5). */
export function isEmptyEntry(e: LibraryEntry): boolean {
  const seenAny = Object.values(e.seenEpisodes).some((eps) => eps.length > 0);
  return !e.inWatchlist && e.myScore === null && e.tagIds.length === 0 && e.seenAt === null && !seenAny;
}

export const getEntry = async (key: string) => (await getDb()).get('library', key);
export const getAllEntries = async () => (await getDb()).getAll('library');

export async function saveEntry(entry: LibraryEntry, now = Date.now()): Promise<void> {
  const db = await getDb();
  if (isEmptyEntry(entry)) await db.delete('library', entry.key);
  else await db.put('library', { ...entry, updatedAt: now });
}

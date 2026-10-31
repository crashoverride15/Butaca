import { MOMENT_IDS, type MomentId } from './seriesMoment';
import type { LibraryEntry } from '../store/types';

// "Clasificar series" (D42): my watched series, to give each its moment and score in one pass. Pure.

const isMoment = (id: string): id is MomentId => (MOMENT_IDS as readonly string[]).includes(id);

export const momentsOf = (e: LibraryEntry): MomentId[] => e.tagIds.filter(isMoment);

/** Series I have watched something of or rated: those without a moment first, the latest touched first. */
export function seriesToClassify(entries: LibraryEntry[]): LibraryEntry[] {
  const watched = entries.filter(
    (e) => e.type === 'tv' && (e.seenAt !== null || e.myScore !== null || Object.values(e.seenEpisodes).some((x) => x.length > 0)),
  );
  return watched.sort((a, b) => Number(momentsOf(a).length > 0) - Number(momentsOf(b).length > 0) || b.updatedAt - a.updatedAt);
}

/** The entry with that moment put on or taken off; the other tags stay. */
export function toggleMoment(e: LibraryEntry, id: MomentId, now = Date.now()): LibraryEntry {
  const tagIds = e.tagIds.includes(id) ? e.tagIds.filter((t) => t !== id) : [...e.tagIds, id];
  return { ...e, tagIds, updatedAt: now };
}

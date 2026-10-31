import { getDb } from './db';
import type { MediaType, Snapshot } from './types';

export const getSnapshot = async (id: string) => (await getDb()).get('snapshots', id);
export const putSnapshot = async (s: Snapshot) => void (await (await getDb()).put('snapshots', s));
export const getAllSnapshots = async () => (await getDb()).getAll('snapshots');

/** When each title was first seen on any of my platforms (ms), merged across platforms (spec §7.3). */
export async function firstSeenMap(type: MediaType): Promise<Record<number, number>> {
  const merged: Record<number, number> = {};
  for (const s of await getAllSnapshots()) {
    if (s.type !== type) continue;
    for (const [id, at] of Object.entries(s.firstSeen)) {
      const key = Number(id);
      merged[key] = Math.min(merged[key] ?? Infinity, at);
    }
  }
  return merged;
}

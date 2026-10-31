import type { Alert, MediaType, Snapshot } from '../store/types';

// "Nuevo en mis plataformas" — spec §7.3. No API says when a title joined a platform, so it is
// deduced by comparing the list with the one of last time. Pure; fetching is in refresh.ts.

export const DAY_MS = 86_400_000;
export const NEW_WINDOW_DAYS = 14;
export const NOVELTY_INTERVAL_MS = DAY_MS;

export interface Diff {
  snapshot: Snapshot;
  /** ids that were not in the previous list (empty on the first run: it is only the baseline) */
  newIds: number[];
  baseline: boolean;
}

export function diffSnapshot(previous: Snapshot | undefined, providerId: number, type: MediaType, ids: number[], now: number): Diff {
  const id = `${providerId}:${type}`;
  if (!previous) {
    const firstSeen = Object.fromEntries(ids.map((x) => [x, now]));
    return { snapshot: { id, providerId, type, firstSeen, takenAt: now }, newIds: [], baseline: true };
  }
  const firstSeen = { ...previous.firstSeen };
  const newIds: number[] = [];
  for (const x of ids) {
    if (firstSeen[x] === undefined) {
      firstSeen[x] = now;
      newIds.push(x);
    }
  }
  return { snapshot: { id, providerId, type, firstSeen, takenAt: now }, newIds, baseline: false };
}

export const noveltyDue = (lastRunAt: number | null, now: number): boolean => lastRunAt === null || now - lastRunAt >= NOVELTY_INTERVAL_MS;

export const isNew = (firstSeenAt: number | undefined, now: number, days = NEW_WINDOW_DAYS): boolean =>
  firstSeenAt !== undefined && now - firstSeenAt <= days * DAY_MS;

export interface Arrival {
  type: MediaType;
  tmdbId: number;
  firstSeen: number;
  providerId: number;
}

/** Arrivals in the last `days`, newest first; a title on several platforms counts once, at its earliest. */
export function recentArrivals(snapshots: Snapshot[], now: number, days = NEW_WINDOW_DAYS): Arrival[] {
  const best = new Map<string, Arrival>();
  for (const s of snapshots) {
    for (const [idText, at] of Object.entries(s.firstSeen)) {
      if (!isNew(at, now, days)) continue;
      const key = `${s.type}:${idText}`;
      const known = best.get(key);
      if (!known || at < known.firstSeen) best.set(key, { type: s.type, tmdbId: Number(idText), firstSeen: at, providerId: s.providerId });
    }
  }
  return [...best.values()].sort((a, b) => b.firstSeen - a.firstSeen);
}

export const platformAlert = (type: MediaType, tmdbId: number, providerName: string, now: number): Alert => ({
  id: `new_on_platform:${type}:${tmdbId}:`,
  kind: 'new_on_platform',
  key: `${type}:${tmdbId}`,
  providerName,
  createdAt: now,
  read: false,
});

/** Relative date of an arrival — spec §4.3: Hoy, Ayer, Hace N días, Hace N semanas. */
export function relativeArrival(at: number, now: number): string {
  const days = Math.floor((now - at) / DAY_MS);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
}

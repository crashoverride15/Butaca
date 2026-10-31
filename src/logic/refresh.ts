import { discover, getTitle } from '../api/tmdb';
import { addAlerts } from '../store/alerts';
import { getAllEntries, saveEntry } from '../store/library';
import { getSettings, saveSettings } from '../store/settings';
import { getSnapshot, putSnapshot } from '../store/snapshots';
import type { Alert, LibraryEntry, MediaType, Provider } from '../store/types';
import { diffSnapshot, noveltyDue, platformAlert } from './novelties';
import { isFollowed, seasonAlerts } from './seasons';
import { todayIso } from './status';

// Refresh on open — spec §7.5. Network errors are silent for the user (the cache answers); they go to the console.

export const REFRESH_INTERVAL_MS = 6 * 3_600_000;
const NOVELTY_PAGES = 5;

export const refreshDue = (lastRefreshAt: number | null, now: number): boolean =>
  lastRefreshAt === null || now - lastRefreshAt >= REFRESH_INTERVAL_MS;

const hasSeen = (e: LibraryEntry | undefined): boolean =>
  Boolean(e && (e.seenAt !== null || Object.values(e.seenEpisodes).some((x) => x.length > 0)));

async function refreshSeasons(entries: LibraryEntry[], now: number): Promise<void> {
  const today = todayIso(new Date(now));
  const series = entries.filter((e) => e.type === 'tv' && hasSeen(e));
  for (const entry of series) {
    try {
      const id = Number(entry.key.split(':')[1]);
      const title = await getTitle('tv', id);
      if (!isFollowed(title, entry)) continue;
      const { alerts, knownSeasons } = seasonAlerts(title, entry, today, now);
      await addAlerts(alerts);
      if (knownSeasons !== entry.knownSeasons) await saveEntry({ ...entry, knownSeasons }, entry.updatedAt);
    } catch (e) {
      console.warn('[butaca] refreshing a followed series failed', entry.key, e);
    }
  }
}

async function platformIds(providerId: number, type: MediaType): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= NOVELTY_PAGES; page++) {
    const res = await discover(
      type,
      { watch_region: 'ES', with_watch_providers: providerId, with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc' },
      page,
    );
    ids.push(...res.items.map((c) => c.tmdbId));
    if (page >= res.totalPages) break;
  }
  return ids;
}

async function refreshNovelties(platforms: Provider[], library: Record<string, LibraryEntry>, now: number): Promise<void> {
  for (const provider of platforms) {
    for (const type of ['movie', 'tv'] as const) {
      try {
        const ids = await platformIds(provider.id, type);
        const previous = await getSnapshot(`${provider.id}:${type}`);
        const diff = diffSnapshot(previous, provider.id, type, ids, now);
        await putSnapshot(diff.snapshot);
        const alerts: Alert[] = diff.newIds
          .filter((id) => !hasSeen(library[`${type}:${id}`]))
          .map((id) => platformAlert(type, id, provider.name, now));
        await addAlerts(alerts);
      } catch (e) {
        console.warn('[butaca] platform novelties failed', provider.name, type, e);
      }
    }
  }
}

export interface RefreshResult {
  ran: boolean;
  noveltiesRan: boolean;
}

/** Runs the refresh if it is due (or forced). Safe to call often. */
export async function runRefresh(opts: { force?: boolean; now?: number } = {}): Promise<RefreshResult> {
  const now = opts.now ?? Date.now();
  const settings = await getSettings();
  if (!settings.tmdbToken) return { ran: false, noveltiesRan: false };
  if (!opts.force && !refreshDue(settings.lastRefreshAt, now)) return { ran: false, noveltiesRan: false };

  const entries = await getAllEntries();
  const library = Object.fromEntries(entries.map((e) => [e.key, e]));

  await refreshSeasons(entries, now);

  let noveltiesRan = false;
  if (settings.platforms.length > 0 && noveltyDue(settings.lastNoveltyRunAt, now)) {
    await refreshNovelties(settings.platforms, library, now);
    await saveSettings({ lastNoveltyRunAt: now });
    noveltiesRan = true;
  }
  await saveSettings({ lastRefreshAt: now });
  return { ran: true, noveltiesRan };
}

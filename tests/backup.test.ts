import { beforeEach, describe, expect, it } from 'vitest';
import { backupFileName, backupReminder, buildBackup, importBackup, parseBackup } from '../src/logic/backup';
import { addAlerts, listAlerts } from '../src/store/alerts';
import { emptyEntry, getAllEntries, saveEntry } from '../src/store/library';
import { getSettings, saveSettings } from '../src/store/settings';
import { putSnapshot, getAllSnapshots } from '../src/store/snapshots';
import { createTag, ensureInitialTags, listTags } from '../src/store/tags';
import { freshDb } from './helpers';

beforeEach(freshDb);

async function fill() {
  await saveSettings({ tmdbToken: 'SECRET-TOKEN', omdbKey: 'SECRET-KEY', platforms: [{ id: 119, name: 'Prime Video' }], lastRefreshAt: 5 });
  await ensureInitialTags();
  await createTag('Navidad', 'libre');
  await saveEntry({ ...emptyEntry('movie:1', 'movie', 1), seenAt: 123, myScore: 9, tagIds: ['momento:noche'] });
  await saveEntry({ ...emptyEntry('tv:2', 'tv', 1), seenEpisodes: { 1: [1, 2] }, knownSeasons: 3 });
  await addAlerts([{ id: 'new_season:tv:2:4', kind: 'new_season', key: 'tv:2', season: 4, createdAt: 9, read: false }]);
  await putSnapshot({ id: '119:movie', providerId: 119, type: 'movie', firstSeen: { 7: 100 }, takenAt: 100 });
}

describe('backup', () => {
  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 9, 5))).toBe('butaca-2026-10-05.json');
  });

  it('never carries the API keys', async () => {
    await fill();
    const text = JSON.stringify(await buildBackup());
    expect(text).not.toContain('SECRET-TOKEN');
    expect(text).not.toContain('SECRET-KEY');
    expect(JSON.parse(text).settings.platforms).toEqual([{ id: 119, name: 'Prime Video' }]);
  });

  it('exporting, wiping and importing restores everything and keeps the keys', async () => {
    await fill();
    const text = JSON.stringify(await buildBackup());
    const before = {
      library: await getAllEntries(), tags: await listTags(), alerts: await listAlerts(), snapshots: await getAllSnapshots(),
    };
    await freshDb();
    await saveSettings({ tmdbToken: 'NEW-TOKEN' });
    await saveEntry({ ...emptyEntry('movie:99', 'movie', 1), inWatchlist: true }); // will be replaced
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importBackup(parsed.backup);
    expect(await getAllEntries()).toEqual(before.library);
    expect(await listTags()).toEqual(before.tags);
    expect(await listAlerts()).toEqual(before.alerts);
    expect(await getAllSnapshots()).toEqual(before.snapshots);
    expect(await getSettings()).toMatchObject({ tmdbToken: 'NEW-TOKEN', platforms: [{ id: 119, name: 'Prime Video' }] });
  });

  it('rejects files that are not a Butaca copy, or are from a newer version', async () => {
    const good = await buildBackup();
    expect(parseBackup('no es json').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...good, app: 'otra' })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...good, library: [{ sin: 'key' }] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...good, tags: 'x' })).ok).toBe(false);
    const newer = parseBackup(JSON.stringify({ ...good, version: 99 }));
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.message).toContain('versión más nueva');
  });

  it('reminds after 30 days, or when there is data and never a copy', () => {
    const DAY = 86_400_000;
    const now = 100 * DAY;
    expect(backupReminder(now - 30 * DAY, true, now)).toBeNull();
    expect(backupReminder(now - 31 * DAY, true, now)).toBe('Última copia: hace 31 días');
    expect(backupReminder(null, true, now)).toBe('Aún no has hecho ninguna copia.');
    expect(backupReminder(null, false, now)).toBeNull();
  });
});

import { getDb } from '../store/db';
import { getSettings, saveSettings } from '../store/settings';
import type { Alert, LibraryEntry, Settings, Snapshot, Tag } from '../store/types';

// Backup — spec §7.6. Export as a JSON file (without the API keys), import replaces the data.

export const BACKUP_VERSION = 1;
export const REMINDER_DAYS = 30;

export interface BackupFile {
  app: 'butaca';
  version: number;
  exportedAt: number;
  library: LibraryEntry[];
  tags: Tag[];
  alerts: Alert[];
  snapshots: Snapshot[];
  settings: Omit<Settings, 'tmdbToken' | 'omdbKey'>;
}

export const backupFileName = (now = new Date()): string =>
  `butaca-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;

export async function buildBackup(now = Date.now()): Promise<BackupFile> {
  const db = await getDb();
  const { tmdbToken: _t, omdbKey: _o, ...settings } = await getSettings();
  return {
    app: 'butaca',
    version: BACKUP_VERSION,
    exportedAt: now,
    library: await db.getAll('library'),
    tags: await db.getAll('tags'),
    alerts: await db.getAll('alerts'),
    snapshots: await db.getAll('snapshots'),
    settings,
  };
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const BAD = 'Ese archivo no es una copia de Butaca.';

/** Checks the structure well enough that importing cannot leave the data half-written. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: BAD };
  }
  if (!isObj(raw) || raw.app !== 'butaca') return { ok: false, message: BAD };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, message: 'Esa copia es de una versión más nueva de Butaca. Actualiza la app.' };
  }
  const lists: [string, string][] = [['library', 'key'], ['tags', 'id'], ['alerts', 'id'], ['snapshots', 'id']];
  for (const [name, keyField] of lists) {
    const list = raw[name];
    if (!Array.isArray(list) || !list.every((x) => isObj(x) && typeof x[keyField] === 'string')) {
      return { ok: false, message: BAD };
    }
  }
  if (!isObj(raw.settings)) return { ok: false, message: BAD };
  return { ok: true, backup: raw as unknown as BackupFile };
}

/** Replaces the library, tags, alerts and snapshots with the file's; keeps my API keys. */
export async function importBackup(backup: BackupFile): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['library', 'tags', 'alerts', 'snapshots'], 'readwrite');
  for (const name of ['library', 'tags', 'alerts', 'snapshots'] as const) {
    await tx.objectStore(name).clear();
  }
  for (const e of backup.library) await tx.objectStore('library').put(e);
  for (const t of backup.tags) await tx.objectStore('tags').put(t);
  for (const a of backup.alerts) await tx.objectStore('alerts').put(a);
  for (const s of backup.snapshots) await tx.objectStore('snapshots').put(s);
  await tx.done;
  const { platforms, lastRefreshAt, lastNoveltyRunAt } = backup.settings;
  await saveSettings({ platforms: platforms ?? [], lastRefreshAt: lastRefreshAt ?? null, lastNoveltyRunAt: lastNoveltyRunAt ?? null });
}

/** "Última copia: hace N días" once the last one is older than 30 days, or there is data and never a copy. */
export function backupReminder(lastBackupAt: number | null | undefined, hasData: boolean, now: number): string | null {
  if (!hasData) return null;
  if (lastBackupAt == null) return 'Aún no has hecho ninguna copia.';
  const days = Math.floor((now - lastBackupAt) / 86_400_000);
  return days > REMINDER_DAYS ? `Última copia: hace ${days} días` : null;
}

/** Shares the file on iPhone when possible, otherwise downloads it. Returns how it ended. */
export async function deliverBackup(backup: BackupFile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = backupFileName(new Date(backup.exportedAt));
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      await saveSettings({ lastBackupAt: backup.exportedAt });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      /* any other failure: fall back to a download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await saveSettings({ lastBackupAt: backup.exportedAt });
  return 'downloaded';
}

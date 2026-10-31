import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Alert, CacheRecord, LibraryEntry, Settings, Snapshot, Tag, Title } from './types';

// IndexedDB `butaca`, version 1 — spec §5. Every schema change bumps DB_VERSION and adds an upgrade step.

export const DB_NAME = 'butaca';
export const DB_VERSION = 1;

interface ButacaDB extends DBSchema {
  titles: { key: string; value: Title };
  library: { key: string; value: LibraryEntry };
  tags: { key: string; value: Tag };
  alerts: { key: string; value: Alert };
  snapshots: { key: string; value: Snapshot };
  settings: { key: string; value: Settings };
  cache: { key: string; value: CacheRecord };
}

export type ButacaDatabase = IDBPDatabase<ButacaDB>;

let dbPromise: Promise<ButacaDatabase> | null = null;

export function getDb(): Promise<ButacaDatabase> {
  dbPromise ??= openDB<ButacaDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('titles', { keyPath: 'key' });
        db.createObjectStore('library', { keyPath: 'key' });
        db.createObjectStore('tags', { keyPath: 'id' });
        db.createObjectStore('alerts', { keyPath: 'id' });
        db.createObjectStore('snapshots', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        db.createObjectStore('cache', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

/** For tests: forget the open connection so the next call reopens (or recreates) it. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

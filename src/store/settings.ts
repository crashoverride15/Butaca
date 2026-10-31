import { getDb } from './db';
import type { Settings } from './types';

const DEFAULTS: Settings = {
  id: 'main',
  tmdbToken: '',
  omdbKey: '',
  platforms: [],
  region: 'ES',
  language: 'es-ES',
  lastRefreshAt: null,
  lastNoveltyRunAt: null,
};

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  return { ...DEFAULTS, ...(await db.get('settings', 'main')) };
}

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const db = await getDb();
  const next = { ...(await getSettings()), ...patch, id: 'main' as const };
  await db.put('settings', next);
  return next;
}

/** First run: no TMDB token saved yet (spec §1). */
export const needsSetup = (s: Settings): boolean => s.tmdbToken.trim() === '';

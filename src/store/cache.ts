import { getDb } from './db';

// Generic cache with TTL for lists that are not titles (spec §6.1: genres 30 days, providers 48 h).

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const isFresh = (fetchedAt: number, ttl: number, now = Date.now()): boolean => now - fetchedAt < ttl;

export async function readCache<T>(id: string): Promise<{ value: T; fetchedAt: number } | null> {
  const record = await (await getDb()).get('cache', id);
  return record ? { value: record.value as T, fetchedAt: record.fetchedAt } : null;
}

export async function writeCache(id: string, value: unknown, now = Date.now()): Promise<void> {
  await (await getDb()).put('cache', { id, value, fetchedAt: now });
}

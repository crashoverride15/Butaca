import { getDb } from './db';
import type { Alert } from './types';

// Alerts — spec §5. A change event lets the bottom bar's dot follow without polling.

export const ALERTS_EVENT = 'butaca:alerts';
const notify = () => window.dispatchEvent(new Event(ALERTS_EVENT));

export const listAlerts = async (): Promise<Alert[]> =>
  (await (await getDb()).getAll('alerts')).sort((a, b) => b.createdAt - a.createdAt);

/** Adds alerts that do not exist yet; an existing one keeps its read state. */
export async function addAlerts(alerts: Alert[]): Promise<number> {
  if (alerts.length === 0) return 0;
  const db = await getDb();
  const tx = db.transaction('alerts', 'readwrite');
  let added = 0;
  for (const a of alerts) {
    if (await tx.store.get(a.id)) continue;
    await tx.store.put(a);
    added++;
  }
  await tx.done;
  if (added > 0 && typeof window !== 'undefined') notify();
  return added;
}

export async function markRead(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('alerts', 'readwrite');
  for (const id of ids) {
    const a = await tx.store.get(id);
    if (a && !a.read) await tx.store.put({ ...a, read: true });
  }
  await tx.done;
  if (typeof window !== 'undefined') notify();
}

export const unreadCount = async (): Promise<number> => (await listAlerts()).filter((a) => !a.read).length;

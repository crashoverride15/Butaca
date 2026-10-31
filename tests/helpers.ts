import 'fake-indexeddb/auto';
import { DB_NAME, resetDbForTests } from '../src/store/db';

/** Fresh empty database for each test. */
export async function freshDb(): Promise<void> {
  await resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

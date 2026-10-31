import { getDb } from './db';
import type { Title } from './types';

export const getTitleCached = async (key: string): Promise<Title | undefined> =>
  (await getDb()).get('titles', key);

export async function putTitle(title: Title): Promise<void> {
  await (await getDb()).put('titles', title);
}

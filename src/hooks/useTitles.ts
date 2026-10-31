import { useEffect, useState } from 'react';
import { ensureRatings } from '../api/omdb';
import { getTitle } from '../api/tmdb';
import { parseKey } from '../logic/cards';
import { getTitleCached } from '../store/titles';
import type { Title } from '../store/types';

/**
 * Titles by key: the cache answers at once, missing ones are fetched, and ratings are asked
 * only for these keys (the ones on screen — OMDb has a daily allowance, spec §6.2).
 */
export function useTitles(keys: string[], opts: { ratings?: boolean } = {}): Record<string, Title> {
  const [titles, setTitles] = useState<Record<string, Title>>({});
  const signature = keys.join('|');

  useEffect(() => {
    let alive = true;
    const put = (t: Title) => alive && setTitles((prev) => ({ ...prev, [t.key]: t }));
    for (const key of keys) {
      const parsed = parseKey(key);
      if (!parsed) continue;
      void (async () => {
        let title = await getTitleCached(key);
        if (title) put(title);
        try {
          title = await getTitle(parsed.type, parsed.tmdbId);
          put(title);
          if (opts.ratings !== false) put(await ensureRatings(title));
        } catch {
          /* offline with nothing cached: the row simply does not appear */
        }
      })();
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return titles;
}

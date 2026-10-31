import { useCallback, useEffect, useState } from 'react';
import { emptyEntry, getEntry, isEmptyEntry, saveEntry } from '../../store/library';
import type { LibraryEntry, MediaType } from '../../store/types';

/** My entry for one title. `entry` is always usable (blank when nothing is saved); `commit` persists. */
export function useEntry(key: string, type: MediaType) {
  const [stored, setStored] = useState<LibraryEntry | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    getEntry(key).then((e) => {
      if (!alive) return;
      setStored(e);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const entry = stored ?? emptyEntry(key, type);

  const commit = useCallback(async (next: LibraryEntry) => {
    setStored(isEmptyEntry(next) ? undefined : { ...next, updatedAt: Date.now() });
    await saveEntry(next);
  }, []);

  return { entry, stored, ready, commit };
}

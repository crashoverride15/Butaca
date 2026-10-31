import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/errors';
import { ensureRatings } from '../../api/omdb';
import { getTitle } from '../../api/tmdb';
import type { MediaType, Title } from '../../store/types';

/** Title detail from cache/TMDB; ratings arrive afterwards and never block the screen. */
export function useTitle(type: MediaType, id: number) {
  const [title, setTitle] = useState<Title | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setTitle(null);
    setError(null);
    getTitle(type, id)
      .then((t) => {
        if (!alive) return;
        setTitle(t);
        void ensureRatings(t).then((rated) => alive && setTitle(rated));
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof ApiError ? e.message : 'No se ha podido cargar el título.');
      });
    return () => {
      alive = false;
    };
  }, [type, id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { title, error, retry };
}

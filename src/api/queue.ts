// Simple concurrency limiter — spec §6.1 (TMDB: 6) and §6.2 (OMDb: 3).

export interface Queue {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createQueue(limit: number): Queue {
  let active = 0;
  const waiting: (() => void)[] = [];

  const next = () => {
    active--;
    waiting.shift()?.();
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
      active++;
      try {
        return await task();
      } finally {
        next();
      }
    },
  };
}

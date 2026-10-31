import { useState } from 'react';
import type { Kind } from '../logic/featured';

// Movies or series: the choice is remembered in localStorage (`butaca.kind`).

const KEY = 'butaca.kind';

function load(): Kind {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'movie' || saved === 'tv') return saved;
  } catch {
    /* no storage: default */
  }
  return 'movie';
}

export function useKind(): [Kind, (k: Kind) => void] {
  const [kind, setKind] = useState<Kind>(load);
  const set = (k: Kind) => {
    setKind(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      /* not remembered */
    }
  };
  return [kind, set];
}

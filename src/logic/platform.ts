import { shortPlatformName } from '../api/tmdb';
import type { Provider, Title } from '../store/types';

/** My platforms that carry this title. */
export const myProviders = (title: Title, mine: Provider[]): Provider[] => {
  const ids = new Set(mine.map((p) => p.id));
  return title.providers.filter((p) => ids.has(p.id));
};

/** Short name of the first of my platforms with the title, or null. */
export const platformLabel = (title: Title, mine: Provider[]): string | null => {
  const first = myProviders(title, mine)[0];
  return first ? shortPlatformName(first.name) : null;
};

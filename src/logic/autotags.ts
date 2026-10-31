import type { Title } from '../store/types';

// Automatic tags — spec §5. Never stored: computed from the title and shown like the others.

export function epochOf(year: number | null): string | null {
  if (!year) return null;
  if (year < 1980) return 'Clásico';
  return `${String(Math.floor(year / 10) * 10).slice(2)}s`;
}

const KNOWN_ORIGINS: Record<string, string> = { ES: 'Española', US: 'EE. UU.', GB: 'Reino Unido' };

export function originName(code: string): string {
  const known = KNOWN_ORIGINS[code];
  if (known) return known;
  try {
    return new Intl.DisplayNames('es', { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export interface AutoTags {
  epoca: string | null;
  origen: string[];
  estilo: string[];
}

export function autoTags(title: Pick<Title, 'year' | 'originCountry' | 'genres'>): AutoTags {
  return {
    epoca: epochOf(title.year),
    origen: title.originCountry.map(originName),
    estilo: title.genres.map((g) => g.name),
  };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Drops automatic names that a manual tag already shows (same name, any case or accent). */
export function withoutShown(auto: string[], shown: string[]): string[] {
  const taken = new Set(shown.map(norm));
  return auto.filter((name) => {
    if (taken.has(norm(name))) return false;
    taken.add(norm(name));
    return true;
  });
}

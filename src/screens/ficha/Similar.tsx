import { useEffect, useState } from 'react';
import { ensureRatings } from '../../api/omdb';
import { discover, getTitle } from '../../api/tmdb';
import { PosterTile } from '../../components/PosterTile';
import { parseKey, titleToCard } from '../../logic/cards';
import { platformLabel } from '../../logic/platform';
import { candidateKeys, similarTo, type SimilarItem } from '../../logic/similar';
import { todayIso, watchStatus } from '../../logic/status';
import { discoverByKeywords } from '../../logic/featured';
import { getAllEntries } from '../../store/library';
import { getTitleCached } from '../../store/titles';
import type { Provider, Title } from '../../store/types';

// "Parecidas" — spec §9.2 (6) and §7.1.

const MAX_LOADS = 40;

async function loadCandidates(keys: string[]): Promise<Title[]> {
  const out: Title[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const cached = await getTitleCached(key);
    if (cached) out.push(cached);
    else missing.push(key);
  }
  await Promise.all(
    missing.slice(0, MAX_LOADS).map(async (key) => {
      const p = parseKey(key);
      if (!p) return;
      try {
        out.push(await getTitle(p.type, p.tmdbId));
      } catch {
        /* skip: the candidate just does not appear */
      }
    }),
  );
  return out;
}

export function Similar({ title, mine }: { title: Title; mine: Provider[] }) {
  const [items, setItems] = useState<SimilarItem[] | null>(null);
  const [imdb, setImdb] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let alive = true;
    setItems(null);
    void (async () => {
      const entries = await getAllEntries();
      const library = Object.fromEntries(entries.map((e) => [e.key, e]));
      // beyond TMDB's own list: titles on my platforms that carry the same themes (D35)
      const byPlot = await discover(title.type, discoverByKeywords(title.keywords.slice(0, 8), mine), 1).catch(() => null);
      const plotKeys = title.keywords.length > 0 && mine.length > 0 ? (byPlot?.items ?? []).slice(0, 20).map((c) => c.key) : [];
      const keys = [...new Set([...candidateKeys(title, library), ...plotKeys])].filter((k) => k !== title.key);
      const candidates = await loadCandidates(keys);
      const today = todayIso();
      const seen = new Set(candidates.filter((c) => watchStatus(c, library[c.key], today) === 'vista').map((c) => c.key));
      const result = similarTo({ target: title, targetEntry: library[title.key], candidates, library, seen, mine });
      if (!alive) return;
      setItems(result);
      for (const item of result) {
        void ensureRatings(item.title).then((t) => alive && setImdb((prev) => ({ ...prev, [t.key]: t.ratings.imdb })));
      }
    })();
    return () => {
      alive = false;
    };
  }, [title, mine]);

  if (items !== null && items.length === 0) return null;
  return (
    <section className="ficha__section" aria-labelledby="similar-h">
      <div className="ficha__section-head">
        <h2 id="similar-h" className="t-section">Parecidas</h2>
        <span className="ficha__counter ellipsis">Misma trama · sin vistas</span>
      </div>
      <div className="carousel">
        {items === null
          ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ width: 110, height: 165, flex: 'none' }} />)
          : items.map(({ title: t, caption }) => (
              <PosterTile
                key={t.key}
                card={titleToCard(t)}
                imdb={imdb[t.key] ?? t.ratings.imdb}
                width={110}
                line1={platformLabel(t, mine) ?? ''}
                line2={<span style={{ color: caption.startsWith('Recomendada') ? undefined : 'var(--accent-light)' }}>{caption}</span>}
              />
            ))}
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { ensureRatings } from '../api/omdb';
import { discover, getTitle } from '../api/tmdb';
import { buildProfile, discoverParamsFor, pickFeatured, type FeaturedItem, type Moment } from '../logic/featured';
import { todayIso, watchStatus } from '../logic/status';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { getTitleCached } from '../store/titles';
import type { MediaType, Title } from '../store/types';

// Loads what the hero needs (spec §7.2): my titles, then — if the profile asks — a discover on my platforms.

export function useFeatured(moment: Moment) {
  const { settings } = useSettings();
  const [items, setItems] = useState<FeaturedItem[] | null>(null);
  const platformKey = settings.platforms.map((p) => p.id).join(',');

  useEffect(() => {
    let alive = true;
    setItems(null);
    void (async () => {
      const entries = await getAllEntries();
      const titles: Record<string, Title> = {};
      await Promise.all(
        entries
          .filter((e) => e.tagIds.length > 0 || e.inWatchlist || e.seenAt !== null)
          .map(async (e) => {
            const t = await getTitleCached(e.key);
            if (t) titles[e.key] = t;
          }),
      );
      const today = todayIso();
      const seen = new Set(entries.filter((e) => titles[e.key] && watchStatus(titles[e.key], e, today) === 'vista').map((e) => e.key));

      const profile = buildProfile(moment, entries, titles);
      let discovered: Title[] = [];
      if (settings.platforms.length > 0) {
        try {
          const types: MediaType[] = profile.type ? [profile.type] : ['movie', 'tv'];
          const params = profile.refs.length > 0
            ? discoverParamsFor(profile, settings.platforms)
            : { ...discoverParamsFor({ ...profile, topGenres: [], decades: [] }, settings.platforms), 'primary_release_date.gte': `${new Date().getFullYear() - 3}-01-01`, 'first_air_date.gte': `${new Date().getFullYear() - 3}-01-01` };
          const pages = await Promise.all(types.map((t) => discover(t, params, 1)));
          const cards = pages.flatMap((p) => p.items.slice(0, 8));
          const details = await Promise.all(cards.map((c) => getTitle(c.type, c.tmdbId).catch(() => null)));
          discovered = details.filter((t): t is Title => t !== null);
          if (profile.refs.length === 0) discovered = await Promise.all(discovered.map((t) => ensureRatings(t)));
        } catch (e) {
          console.warn('[butaca] discover for the hero failed', e);
        }
      }
      if (alive) setItems(pickFeatured({ moment, entries, titles, seen, discovered }));
    })();
    return () => {
      alive = false;
    };
  }, [moment, platformKey, settings.platforms]);

  return items;
}

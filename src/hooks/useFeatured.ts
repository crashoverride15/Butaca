import { useEffect, useState } from 'react';
import { ensureRatings } from '../api/omdb';
import { discover, getTitle } from '../api/tmdb';
import { buildKindProfile, discoverByKeywords, discoverParamsFor, moreForYou, pickFeatured, rankByTaste, recommendedKeys, topKeywords, type FeaturedInput, type FeaturedItem, type Kind } from '../logic/featured';
import { parseKey } from '../logic/cards';
import { todayIso, watchStatus } from '../logic/status';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { getTitleCached } from '../store/titles';
import type { LibraryEntry, Provider, Title } from '../store/types';

// Loads what the hero needs (spec §7.2): my titles, then — if the profile asks — a discover on my platforms.

const MAX_DETAIL_LOADS = 90;

/** Details of these keys: cache first, then TMDB for at most `max` of the missing ones. */
export async function loadTitles(keys: string[], max: number): Promise<Title[]> {
  const out: Title[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const cached = await getTitleCached(key);
    if (cached) out.push(cached);
    else missing.push(key);
  }
  const fetched = await Promise.all(
    missing.slice(0, max).map(async (key) => {
      const p = parseKey(key);
      return p ? getTitle(p.type, p.tmdbId).catch(() => null) : null;
    }),
  );
  return [...out, ...fetched.filter((t): t is Title => t !== null)];
}

/** With a taste: what TMDB recommends for my favourites, plus titles that carry their themes (D35). */
export async function tasteCandidates(kind: Kind, profile: ReturnType<typeof buildKindProfile>, entries: LibraryEntry[], mine: Provider[], maxLoads = MAX_DETAIL_LOADS): Promise<Title[]> {
  const answered = new Set(entries.filter((e) => e.seenAt !== null || e.myScore !== null).map((e) => e.key));
  const keywords = topKeywords(profile);
  // three pages of each: the wider the net, the better the best of it (D40)
  const pages = [1, 2, 3];
  const [byPlot, byGenre] = await Promise.all([
    Promise.all(pages.map((p) => (keywords.length > 0 ? discover(kind, discoverByKeywords(keywords, mine), p).catch(() => null) : null))),
    Promise.all(pages.map((p) => discover(kind, discoverParamsFor(profile, mine), p).catch(() => null))),
  ]);
  const found = [...byPlot, ...byGenre].flatMap((page) => page?.items ?? []).map((c) => c.key);
  const keys = [...recommendedKeys(profile, answered), ...found].filter((k) => !answered.has(k));
  return loadTitles([...new Set(keys)], maxLoads);
}

/** Without a taste yet: the best of what arrived in the last years, with IMDb to order them. */
async function recentCandidates(kind: Kind, mine: Provider[]): Promise<Title[]> {
  const from = `${new Date().getFullYear() - 3}-01-01`;
  const params = { ...discoverParamsFor({ refs: [], topGenres: [], decades: [], type: null }, mine), 'primary_release_date.gte': from, 'first_air_date.gte': from };
  const page = await discover(kind, params, 1);
  const details = await Promise.all(page.items.slice(0, 8).map((c) => getTitle(c.type, c.tmdbId).catch(() => null)));
  return Promise.all(details.filter((t): t is Title => t !== null).map((t) => ensureRatings(t)));
}

export interface Featured {
  /** the five on top */
  items: FeaturedItem[];
  /** the next best, for "Más para ti" */
  more: FeaturedItem[];
}

/** How many of the best candidates get their IMDb score asked before choosing (D43); kept a week. */
const RATE_FIRST = 40;

/**
 * The input with the IMDb score of its best candidates (D43), so one rated low is dropped before it is offered,
 * not after. OMDb has a daily allowance: only the first `max`, and each score is kept for a week.
 */
export async function withRatings(input: FeaturedInput, max = RATE_FIRST): Promise<FeaturedInput> {
  const result = rankByTaste(input);
  if (!result) return input;
  const rated = await Promise.all(result.ranked.slice(0, max).map((c) => ensureRatings(c.title).catch(() => c.title)));
  const byKey = new Map(rated.map((t) => [t.key, t]));
  return { ...input, discovered: input.discovered.map((t) => byKey.get(t.key) ?? t) };
}

export function useFeatured(kind: Kind) {
  const { settings } = useSettings();
  const [items, setItems] = useState<Featured | null>(null);
  const platformKey = settings.platforms.map((p) => p.id).join(',');

  useEffect(() => {
    let alive = true;
    setItems(null);
    void (async () => {
      const entries = await getAllEntries();
      const titles: Record<string, Title> = {};
      await Promise.all(
        entries
          .filter((e) => e.tagIds.length > 0 || e.inWatchlist || e.seenAt !== null || e.myScore !== null)
          .map(async (e) => {
            const t = await getTitleCached(e.key);
            if (t) titles[e.key] = t;
          }),
      );
      const today = todayIso();
      const seen = new Set(entries.filter((e) => titles[e.key] && watchStatus(titles[e.key], e, today) === 'vista').map((e) => e.key));

      const profile = buildKindProfile(kind, entries, titles);
      let discovered: Title[] = [];
      if (settings.platforms.length > 0) {
        try {
          discovered = profile.refs.length > 0 ? await tasteCandidates(kind, profile, entries, settings.platforms) : await recentCandidates(kind, settings.platforms);
        } catch (e) {
          console.warn('[butaca] candidates for the hero failed', e);
        }
      }
      const input = await withRatings({ mine: settings.platforms, kind, entries, titles, seen, discovered });
      const top = pickFeatured(input);
      if (alive) setItems({ items: top, more: moreForYou(input, new Set(top.map((t) => t.title.key))) });
    })();
    return () => {
      alive = false;
    };
  }, [kind, platformKey, settings.platforms]);

  return items;
}

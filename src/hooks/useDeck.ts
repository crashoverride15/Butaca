import { useCallback, useEffect, useRef, useState } from 'react';
import { discover } from '../api/tmdb';
import { buildKindProfile, type Kind, type Profile } from '../logic/featured';
import { deckParams, isParked, rankDeck } from '../logic/gustos';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { getTitleCached } from '../store/titles';
import type { Title, TitleCard } from '../store/types';

// The Gustos deck (D28): titles on my platforms I have not answered yet, filled from TMDB as it runs low.

const LOW = 4;
const MAX_PAGES = 5;

export interface Deck {
  /** the card on top is cards[0] */
  cards: TitleCard[];
  loading: boolean;
  /** nothing more to show */
  done: boolean;
  /** drops the top card (it has been answered) */
  answered: () => void;
  /** puts a card back on top (undo) */
  restore: (card: TitleCard) => void;
}

export function useDeck(kind: Kind): Deck {
  const { settings } = useSettings();
  const platformKey = settings.platforms.map((p) => p.id).join(',');
  const [cards, setCards] = useState<TitleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const ctx = useRef<{ profile: Profile; exclude: Set<string>; page: number; busy: boolean; alive: boolean } | null>(null);

  const fetchMore = useCallback(async () => {
    const c = ctx.current;
    if (!c || c.busy || settings.platforms.length === 0) return;
    c.busy = true;
    setLoading(true);
    try {
      let fresh: TitleCard[] = [];
      while (fresh.length < 8 && c.page < MAX_PAGES) {
        c.page += 1;
        const res = await discover(kind, deckParams(c.profile, settings.platforms), c.page);
        fresh = rankDeck([...fresh, ...res.items], c.profile, c.exclude);
        if (c.page >= res.totalPages) {
          c.page = MAX_PAGES;
          break;
        }
      }
      if (!c.alive) return;
      fresh.forEach((f) => c.exclude.add(f.key));
      setCards((prev) => [...prev, ...fresh]);
      if (c.page >= MAX_PAGES && fresh.length === 0) setDone(true);
    } catch (e) {
      console.warn('[butaca] the Gustos deck could not load', e);
      if (c.alive) setDone(true);
    } finally {
      c.busy = false;
      if (c.alive) setLoading(false);
    }
  }, [kind, settings.platforms]);

  useEffect(() => {
    let alive = true;
    setCards([]);
    setDone(false);
    setLoading(true);
    void (async () => {
      const entries = await getAllEntries();
      const titles: Record<string, Title> = {};
      await Promise.all(
        entries
          .filter((e) => e.type === kind && (e.myScore ?? 0) >= 7)
          .map(async (e) => {
            const t = await getTitleCached(e.key);
            if (t) titles[e.key] = t;
          }),
      );
      if (!alive) return;
      ctx.current = { profile: buildKindProfile(kind, entries, titles), exclude: new Set(entries.filter((e) => isParked(e)).map((e) => e.key)), page: 0, busy: false, alive: true };
      if (settings.platforms.length === 0) {
        setLoading(false);
        setDone(true);
        return;
      }
      await fetchMore();
    })();
    return () => {
      alive = false;
      if (ctx.current) ctx.current.alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, platformKey]);

  useEffect(() => {
    if (!done && !loading && cards.length < LOW && ctx.current) void fetchMore();
  }, [cards.length, done, loading, fetchMore]);

  const answered = useCallback(() => setCards((prev) => prev.slice(1)), []);
  const restore = useCallback((card: TitleCard) => {
    setDone(false);
    setCards((prev) => [card, ...prev.filter((c) => c.key !== card.key)]);
  }, []);
  return { cards, loading, done, answered, restore };
}

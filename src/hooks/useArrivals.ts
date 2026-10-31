import { useEffect, useMemo, useState } from 'react';
import { buildLikedProfile, buildProfile, profileAffinity, type Moment } from '../logic/featured';
import { recentArrivals, type Arrival } from '../logic/novelties';
import { todayIso, watchStatus } from '../logic/status';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { getAllSnapshots } from '../store/snapshots';
import type { LibraryEntry, Title } from '../store/types';
import { useTitles } from './useTitles';

// Recent arrivals on my platforms (spec §7.3) ready to show: not seen, best fit first.

export interface ArrivalItem {
  arrival: Arrival;
  title: Title;
}

export function useArrivals(opts: { days: number; max: number; moment?: Moment }): ArrivalItem[] | null {
  const { settings } = useSettings();
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([getAllSnapshots(), getAllEntries()]).then(([snaps, es]) => {
      if (!alive) return;
      setArrivals(recentArrivals(snaps, Date.now(), opts.days));
      setEntries(es);
    });
    return () => {
      alive = false;
    };
  }, [opts.days, settings.lastNoveltyRunAt]);

  const keys = useMemo(() => (arrivals ?? []).slice(0, 40).map((a) => `${a.type}:${a.tmdbId}`), [arrivals]);
  const titles = useTitles(keys, { ratings: false });
  const libraryTitles = useTitles(useMemo(() => entries.filter((e) => e.tagIds.length > 0 || (e.myScore ?? 0) >= 7).map((e) => e.key), [entries]), { ratings: false });

  return useMemo(() => {
    if (arrivals === null) return null;
    const today = todayIso();
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    const profile = opts.moment ? buildProfile(opts.moment, entries, libraryTitles) : buildLikedProfile(entries, libraryTitles);
    const items = arrivals
      .map((arrival) => ({ arrival, title: titles[`${arrival.type}:${arrival.tmdbId}`] }))
      .filter((x): x is ArrivalItem => Boolean(x.title) && watchStatus(x.title, byKey[x.title.key], today) !== 'vista');
    const score = (x: ArrivalItem) => profileAffinity(profile, x.title, byKey[x.title.key]?.tagIds ?? []);
    return items.sort((a, b) => score(b) - score(a) || b.arrival.firstSeen - a.arrival.firstSeen).slice(0, opts.max);
  }, [arrivals, entries, titles, libraryTitles, opts.moment, opts.max]);
}

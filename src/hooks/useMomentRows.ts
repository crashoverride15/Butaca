import { useEffect, useState } from 'react';
import { DETAIL_VERSION, getTitle } from '../api/tmdb';
import { buildKindProfile, rankByTaste } from '../logic/featured';
import { estimateMoment, MOMENT_IDS, MOMENT_LABELS, type LabelledSeries, type MomentId } from '../logic/seriesMoment';
import { todayIso, watchStatus } from '../logic/status';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { getTitleCached } from '../store/titles';
import type { Title } from '../store/types';
import { tasteCandidates } from './useFeatured';

// The three rows of Inicio → Series (D39): new series on my platforms, by what suits each moment.

const PER_ROW = 20;
const CANDIDATE_LOADS = 90;

export interface MomentRowItem {
  title: Title;
  /** why it is here: the favourite it follows from */
  note: string;
}
export interface MomentRow {
  id: MomentId;
  label: string;
  items: MomentRowItem[];
}

/** A title with all the detail D39 added: cache if it has it, else fetched again (the old copy if the network fails). */
async function enriched(key: string, type: 'tv', tmdbId: number): Promise<Title | undefined> {
  const cached = await getTitleCached(key);
  if (cached?.detailVersion === DETAIL_VERSION) return cached;
  return getTitle(type, tmdbId).catch(() => cached);
}

export function useMomentRows(): MomentRow[] | null {
  const { settings } = useSettings();
  const [rows, setRows] = useState<MomentRow[] | null>(null);
  const platformKey = settings.platforms.map((p) => p.id).join(',');

  useEffect(() => {
    let alive = true;
    setRows(null);
    void (async () => {
      try {
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

        // my series with a moment: they teach what each moment looks like
        const labelled: LabelledSeries[] = [];
        await Promise.all(
          entries
            .filter((e) => e.type === 'tv' && e.tagIds.some((t) => (MOMENT_IDS as readonly string[]).includes(t)))
            .map(async (e) => {
              const t = await enriched(e.key, 'tv', Number(e.key.split(':')[1]));
              if (t) labelled.push({ title: t, moments: e.tagIds.filter((id) => id.startsWith('momento:')) });
            }),
        );

        const profile = buildKindProfile('tv', entries, titles);
        if (profile.refs.length === 0 || settings.platforms.length === 0) {
          if (alive) setRows([]);
          return;
        }
        const discovered = await tasteCandidates('tv', profile, entries, settings.platforms, CANDIDATE_LOADS);
        const result = rankByTaste({ mine: settings.platforms, kind: 'tv', entries, titles, seen, discovered });
        const buckets = new Map<MomentId, MomentRowItem[]>(MOMENT_IDS.map((m) => [m, []]));
        for (const c of result?.ranked ?? []) {
          const { moment } = estimateMoment(c.title, labelled);
          const bucket = moment ? buckets.get(moment) : undefined;
          if (!bucket || bucket.length >= PER_ROW) continue;
          const mark = c.source ? result?.scores[c.source.title.key] : null;
          bucket.push({ title: c.title, note: c.source ? `Como ${c.source.title.title}${mark ? ` · ${mark}` : ''}` : 'Encaja con tus gustos' });
        }
        if (alive) setRows(MOMENT_IDS.map((id) => ({ id, label: MOMENT_LABELS[id], items: buckets.get(id) ?? [] })));
      } catch (e) {
        console.warn('[butaca] the moment rows could not load', e);
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [platformKey, settings.platforms]);

  return rows;
}

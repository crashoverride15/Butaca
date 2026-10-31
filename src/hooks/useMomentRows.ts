import { useEffect, useState } from 'react';
import { DETAIL_VERSION, getTitle, withEpisodes } from '../api/tmdb';
import { buildKindProfile, rankByTaste } from '../logic/featured';
import { estimateMoment, MOMENT_IDS, MOMENT_LABELS, type LabelledSeries, type MomentId } from '../logic/seriesMoment';
import { todayIso, watchStatus } from '../logic/status';
import { getAllEntries } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { getTitleCached } from '../store/titles';
import type { LibraryEntry, Title } from '../store/types';
import { tasteCandidates, withRatings } from './useFeatured';

// The three rows of Inicio → Series (D39): new series on my platforms, by what suits each moment.

const PER_ROW = 20;
const CANDIDATE_LOADS = 90;
/** the best this many candidates get their episodes read to place them in a row */
const STORY_READS = 90;

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
  const t = cached?.detailVersion === DETAIL_VERSION ? cached : await getTitle(type, tmdbId).catch(() => cached);
  return t && withEpisodes(t);
}

/** My series with a moment: they teach what each moment looks like. */
export async function loadLabelled(entries: LibraryEntry[]): Promise<LabelledSeries[]> {
  const labelled: LabelledSeries[] = [];
  await Promise.all(
    entries
      .filter((e) => e.type === 'tv' && e.tagIds.some((t) => (MOMENT_IDS as readonly string[]).includes(t)))
      .map(async (e) => {
        const t = await enriched(e.key, 'tv', Number(e.key.split(':')[1]));
        if (t) labelled.push({ title: t, moments: e.tagIds.filter((id) => id.startsWith('momento:')) });
      }),
  );
  return labelled;
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

        const labelled = await loadLabelled(entries);

        const profile = buildKindProfile('tv', entries, titles);
        if (profile.refs.length === 0 || settings.platforms.length === 0) {
          if (alive) setRows([]);
          return;
        }
        const discovered = await tasteCandidates('tv', profile, entries, settings.platforms, CANDIDATE_LOADS);
        const input = await withRatings({ mine: settings.platforms, kind: 'tv', entries, titles, seen, discovered }, STORY_READS);
        const result = rankByTaste(input);
        const buckets = new Map<MomentId, MomentRowItem[]>(MOMENT_IDS.map((m) => [m, []]));
        // how their episodes tell the story (D42): read once per series, then kept
        const ranked = (result?.ranked ?? []).slice(0, STORY_READS);
        const told = await Promise.all(ranked.map((c) => withEpisodes(c.title)));
        for (const [i, c] of ranked.entries()) {
          const { moment } = estimateMoment(told[i], labelled);
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

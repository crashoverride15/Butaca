import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { ListRow } from '../components/ListRow';
import { ScoreSheet } from '../components/ScoreSheet';
import { Sheet } from '../components/Sheet';
import { SwipeRow } from '../components/SwipeRow';
import { useTitles } from '../hooks/useTitles';
import { momentsOf, seriesToClassify } from '../logic/classify';
import { buildRows, countByTab, filterRows, SORT_LABEL, SORT_ORDER, sortRows, type ListTab, type SortKey } from '../logic/list';
import { platformLabel } from '../logic/platform';
import { todayIso } from '../logic/status';
import { getAllEntries, saveEntry } from '../store/library';
import { useSettings } from '../store/SettingsContext';
import { listTags } from '../store/tags';
import type { LibraryEntry, MediaType, Tag } from '../store/types';
import './MiLista.css';

// My list — spec §9.4.

const TABS: { tab: ListTab; label: string }[] = [
  { tab: 'en_curso', label: 'En curso' },
  { tab: 'por_ver', label: 'Por ver' },
  { tab: 'vista', label: 'Vistas' },
];

const EMPTY = 'Aún no has marcado nada. Busca un título en Explorar.';

export function MiLista() {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const location = useLocation();
  const [tab, setTab] = useState<ListTab | null>(() => (location.state as { tab?: ListTab } | null)?.tab ?? null);
  const [types, setTypes] = useState<MediaType[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('nota');
  const [sheet, setSheet] = useState<'tags' | null>(null);
  const [scoring, setScoring] = useState<LibraryEntry | null>(null);

  const reload = () => void getAllEntries().then(setEntries);
  useEffect(() => {
    reload();
    void listTags().then(setTags);
  }, []);

  const keys = useMemo(() => (entries ?? []).map((e) => e.key), [entries]);
  const titles = useTitles(keys);
  const today = todayIso();
  const rows = useMemo(() => buildRows(entries ?? [], titles, today), [entries, titles, today]);
  const counts = countByTab(rows);
  const activeTab: ListTab = tab ?? (counts.en_curso > 0 ? 'en_curso' : 'vista');
  const shown = sortRows(filterRows(rows, activeTab, { types, tagIds }), sort);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name;
  const filterTags = tags.filter((t) => t.group === 'momento' || t.group === 'estilo' || t.group === 'libre');

  const toClassify = seriesToClassify(entries ?? []);
  const unclassified = toClassify.length === 0 ? null : toClassify.filter((e) => momentsOf(e).length === 0).length;

  const loading = entries === null || (keys.length > 0 && rows.length === 0 && Object.keys(titles).length === 0);

  return (
    <main className="screen screen--tight">
      <h1 className="t-screen ellipsis">Mi lista</h1>

      <div className="stat-tabs" role="tablist" aria-label="Estado">
        {TABS.map(({ tab: t, label }) => (
          <button key={t} type="button" role="tab" aria-selected={activeTab === t} className={'stat-tab pressable' + (activeTab === t ? ' is-active' : '')} onClick={() => setTab(t)}>
            <span className="stat-tab__n">{counts[t]}</span>
            <span className="stat-tab__label ellipsis">{label}</span>
          </button>
        ))}
      </div>

      {unclassified !== null && (
        <Link to="/clasificar" className="classify-link pressable">
          <span className="classify-link__text">
            <span className="classify-link__title ellipsis">Clasificar series</span>
            <span className="classify-link__sub ellipsis">{unclassified > 0 ? `${unclassified} sin momento` : 'Todas con momento'}</span>
          </span>
          <span className="classify-link__go" aria-hidden="true">›</span>
        </Link>
      )}

      <div className="list-filters">
        <div className="list-filters__chips">
          <Chip selected={types.includes('movie')} onClick={() => setTypes(toggle(types, 'movie'))}>Películas</Chip>
          <Chip selected={types.includes('tv')} onClick={() => setTypes(toggle(types, 'tv'))}>Series</Chip>
          {filterTags.map((t) => (
            <Chip key={t.id} selected={tagIds.includes(t.id)} onClick={() => setTagIds(toggle(tagIds, t.id))}>{t.name}</Chip>
          ))}
          <Chip add onClick={() => setSheet('tags')}>+ tag</Chip>
        </div>
        <button type="button" className="sort-btn pressable" onClick={() => setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length])} aria-label={`Ordenar por ${SORT_LABEL[sort]}`}>
          <Icon name="sort" size={14} />
          <span className="nowrap">{SORT_LABEL[sort]}</span>
        </button>
      </div>

      {loading ? (
        <div className="list-rows">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 98 }} />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="screen-empty">{rows.length === 0 ? EMPTY : 'Nada con estos filtros.'}</p>
      ) : (
        <div className="list-rows">
          {shown.map((row) => {
            const el = (
              <ListRow
                row={row}
                platform={platformLabel(row.title, settings.platforms)}
                tagNames={row.entry.tagIds.map(tagName).filter((n): n is string => Boolean(n))}
                showProgress={activeTab === 'en_curso'}
              />
            );
            return activeTab === 'vista' ? (
              <SwipeRow key={row.entry.key} actionLabel="Puntuar" onAction={() => setScoring(row.entry)}>{el}</SwipeRow>
            ) : (
              <div key={row.entry.key}>{el}</div>
            );
          })}
        </div>
      )}

      {sheet === 'tags' && (
        <Sheet title="Filtrar por tags" onClose={() => setSheet(null)} action="Hecho">
          <div className="list-tagpick">
            {tags.map((t) => (
              <Chip key={t.id} selected={tagIds.includes(t.id)} onClick={() => setTagIds(toggle(tagIds, t.id))}>{t.name}</Chip>
            ))}
          </div>
        </Sheet>
      )}
      {scoring && (
        <ScoreSheet
          score={scoring.myScore}
          onClose={() => setScoring(null)}
          onPick={async (score) => {
            await saveEntry({ ...scoring, myScore: score });
            reload();
          }}
        />
      )}
    </main>
  );
}

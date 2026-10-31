import { useState } from 'react';
import { platformColor, shortPlatformName } from '../../api/tmdb';
import { Chip } from '../../components/Chip';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { formatImdb } from '../../logic/format';
import { activeCount, EPOCHS, type ExploreFilters } from '../../logic/explore';
import type { Provider, Tag } from '../../store/types';

// Filters panel — spec §9.3 (item 3).

interface FiltersPanelProps {
  filters: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  mine: Provider[];
  tags: Tag[];
}

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FiltersPanel({ filters, onChange, mine, tags }: FiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const set = (patch: Partial<ExploreFilters>) => onChange({ ...filters, ...patch });
  const n = activeCount(filters);

  const selectedPlatforms = filters.platformIds ?? mine.map((p) => p.id);
  const togglePlatform = (id: number) => {
    const next = toggle(selectedPlatforms, id);
    set({ platformIds: next.length === mine.length || next.length === 0 ? null : next });
  };

  const quick = tags.filter((t) => t.group === 'momento' || t.group === 'estilo');

  return (
    <section className="filters" aria-label="Filtros">
      <button type="button" className="filters__head pressable" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="t-section ellipsis">{n > 0 ? `Filtros · ${n} ${n === 1 ? 'activo' : 'activos'}` : 'Filtros'}</span>
        <span style={{ transform: `rotate(${open ? 90 : -90}deg)`, display: 'flex' }}><Icon name="back" size={18} /></span>
      </button>

      {open && (
        <>
          <div className="filters__type">
            {(['movie', 'tv'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={filters.type === t} className={'filters__type-btn pressable' + (filters.type === t ? ' is-selected' : '')} onClick={() => set({ type: t })}>
                {t === 'movie' ? 'Películas' : 'Series'}
              </button>
            ))}
          </div>

          <div className="filters__group">
            <h3 className="t-eyebrow">PLATAFORMA</h3>
            <div className="filters__platforms">
              {mine.length === 0 && <p className="filters__hint">Elige tus plataformas en Ajustes.</p>}
              {mine.map((p) => {
                const on = selectedPlatforms.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} className={'platform-btn pressable' + (on ? ' is-on' : '')} onClick={() => togglePlatform(p.id)}>
                    <span className="platform-btn__dot" style={{ background: platformColor(p.name) }} />
                    <span className="ellipsis">{shortPlatformName(p.name)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filters__group">
            <h3 className="t-eyebrow">ÉPOCA</h3>
            <div className="filters__epochs">
              {EPOCHS.map((e) => (
                <button key={e} type="button" aria-pressed={filters.epochs.includes(e)} className={'epoch-btn pressable' + (filters.epochs.includes(e) ? ' is-selected' : '')} onClick={() => set({ epochs: toggle([...filters.epochs], e) })}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="filters__group">
            <h3 className="t-eyebrow">TAGS</h3>
            <div className="filters__chips">
              {quick.map((t) => (
                <Chip key={t.id} selected={filters.tagIds.includes(t.id)} onClick={() => set({ tagIds: toggle(filters.tagIds, t.id) })}>{t.name}</Chip>
              ))}
              <Chip add onClick={() => setSheet(true)}>+ tag</Chip>
            </div>
          </div>

          <div className="filters__group">
            <div className="filters__row">
              <h3 className="t-eyebrow">NOTA IMDB MÍNIMA</h3>
              <span className="filters__imdb"><Icon name="star" size={13} color="var(--gold)" />{formatImdb(filters.minImdb)}</span>
            </div>
            <label className="visually-hidden" htmlFor="min-imdb">Nota IMDb mínima</label>
            <input id="min-imdb" className="filters__range" type="range" min={5} max={9} step={0.1} value={filters.minImdb} onChange={(e) => set({ minImdb: Number(e.target.value) })} />
          </div>

          <hr className="filters__rule" />
          <label className="filters__check">
            <span className="ellipsis">Ocultar lo que ya he visto</span>
            <input type="checkbox" checked={filters.hideSeen} onChange={(e) => set({ hideSeen: e.target.checked })} />
          </label>
        </>
      )}

      {sheet && (
        <Sheet title="Tags" onClose={() => setSheet(false)} action="Hecho">
          <div className="filters__chips">
            {tags.map((t) => (
              <Chip key={t.id} selected={filters.tagIds.includes(t.id)} onClick={() => set({ tagIds: toggle(filters.tagIds, t.id) })}>{t.name}</Chip>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

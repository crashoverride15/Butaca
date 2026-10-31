import { useState } from 'react';
import type { Tag, TagGroup } from '../store/types';
import { Chip } from './Chip';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import './TagSheet.css';

// Tags of one title — spec §8.12: every tag by group; selected = assigned.

const GROUPS: { group: TagGroup; label: string }[] = [
  { group: 'momento', label: 'Momento' },
  { group: 'estilo', label: 'Estilo' },
  { group: 'origen', label: 'Origen' },
  { group: 'libre', label: 'Libres' },
];

type NewGroup = 'estilo' | 'libre' | 'momento';

interface TagSheetProps {
  titleName: string;
  tags: Tag[];
  assigned: string[];
  onToggle: (tagId: string) => void;
  onCreate: (name: string, group: NewGroup) => Promise<string | null>;
  onClose: () => void;
}

export function TagSheet({ titleName, tags, assigned, onToggle, onCreate, onClose }: TagSheetProps) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<NewGroup>('libre');
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet title={`Tags de ${titleName}`} onClose={onClose} action="Hecho">
      {GROUPS.map(({ group: g, label }) => {
        const inGroup = tags.filter((t) => t.group === g);
        if (inGroup.length === 0) return null;
        return (
          <div key={g} className="tag-sheet__group">
            <h3 className="t-eyebrow" style={{ color: 'var(--muted)' }}>{label}</h3>
            <div className="tag-sheet__chips">
              {inGroup.map((t) => (
                <Chip key={t.id} selected={assigned.includes(t.id)} onClick={() => onToggle(t.id)}>
                  {t.name}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
      <form
        className="tag-sheet__new"
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = await onCreate(name, group);
          setError(problem);
          if (!problem) setName('');
        }}
      >
        <h3 className="t-eyebrow" style={{ color: 'var(--muted)' }}>Nuevo tag</h3>
        <label className="visually-hidden" htmlFor="new-tag-name">Nombre del tag nuevo</label>
        <input id="new-tag-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo tag" />
        <Segmented
          label="Grupo del tag nuevo"
          value={group}
          onChange={setGroup}
          options={[
            { value: 'estilo', label: 'Estilo' },
            { value: 'libre', label: 'Libre' },
            { value: 'momento', label: 'Momento' },
          ]}
        />
        {error && <p className="field__error">{error}</p>}
        <button type="submit" className="btn-primary pressable" style={{ height: 44 }}>
          <span className="ellipsis">Crear</span>
        </button>
      </form>
    </Sheet>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { createTag, deleteTag, listTags, renameTag, tagCounts, type TagResult } from '../../store/tags';
import type { Tag, TagGroup } from '../../store/types';

// Tags — spec §9.6: per group, rows with name, title count, Renombrar and Borrar (inline confirmation).

const GROUPS: { group: TagGroup; label: string }[] = [
  { group: 'momento', label: 'Momento' },
  { group: 'estilo', label: 'Estilo' },
  { group: 'origen', label: 'Origen' },
  { group: 'libre', label: 'Libres' },
];

type Mode = { kind: 'rename'; id: string } | { kind: 'delete'; id: string } | { kind: 'new'; group: TagGroup } | null;

const failureText = (r: TagResult): string | null =>
  r.ok ? null : r.reason === 'duplicate' ? 'Ya existe un tag con ese nombre.' : 'Escribe un nombre.';

function NameForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="tag-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(await onSubmit(name));
      }}
    >
      <label className="visually-hidden" htmlFor="tag-name">
        Nombre del tag
      </label>
      <input id="tag-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="tag-form__actions">
        <button type="submit" className="tag-action tag-action--accent pressable">{submitLabel}</button>
        <button type="button" className="tag-action pressable" onClick={onCancel}>Cancelar</button>
      </div>
      {error && <p className="field__error">{error}</p>}
    </form>
  );
}

export function TagsSection() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>(null);

  const reload = useCallback(async () => {
    setTags(await listTags());
    setCounts(await tagCounts());
  }, []);
  useEffect(() => void reload(), [reload]);

  const finish = async (r: TagResult): Promise<string | null> => {
    const text = failureText(r);
    if (text) return text;
    setMode(null);
    await reload();
    return null;
  };

  return (
    <section className="block" aria-labelledby="tags-title">
      <h2 id="tags-title" className="t-section">Tags</h2>
      {GROUPS.map(({ group, label }) => (
        <div key={group} className="tag-group">
          <h3 className="t-eyebrow tag-group__title">{label}</h3>
          <ul className="tag-list">
            {tags.filter((t) => t.group === group).map((t) => {
              const count = counts[t.id] ?? 0;
              if (mode?.kind === 'rename' && mode.id === t.id) {
                return (
                  <li key={t.id} className="tag-row tag-row--stack">
                    <NameForm initial={t.name} submitLabel="Guardar" onCancel={() => setMode(null)} onSubmit={async (n) => finish(await renameTag(t.id, n))} />
                  </li>
                );
              }
              if (mode?.kind === 'delete' && mode.id === t.id) {
                return (
                  <li key={t.id} className="tag-row tag-row--stack">
                    <p className="tag-row__confirm">
                      ¿Borrar «{t.name}» de {count} {count === 1 ? 'título' : 'títulos'}?
                    </p>
                    <div className="tag-form__actions">
                      <button type="button" className="tag-action tag-action--danger pressable" onClick={async () => { await deleteTag(t.id); setMode(null); await reload(); }}>Borrar</button>
                      <button type="button" className="tag-action pressable" onClick={() => setMode(null)}>Cancelar</button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={t.id} className="tag-row">
                  <span className="tag-row__name ellipsis">{t.name}</span>
                  <span className="tag-row__count">{count}</span>
                  <button type="button" className="tag-action pressable" onClick={() => setMode({ kind: 'rename', id: t.id })}>Renombrar</button>
                  <button type="button" className="tag-action pressable" onClick={() => setMode({ kind: 'delete', id: t.id })}>Borrar</button>
                </li>
              );
            })}
            {mode?.kind === 'new' && mode.group === group && (
              <li className="tag-row tag-row--stack">
                <NameForm initial="" submitLabel="Crear" onCancel={() => setMode(null)} onSubmit={async (n) => finish(await createTag(n, group))} />
              </li>
            )}
          </ul>
          <button type="button" className="chip-add pressable" onClick={() => setMode({ kind: 'new', group })}>
            + Nuevo tag
          </button>
        </div>
      ))}
    </section>
  );
}

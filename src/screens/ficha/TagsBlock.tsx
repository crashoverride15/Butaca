import { useMemo } from 'react';
import { Chip } from '../../components/Chip';
import { autoTags, withoutShown } from '../../logic/autotags';
import type { Tag, TagGroup, Title } from '../../store/types';
import { useLongPress } from './useLongPress';

// Tags of a title, by group — spec §9.2 (5.4). Manual tags are stored; époque, origin and genres are computed.

const ROWS: { key: 'momento' | 'estilo' | 'epoca' | 'origen' | 'libre'; label: string }[] = [
  { key: 'momento', label: 'MOMENTO' },
  { key: 'estilo', label: 'ESTILO' },
  { key: 'epoca', label: 'ÉPOCA' },
  { key: 'origen', label: 'ORIGEN' },
  { key: 'libre', label: 'LIBRES' },
];

function ManualChip({ tag, onOpen }: { tag: Tag; onOpen: () => void }) {
  // A long press opens the sheet, where tapping an assigned tag removes it (spec 8.2).
  const press = useLongPress(onOpen);
  return (
    <Chip selected={tag.group === 'momento'} onClick={() => !press.consumed() && onOpen()} onPointerDown={press.start} onPointerUp={press.cancel}>
      {tag.name}
    </Chip>
  );
}

interface TagsBlockProps {
  title: Title;
  allTags: Tag[];
  assigned: string[];
  onOpenSheet: () => void;
}

export function TagsBlock({ title, allTags, assigned, onOpenSheet }: TagsBlockProps) {
  const manual = useMemo(() => allTags.filter((t) => assigned.includes(t.id)), [allTags, assigned]);
  const byGroup = (g: TagGroup) => manual.filter((t) => t.group === g);
  const auto = useMemo(() => autoTags(title), [title]);

  const autoStyles = withoutShown(auto.estilo, byGroup('estilo').map((t) => t.name));
  const autoOrigins = withoutShown(auto.origen, byGroup('origen').map((t) => t.name));

  const rows = ROWS.map((row) => {
    const chips: JSX.Element[] = [];
    if (row.key === 'epoca') {
      if (auto.epoca) chips.push(<Chip key="epoca">{auto.epoca}</Chip>);
      autoOrigins.forEach((o) => chips.push(<Chip key={`o-${o}`}>{o}</Chip>));
    } else {
      byGroup(row.key).forEach((t) => chips.push(<ManualChip key={t.id} tag={t} onOpen={onOpenSheet} />));
      if (row.key === 'estilo') autoStyles.forEach((s) => chips.push(<Chip key={`s-${s}`}>{s}</Chip>));
      if (row.key === 'momento' && chips.length === 0) {
        chips.push(<Chip key="add" add onClick={onOpenSheet}>+ momento</Chip>);
      }
    }
    return { ...row, chips };
  }).filter((r) => r.chips.length > 0);

  return (
    <div className="ficha__tag-rows">
      {rows.map((r) => (
        <div key={r.key} className="ficha__tag-row">
          <span className="ficha__tag-label t-eyebrow">{r.label}</span>
          <div className="ficha__chips">{r.chips}</div>
        </div>
      ))}
    </div>
  );
}

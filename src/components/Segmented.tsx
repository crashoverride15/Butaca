import './Segmented.css';

// Segmented control — spec §8.3.

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className={'segmented__item pressable' + (o.value === value ? ' is-selected' : '')}
          onClick={() => onChange(o.value)}
        >
          <span className="ellipsis">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

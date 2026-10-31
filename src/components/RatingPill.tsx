import { formatImdb } from '../logic/format';
import './RatingPill.css';

// Rating over images — spec §8.5.

export function ImdbPill({ value }: { value: number | null }) {
  if (value === null) return null;
  return <span className="rating-pill">★ {formatImdb(value)}</span>;
}

export function RtPill({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className="rating-pill">
      <span className="rating-pill__dot" aria-hidden="true" />
      {value}%
    </span>
  );
}

import { formatImdb, formatRt } from '../logic/format';
import { Icon } from './Icon';
import './RatingStrip.css';

// IMDb | Rotten Tomatoes | Tu nota — spec §8.6. A missing value shows "–", never disappears.

interface RatingStripProps {
  imdb: number | null;
  rt: number | null;
  myScore: number | null;
  onScore: () => void;
}

export function RatingStrip({ imdb, rt, myScore, onScore }: RatingStripProps) {
  return (
    <div className="rating-strip">
      <div className="rating-strip__cell">
        <span className="rating-strip__value">
          <Icon name="star" size={16} color="var(--gold)" />
          {formatImdb(imdb)}
        </span>
        <span className="rating-strip__label">IMDb</span>
      </div>
      <div className="rating-strip__cell">
        <span className="rating-strip__value">
          <span className="rating-strip__dot" aria-hidden="true" />
          {formatRt(rt)}
        </span>
        <span className="rating-strip__label ellipsis">Rotten Tomatoes</span>
      </div>
      <button type="button" className="rating-strip__cell rating-strip__mine pressable" onClick={onScore}>
        <span className="rating-strip__value" style={{ color: myScore === null ? 'var(--muted)' : 'var(--accent-text)' }}>
          {myScore !== null && <Icon name="heart" size={16} color="var(--accent-text)" />}
          {myScore ?? '–'}
        </span>
        <span className="rating-strip__label">{myScore === null ? 'Puntuar' : 'Tu nota'}</span>
      </button>
    </div>
  );
}

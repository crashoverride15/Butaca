import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { ImdbPill } from './RatingPill';
import type { TitleCard } from '../store/types';
import './PosterTile.css';

// Poster tile for carousels and the grid — spec §8.7.

interface PosterTileProps {
  card: TitleCard;
  imdb?: number | null;
  isNew?: boolean;
  seen?: boolean;
  line1: ReactNode;
  line2: ReactNode;
  /** fixed width (carousel); omit to fill the grid column */
  width?: number;
  onVisible?: (el: HTMLElement) => void;
}

export function PosterTile({ card, imdb = null, isNew = false, seen = false, line1, line2, width }: PosterTileProps) {
  return (
    <Link
      to={`/titulo/${card.type}/${card.tmdbId}`}
      className={'tile pressable' + (width ? ' tile--fixed' : '')}
      style={width ? { width } : undefined}
      data-key={card.key}
    >
      <div className={'tile__poster' + (width ? ' tile__poster--fixed' : '')}>
        <Artwork id={card.tmdbId} title={card.title} path={card.posterPath} kind="poster" className="tile__art" />
        <span className="tile__imdb"><ImdbPill value={imdb} /></span>
        {isNew && <span className="tile__new">NUEVA</span>}
        {seen && (
          <span className="tile__seen" aria-label="Vista">
            <Icon name="check" size={14} color="#fff" />
          </span>
        )}
      </div>
      <span className="tile__line1 ellipsis">{line1}</span>
      <span className="tile__line2 ellipsis">{line2}</span>
    </Link>
  );
}

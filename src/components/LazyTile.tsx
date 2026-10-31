import { useEffect, useState } from 'react';
import { ensureRatings } from '../api/omdb';
import { getTitle } from '../api/tmdb';
import { useVisible } from '../hooks/useVisible';
import { platformLabel } from '../logic/platform';
import type { Provider, Title, TitleCard } from '../store/types';
import { PosterTile } from './PosterTile';

// A tile that asks for its detail and ratings only when it comes near the screen (spec §6.2).

interface LazyTileProps {
  card: TitleCard;
  mine: Provider[];
  genreNames: Record<number, string>;
  seen?: boolean;
  isNew?: boolean;
  /** hide the tile when IMDb is known and below this (spec §9.3) */
  minImdb?: number;
  width?: number;
  /** override the two caption lines */
  captions?: (title: Title | null) => [string, string];
}

export function LazyTile({ card, mine, genreNames, seen, isNew, minImdb, width, captions }: LazyTileProps) {
  const [ref, visible] = useVisible<HTMLDivElement>();
  const [title, setTitle] = useState<Title | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getTitle(card.type, card.tmdbId)
      .then((t) => {
        if (alive) setTitle(t);
        return ensureRatings(t);
      })
      .then((t) => alive && setTitle(t))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visible, card.key, card.type, card.tmdbId]);

  const imdb = title?.ratings.imdb ?? null;
  if (minImdb !== undefined && imdb !== null && imdb < minImdb) return null;

  const [line1, line2] = captions
    ? captions(title)
    : [
        [card.year, genreNames[card.genreIds[0]]].filter(Boolean).join(' · '),
        title ? (platformLabel(title, mine) ?? '') : '',
      ];

  return (
    <div ref={ref} className={width ? 'tile-wrap tile-wrap--fixed' : 'tile-wrap'} style={width ? { width } : undefined}>
      <PosterTile card={card} imdb={imdb} seen={seen} isNew={isNew} line1={line1} line2={line2 || ' '} width={width} />
    </div>
  );
}

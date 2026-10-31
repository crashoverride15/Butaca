import { Link } from 'react-router-dom';
import { formatEpisode, formatImdb } from '../logic/format';
import type { ListRowData } from '../logic/list';
import { Artwork } from './Artwork';
import { ChipsLine } from './ChipsLine';
import { Icon } from './Icon';
import './ListRow.css';

// Row of "Mi lista" — spec §8.10.

interface ListRowProps {
  row: ListRowData;
  platform: string | null;
  tagNames: string[];
  showProgress: boolean;
}

export function ListRow({ row, platform, tagNames, showProgress }: ListRowProps) {
  const { title, entry, next, progress } = row;
  const meta = [title.year, title.type === 'tv' ? 'Serie' : 'Película', platform].filter(Boolean).join(' · ');
  return (
    <Link to={`/titulo/${title.type}/${title.tmdbId}`} className="list-row pressable">
      <Artwork id={title.tmdbId} title={title.title} path={title.posterPath} kind="poster" className="list-row__poster" />
      <div className="list-row__main">
        <span className="list-row__title ellipsis">{title.title}</span>
        <span className="list-row__meta ellipsis">{meta}</span>
        {showProgress && next ? (
          <div className="list-row__next">
            <span className="ellipsis">Siguiente: {formatEpisode(next.season, next.episode)}</span>
            <span className="list-row__bar" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </div>
        ) : (
          <ChipsLine labels={tagNames} />
        )}
      </div>
      <div className="list-row__scores">
        <span className="list-row__mine" style={{ color: entry.myScore === null ? 'var(--muted)' : 'var(--accent-text)' }}>
          {entry.myScore !== null && <Icon name="heart" size={12} color="var(--accent-text)" />}
          {entry.myScore ?? '–'}
        </span>
        <span className="list-row__imdb">
          <Icon name="star" size={11} color="var(--gold)" />
          {formatImdb(title.ratings.imdb)}
        </span>
      </div>
    </Link>
  );
}

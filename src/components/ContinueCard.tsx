import { Link } from 'react-router-dom';
import { formatEpisode } from '../logic/format';
import type { Title } from '../store/types';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import './ContinueCard.css';

// "Sigue viendo" — spec §8.8.

interface ContinueCardProps {
  title: Title;
  next: { season: number; episode: number };
  platform: string | null;
  progress: number;
  onPlay: () => void;
}

export function ContinueCard({ title, next, platform, progress, onPlay }: ContinueCardProps) {
  return (
    <div className="continue">
      <Link to={`/titulo/tv/${title.tmdbId}`} className="continue__link pressable">
        <div className="continue__image">
          <Artwork id={title.tmdbId} title={title.title} path={title.backdropPath} kind="backdrop" className="continue__art" />
          <div className="continue__shade" />
        </div>
      </Link>
      <div className="continue__over">
        <span className="continue__title ellipsis">{title.title}</span>
        <button type="button" className="continue__play pressable" aria-label={`Marcar ${formatEpisode(next.season, next.episode)} como visto`} onClick={onPlay}>
          <Icon name="play" size={14} color="var(--bg)" />
        </button>
      </div>
      <div className="continue__row">
        <span className="continue__ep">{formatEpisode(next.season, next.episode)}</span>
        <span className="continue__platform ellipsis">{platform ?? ''}</span>
      </div>
      <div className="continue__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progreso">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

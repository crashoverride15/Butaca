import { Link } from 'react-router-dom';
import { formatDateShort, formatImdb } from '../logic/format';
import type { Alert, Title } from '../store/types';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import './AlertRows.css';

// Rows of the Avisos screen — spec §8.11.

const seasonLine = (a: Alert, platform: string | null): string => {
  if (a.kind === 'upcoming_season') return [`Temporada ${a.season}`, a.airDate ? formatDateShort(a.airDate) : null].filter(Boolean).join(' · ');
  return [`Temporada ${a.season}`, platform, a.episodeCount ? `${a.episodeCount} episodios` : null].filter(Boolean).join(' · ');
};

export function AlertHero({ alert, title, platform }: { alert: Alert; title: Title; platform: string | null }) {
  return (
    <Link to={`/titulo/tv/${title.tmdbId}`} className="alert-hero pressable">
      <Artwork id={title.tmdbId} title={title.title} path={title.backdropPath} kind="backdrop" ghost={`T${alert.season}`} className="alert-hero__art" />
      <div className="alert-hero__shade" />
      <div className="alert-hero__content">
        <span className="pill-state pill-state--on">Ya disponible</span>
        <div className="alert-hero__text">
          <span className="alert-hero__title ellipsis">{title.title}</span>
          <span className="alert-hero__sub ellipsis">{seasonLine(alert, platform)}</span>
        </div>
      </div>
    </Link>
  );
}

export function AlertRow({ alert, title, platform }: { alert: Alert; title: Title; platform: string | null }) {
  const available = alert.kind === 'new_season';
  return (
    <Link to={`/titulo/tv/${title.tmdbId}`} className="alert-row pressable">
      <Artwork id={title.tmdbId} title={title.title} path={title.backdropPath ?? title.posterPath} kind="backdrop" className="alert-row__thumb" />
      <div className="alert-row__text">
        <span className="alert-row__title">
          {!alert.read && <span className="alert-row__dot" aria-label="Sin leer" />}
          <span className="ellipsis">{title.title}</span>
        </span>
        <span className="alert-row__sub ellipsis">{seasonLine(alert, platform)}</span>
      </div>
      <span className={'pill-state' + (available ? ' pill-state--on' : '')}>{available ? 'Ya disponible' : 'Próximamente'}</span>
    </Link>
  );
}

export function NoveltyRow({ title, platform, when }: { title: Title; platform: string | null; when: string }) {
  return (
    <Link to={`/titulo/${title.type}/${title.tmdbId}`} className="alert-row pressable">
      <Artwork id={title.tmdbId} title={title.title} path={title.posterPath} kind="poster" className="alert-row__poster" />
      <div className="alert-row__text">
        <span className="alert-row__title"><span className="ellipsis">{title.title}</span></span>
        <span className="alert-row__sub ellipsis">{[platform, when].filter(Boolean).join(' · ')}</span>
      </div>
      <span className="alert-row__imdb">
        <Icon name="star" size={12} color="var(--gold)" />
        {formatImdb(title.ratings.imdb)}
      </span>
    </Link>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureRatings } from '../api/omdb';
import { shortPlatformName } from '../api/tmdb';
import { EYEBROW, type FeaturedItem, type Kind } from '../logic/featured';
import { platformLabel } from '../logic/platform';
import type { Provider, Title } from '../store/types';
import { Artwork } from './Artwork';
import { ImdbPill, RtPill } from './RatingPill';
import './HeroCard.css';

// Featured title — spec §8.9. Swipe between up to 5 candidates.

function Slide({ item, kind, mine }: { item: FeaturedItem; kind: Kind; mine: Provider[] }) {
  const [title, setTitle] = useState<Title>(item.title);
  useEffect(() => {
    let alive = true;
    void ensureRatings(item.title).then((t) => alive && setTitle(t));
    return () => {
      alive = false;
    };
  }, [item.title]);

  const platform = platformLabel(title, mine) ?? (title.providers[0] ? shortPlatformName(title.providers[0].name) : null);
  const meta = [title.year, title.type === 'tv' ? 'Serie' : 'Película', platform].filter(Boolean).join(' · ');
  return (
    <Link to={`/titulo/${title.type}/${title.tmdbId}`} className="hero__slide pressable">
      <Artwork id={title.tmdbId} title={title.title} path={title.backdropPath} kind="backdrop" ghost={title.title} className="hero__art" />
      <div className="hero__shade" />
      <span className="hero__pill ellipsis">{item.pill}</span>
      <div className="hero__body">
        <span className="hero__eyebrow">{EYEBROW[kind]}</span>
        <span className="hero__title">{title.title}</span>
        <div className="hero__row">
          <span className="hero__meta ellipsis">{meta}</span>
          <span className="hero__ratings">
            <ImdbPill value={title.ratings.imdb} />
            <RtPill value={title.ratings.rt} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function HeroCard({ items, kind, mine }: { items: FeaturedItem[]; kind: Kind; mine: Provider[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    track.current?.scrollTo({ left: 0 });
  }, [kind, items]);

  return (
    <div className="hero">
      <div
        className="hero__track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {items.map((it) => (
          <Slide key={it.title.key} item={it} kind={kind} mine={mine} />
        ))}
      </div>
      {items.length > 1 && (
        <div className="hero__dots" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.title.key} className={i === index ? 'is-on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

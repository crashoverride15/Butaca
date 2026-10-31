import { useState } from 'react';
import './Artwork.css';

// Poster or backdrop with the generated fallback art — spec §4.5.

const PALETTE: [string, string, string][] = [
  ['#22344A', '#5C7FA6', '#2E1E14'],
  ['#2E2140', '#8A5BB0', '#14303A'],
  ['#3A1E22', '#B0434B', '#1C2A3C'],
  ['#1D3340', '#4C9AB5', '#3A2A12'],
  ['#2E2A16', '#C2A23E', '#2A1A33'],
  ['#3A2614', '#D08A3A', '#132530'],
  ['#1F2A22', '#5E7A4E', '#3A1E14'],
  ['#2A1A30', '#7A4E9A', '#1A2C3A'],
];

export const artBackground = (id: number): string => {
  const [a, b, c] = PALETTE[Math.abs(id) % 8];
  return [
    `radial-gradient(110% 70% at 15% 0%, ${b} 0%, transparent 62%)`,
    `radial-gradient(90% 70% at 100% 100%, ${c} 0%, transparent 70%)`,
    `linear-gradient(165deg, ${a} 0%, #0B0D12 100%)`,
  ].join(', ');
};

interface ArtworkProps {
  id: number;
  title: string;
  path: string | null;
  kind: 'poster' | 'backdrop';
  /** large faint text in the top right when there is no image (backdrops) */
  ghost?: string;
  className?: string;
}

export function Artwork({ id, title, path, kind, ghost, className = '' }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const src = path && !failed ? `https://image.tmdb.org/t/p/${kind === 'poster' ? 'w342' : 'w780'}${path}` : null;
  return (
    <div className={`artwork artwork--${kind} ${className}`} style={{ background: artBackground(id) }}>
      {src ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : kind === 'backdrop' ? (
        ghost !== undefined && <span className="artwork__ghost">{ghost}</span>
      ) : (
        <span className="artwork__title">{title}</span>
      )}
    </div>
  );
}

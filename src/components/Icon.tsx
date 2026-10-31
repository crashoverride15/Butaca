// Inline SVG icons — spec §4.6. viewBox 24×24, 2px round stroke unless filled.

export type IconName =
  | 'home'
  | 'home-fill'
  | 'search'
  | 'bookmark'
  | 'bookmark-fill'
  | 'bell'
  | 'bell-fill'
  | 'moon'
  | 'calendar'
  | 'bed'
  | 'back'
  | 'check'
  | 'play'
  | 'star'
  | 'heart'
  | 'sort'
  | 'refresh';

const FILLED: ReadonlySet<IconName> = new Set(['play', 'star', 'heart']);

// Selected tab variants (like SF Symbols' .fill): filled and stroked so the size matches the outline.
const FILLED_AND_STROKED: ReadonlySet<IconName> = new Set(['home-fill', 'bookmark-fill', 'bell-fill']);

function shapes(name: IconName) {
  switch (name) {
    case 'home':
    case 'home-fill':
      return <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
    case 'bookmark-fill':
      return <path d="M6 3h12v18l-6-4-6 4z" />;
    case 'bell-fill':
      return <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />;
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </>
      );
    case 'bookmark':
      return <path d="M6 3h12v18l-6-4-6 4z" />;
    case 'bell':
      return <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />;
    case 'moon':
      return <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />;
    case 'calendar':
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </>
      );
    case 'bed':
      return <path d="M4 18h16M6 18v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M8 10V7M14 4h4l-4 4h4" />;
    case 'back':
      return <path d="M15 5l-7 7 7 7" strokeWidth={2.2} />;
    case 'check':
      return <path d="M5 12l5 5 9-10" />;
    case 'play':
      return <path d="M7 4v16l13-8z" />;
    case 'star':
      return <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" />;
    case 'heart':
      return <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />;
    case 'sort':
      return <path d="M4 7h16M7 12h10M10 17h4" />;
    case 'refresh':
      return <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />;
  }
}

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color = 'currentColor' }: IconProps) {
  const filled = FILLED.has(name);
  const both = FILLED_AND_STROKED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled || both ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none' }}
    >
      {shapes(name)}
    </svg>
  );
}

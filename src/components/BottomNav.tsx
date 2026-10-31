import { useEffect, useState } from 'react';
import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import './BottomNav.css';

// Floating tab bar. Same form as the system tab bar of the other apps:
// glass capsule, accent only on the active tab, Manrope Bold 11.5, collapses on scroll down (D29).

const ITEMS: { to: string; label: string; icon: IconName; activeIcon: IconName }[] = [
  { to: '/', label: 'Inicio', icon: 'home', activeIcon: 'home-fill' },
  { to: '/explorar', label: 'Explorar', icon: 'search', activeIcon: 'search' },
  { to: '/gustos', label: 'Gustos', icon: 'taste', activeIcon: 'taste-fill' },
  { to: '/lista', label: 'Mi lista', icon: 'bookmark', activeIcon: 'bookmark-fill' },
  { to: '/avisos', label: 'Avisos', icon: 'bell', activeIcon: 'bell-fill' },
];

// Distance from the bar to the physical bottom edge, like the system tab bar.
const EDGE_GAP = 21;
const MIN_GAP = 8;

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

// iOS 26+ home-screen web apps report a layout viewport shorter than the screen, as if
// Safari's toolbar were still there, so `bottom` lands too high. Anchor to the screen instead.
function useBottomOffset(): number | null {
  const [offset, setOffset] = useState<number | null>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!isStandalone()) return;
    const update = () => {
      const missing = Math.max(0, window.screen.height - window.innerHeight);
      // never below the layout viewport: anything fixed outside it is clipped
      setOffset(Math.max(MIN_GAP, EDGE_GAP - missing));
    };
    update();
    // iOS settles the viewport a moment after the app opens or a screen changes: measure again until it does (D36)
    const timers = [120, 400, 1000, 2500].map((ms) => window.setTimeout(update, ms));
    const onShow = () => document.visibilityState === 'visible' && update();
    window.addEventListener('resize', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', onShow);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('resize', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', onShow);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [pathname]);
  return offset;
}

function useCollapsedOnScroll(): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setCollapsed(false);
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 8 && y > 40) setCollapsed(true);
      else if (y < last - 8 || y <= 40) setCollapsed(false);
      if (Math.abs(y - last) > 8) last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);
  return collapsed;
}

interface BottomNavProps {
  hasUnreadAlerts?: boolean;
}

export function BottomNav({ hasUnreadAlerts = false }: BottomNavProps) {
  const bottomOffset = useBottomOffset();
  const { pathname } = useLocation();
  // Collapsed it shows only the active tab: with none active (a title page) it stays open.
  const hasActive = ITEMS.some((i) => matchPath({ path: i.to, end: true }, pathname));
  const collapsed = useCollapsedOnScroll() && hasActive;
  return (
    <nav
      className={'bottom-nav' + (collapsed ? ' is-collapsed' : '')}
      aria-label="Principal"
      style={bottomOffset === null ? undefined : { bottom: bottomOffset }}
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' is-active' : '')}
        >
          {({ isActive }) => (
            <>
              <Icon name={isActive ? item.activeIcon : item.icon} size={24} />
              <span className="bottom-nav__label">{item.label}</span>
              {item.to === '/avisos' && hasUnreadAlerts && (
                <span className="bottom-nav__dot">
                  <span className="visually-hidden">Avisos sin leer</span>
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

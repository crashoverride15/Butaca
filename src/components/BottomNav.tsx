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
  const { pathname } = useLocation();
  // Collapsed it shows only the active tab: with none active (a title page) it stays open.
  const hasActive = ITEMS.some((i) => matchPath({ path: i.to, end: true }, pathname));
  const collapsed = useCollapsedOnScroll() && hasActive;
  return (
    <nav
      className={'bottom-nav' + (collapsed ? ' is-collapsed' : '')}
      aria-label="Principal"
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

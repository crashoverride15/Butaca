import { useEffect, useState } from 'react';
import { ALERTS_EVENT, unreadCount } from '../store/alerts';

/** Number of unread alerts; follows changes through the store's event. */
export function useUnread(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => void unreadCount().then(setN).catch(() => undefined);
    load();
    window.addEventListener(ALERTS_EVENT, load);
    return () => window.removeEventListener(ALERTS_EVENT, load);
  }, []);
  return n;
}

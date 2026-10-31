import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { runRefresh } from '../logic/refresh';
import { useSettings } from '../store/SettingsContext';

// Runs the refresh when the app opens and when it comes back to the foreground (spec §7.5).

export type RefreshStatus = 'idle' | 'running' | 'done';

interface RefreshApi {
  status: RefreshStatus;
  /** ignores the 6 hours */
  refreshNow: () => void;
}

const RefreshContext = createContext<RefreshApi | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<RefreshStatus>('idle');
  const busy = useRef(false);
  const hasToken = settings.tmdbToken !== '';

  const run = useCallback(
    async (force: boolean) => {
      if (busy.current || !hasToken) return;
      busy.current = true;
      setStatus('running');
      try {
        const result = await runRefresh({ force });
        if (result.ran) await update({}); // reload the saved times into memory
      } catch (e) {
        console.warn('[butaca] refresh failed', e);
      } finally {
        busy.current = false;
        setStatus('done');
      }
    },
    [hasToken, update],
  );

  useEffect(() => {
    void run(false);
    const onVisible = () => document.visibilityState === 'visible' && void run(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [run]);

  const api = useMemo(() => ({ status, refreshNow: () => void run(true) }), [status, run]);
  return <RefreshContext.Provider value={api}>{children}</RefreshContext.Provider>;
}

export function useRefresh(): RefreshApi {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error('useRefresh outside RefreshProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ensureInitialTags } from './tags';
import { getSettings, saveSettings } from './settings';
import type { Settings } from './types';

// Loads settings once (and seeds the initial tags) and shares them with every screen.

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Omit<Settings, 'id'>>) => Promise<Settings>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ensureInitialTags()
      .then(getSettings)
      .then(setSettings)
      .catch((e) => {
        console.warn('[butaca] opening the database failed', e);
        setFailed(true);
      });
  }, []);

  const update = useCallback(async (patch: Partial<Omit<Settings, 'id'>>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const value = useMemo(() => (settings ? { settings, update } : null), [settings, update]);

  if (failed) {
    return (
      <main className="screen">
        <h1 className="t-screen">No se pueden guardar datos</h1>
        <p className="screen-empty">
          Safari no deja a Butaca guardar datos en este modo. Ábrela desde el icono de la pantalla de inicio, no desde
          una pestaña privada.
        </p>
      </main>
    );
  }
  if (!value) return null;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

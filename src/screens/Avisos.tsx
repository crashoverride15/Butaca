import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertHero, AlertRow, NoveltyRow } from '../components/AlertRows';
import { Icon } from '../components/Icon';
import { useArrivals } from '../hooks/useArrivals';
import { useRefresh } from '../hooks/useRefresh';
import { useTitles } from '../hooks/useTitles';
import { loadFilters, saveFilters } from '../logic/explore';
import { relativeArrival } from '../logic/novelties';
import { platformLabel } from '../logic/platform';
import { ALERTS_EVENT, listAlerts, markRead } from '../store/alerts';
import { useSettings } from '../store/SettingsContext';
import type { Alert } from '../store/types';
import './Avisos.css';

// Alerts — spec §9.5. They are marked read when the screen is left, so the dots can still be seen.

export function Avisos() {
  const { settings } = useSettings();
  const { status, refreshNow } = useRefresh();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const shown = useRef<string[]>([]);

  useEffect(() => {
    const load = () => void listAlerts().then(setAlerts);
    load();
    window.addEventListener(ALERTS_EVENT, load);
    return () => window.removeEventListener(ALERTS_EVENT, load);
  }, []);

  useEffect(() => {
    shown.current = (alerts ?? []).filter((a) => a.kind !== 'new_on_platform' && !a.read).map((a) => a.id);
  }, [alerts]);
  useEffect(() => () => void (shown.current.length > 0 && markRead(shown.current)), []);

  const seasonAlerts = useMemo(() => (alerts ?? []).filter((a) => a.kind !== 'new_on_platform'), [alerts]);
  const keys = useMemo(() => seasonAlerts.map((a) => a.key), [seasonAlerts]);
  const titles = useTitles(keys, { ratings: false });
  const arrivals = useArrivals({ days: 7, max: 10 });

  const rows = seasonAlerts.filter((a) => titles[a.key]);
  const hero = rows.find((a) => a.kind === 'new_season' && !a.read);
  const rest = rows.filter((a) => a !== hero);
  const now = Date.now();
  const empty = alerts !== null && rows.length === 0 && (arrivals?.length ?? 0) === 0;

  const seeAll = () => {
    saveFilters({ ...loadFilters(), order: 'nuevas' });
    navigate('/explorar');
  };

  return (
    <main className="screen">
      <header className="avisos__head">
        <h1 className="t-screen ellipsis">Avisos</h1>
        <button type="button" className="avisos__status pressable" onClick={refreshNow} aria-label="Actualizar ahora">
          <span className={status === 'running' ? 'spin' : ''} style={{ display: 'flex' }}><Icon name="refresh" size={13} /></span>
          <span className="ellipsis">{status === 'running' ? 'Actualizando…' : 'Actualizado al abrir'}</span>
        </button>
      </header>

      {empty && <p className="screen-empty">No hay novedades. Te avisaré aquí de nuevas temporadas.</p>}

      {!empty && (
        <section className="avisos__section" aria-labelledby="seasons-h">
          <h2 id="seasons-h" className="t-eyebrow avisos__eyebrow">Nuevas temporadas de lo que sigues</h2>
          {rows.length === 0 ? (
            <p className="avisos__none">Ninguna serie que sigues tiene temporada nueva.</p>
          ) : (
            <div className="avisos__rows">
              {hero && <AlertHero alert={hero} title={titles[hero.key]} platform={platformLabel(titles[hero.key], settings.platforms)} />}
              {rest.map((a) => (
                <AlertRow key={a.id} alert={a} title={titles[a.key]} platform={platformLabel(titles[a.key], settings.platforms)} />
              ))}
            </div>
          )}
        </section>
      )}

      {!empty && arrivals && arrivals.length > 0 && (
        <section className="avisos__section" aria-labelledby="new-h">
          <div className="avisos__sectionhead">
            <h2 id="new-h" className="t-eyebrow avisos__eyebrow ellipsis">Nuevo en tus plataformas · esta semana</h2>
            <button type="button" className="inicio__all" onClick={seeAll}>Ver todo</button>
          </div>
          <div className="avisos__rows avisos__rows--tight">
            {arrivals.map(({ arrival, title }) => (
              <NoveltyRow key={title.key} title={title} platform={platformLabel(title, settings.platforms)} when={relativeArrival(arrival.firstSeen, now)} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

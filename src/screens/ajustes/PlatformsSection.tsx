import { useEffect, useState } from 'react';
import { getProviderCatalogue, logoUrl, type CatalogueProvider } from '../../api/tmdb';
import { Switch } from '../../components/Switch';
import { useSettings } from '../../store/SettingsContext';

// My platforms — spec §9.6. The catalogue of Spain comes from TMDB; ids are never hard-coded.

const SEARCH_FROM = 12;

export function PlatformsSection({ reloadKey }: { reloadKey: number }) {
  const { settings, update } = useSettings();
  const [catalogue, setCatalogue] = useState<CatalogueProvider[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const hasToken = settings.tmdbToken !== '';

  useEffect(() => {
    if (!hasToken) return;
    let alive = true;
    setError(false);
    getProviderCatalogue()
      .then((list) => alive && setCatalogue(list))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [hasToken, reloadKey]);

  const selected = new Set(settings.platforms.map((p) => p.id));
  const toggle = (p: CatalogueProvider, on: boolean) => {
    const next = on
      ? [...settings.platforms, { id: p.id, name: p.name }]
      : settings.platforms.filter((x) => x.id !== p.id);
    void update({ platforms: next });
  };

  const visible = (catalogue ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className="block" aria-labelledby="platforms-title">
      <h2 id="platforms-title" className="t-section">
        Mis plataformas
      </h2>
      {!hasToken && <p className="screen-empty">Guarda el token de TMDB para ver las plataformas de España.</p>}
      {hasToken && error && !catalogue && <p className="screen-empty">No se han podido cargar las plataformas.</p>}
      {hasToken && !error && !catalogue && <div className="skeleton" style={{ height: 52 * 3 }} />}
      {catalogue && catalogue.length > SEARCH_FROM && (
        <div className="search-field">
          <label className="visually-hidden" htmlFor="platform-search">
            Buscar plataforma
          </label>
          <input
            id="platform-search"
            className="field__input"
            type="search"
            placeholder="Buscar plataforma"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {catalogue && (
        <ul className="platform-list">
          {visible.map((p) => {
            const logo = logoUrl(p.logoPath);
            return (
              <li key={p.id} className="platform-row">
                {logo ? <img src={logo} alt="" width={28} height={28} className="platform-row__logo" loading="lazy" /> : <span className="platform-row__logo" />}
                <span className="platform-row__name ellipsis">{p.name}</span>
                <Switch checked={selected.has(p.id)} onChange={(on) => toggle(p, on)} label={p.name} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

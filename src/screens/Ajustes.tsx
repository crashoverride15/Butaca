import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { useSettings } from '../store/SettingsContext';
import { needsSetup } from '../store/settings';
import { BackupSection } from './ajustes/BackupSection';
import { KeysSection } from './ajustes/KeysSection';
import { PlatformsSection } from './ajustes/PlatformsSection';
import { TagsSection } from './ajustes/TagsSection';
import './Ajustes.css';

// Settings — spec §9.6. First run: welcome text, keys, then platforms and "Empezar".

export function Ajustes() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  // Decided once, on entry: stays in first-run mode until "Empezar".
  const [firstRun] = useState(() => needsSetup(settings));
  const [connected, setConnected] = useState(!needsSetup(settings));
  const [reload, setReload] = useState(0);

  return (
    <main className="screen ajustes">
      {!firstRun && <BackButton />}
      {firstRun ? (
        <header className="ajustes__welcome">
          <h1 className="t-screen">Bienvenido a Butaca</h1>
          <p>Necesito dos claves gratuitas para buscar títulos y notas. Solo se guardan en este iPhone.</p>
        </header>
      ) : (
        <h1 className="t-screen ellipsis">Ajustes</h1>
      )}

      <KeysSection
        onTmdbConnected={() => {
          setConnected(true);
          setReload((n) => n + 1);
        }}
      />

      {connected && <PlatformsSection reloadKey={reload} />}

      {firstRun && connected && (
        <button type="button" className="btn-primary pressable" onClick={() => navigate('/', { replace: true })}>
          <span className="ellipsis">Empezar</span>
        </button>
      )}

      {!firstRun && <TagsSection />}

      {!firstRun && <BackupSection />}

      {!firstRun && (
        <footer className="ajustes__credits">
          <p>Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.</p>
          <p>Datos de plataformas: JustWatch, vía TMDB.</p>
          <p>Notas: OMDb API.</p>
        </footer>
      )}
    </main>
  );
}

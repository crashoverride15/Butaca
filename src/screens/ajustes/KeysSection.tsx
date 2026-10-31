import { useState } from 'react';
import { checkOmdbKey } from '../../api/omdb';
import { ApiError } from '../../api/errors';
import { checkTmdbToken, getProviderCatalogue, isDefaultPlatform } from '../../api/tmdb';
import { Icon } from '../../components/Icon';
import { useSettings } from '../../store/SettingsContext';

// API keys — spec §9.6. "Comprobar y guardar" tests each key against its API and saves the valid ones.

type Result = { ok: true } | { ok: false; message: string } | null;

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'No se ha podido comprobar. Prueba de nuevo.';

function KeyField(props: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  result: Result;
  okText: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="field__input-row">
        <input
          id={props.id}
          className="field__input"
          type={shown ? 'text' : 'password'}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="button" className="field__toggle pressable" onClick={() => setShown(!shown)}>
          {shown ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <p className="field__help ellipsis">{props.help}</p>
      {props.result?.ok === true && (
        <p className="field__ok ellipsis">
          <Icon name="check" size={16} color="var(--accent-light)" />
          <span className="ellipsis">{props.okText}</span>
        </p>
      )}
      {props.result?.ok === false && <p className="field__error">{props.result.message}</p>}
    </div>
  );
}

export function KeysSection({ onTmdbConnected }: { onTmdbConnected: () => void }) {
  const { settings, update } = useSettings();
  const [tmdb, setTmdb] = useState(settings.tmdbToken);
  const [omdb, setOmdb] = useState(settings.omdbKey);
  const [tmdbResult, setTmdbResult] = useState<Result>(null);
  const [omdbResult, setOmdbResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setTmdbResult(null);
    setOmdbResult(null);
    try {
      if (!tmdb.trim()) {
        setTmdbResult({ ok: false, message: 'Falta el token de TMDB.' });
      } else {
        try {
          await checkTmdbToken(tmdb);
          const firstTime = settings.platforms.length === 0;
          await update({ tmdbToken: tmdb.trim() });
          setTmdbResult({ ok: true });
          if (firstTime) {
            const catalogue = await getProviderCatalogue().catch(() => []);
            const defaults = catalogue.filter((p) => isDefaultPlatform(p.name)).map(({ id, name }) => ({ id, name }));
            if (defaults.length > 0) await update({ platforms: defaults });
          }
          onTmdbConnected();
        } catch (e) {
          setTmdbResult({ ok: false, message: messageOf(e) });
        }
      }
      if (omdb.trim()) {
        try {
          await checkOmdbKey(omdb);
          await update({ omdbKey: omdb.trim() });
          setOmdbResult({ ok: true });
        } catch (e) {
          setOmdbResult({ ok: false, message: messageOf(e) });
        }
      } else {
        setOmdbResult({ ok: false, message: 'Sin la clave de OMDb no habrá notas de IMDb ni Rotten Tomatoes.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="keys-title">
      <h2 id="keys-title" className="visually-hidden">
        Claves
      </h2>
      <KeyField
        id="tmdb-token"
        label="Token de lectura de TMDB"
        help="themoviedb.org › Ajustes › API › API Read Access Token"
        value={tmdb}
        onChange={setTmdb}
        result={tmdbResult}
        okText="TMDB conectado"
      />
      <KeyField
        id="omdb-key"
        label="Clave de OMDb"
        help="omdbapi.com › API Key (gratuita)"
        value={omdb}
        onChange={setOmdb}
        result={omdbResult}
        okText="OMDb conectado"
      />
      <button type="button" className="btn-primary pressable" onClick={save} disabled={busy}>
        <span className="ellipsis">{busy ? 'Comprobando…' : 'Comprobar y guardar'}</span>
      </button>
    </section>
  );
}

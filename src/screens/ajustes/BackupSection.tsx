import { useEffect, useRef, useState } from 'react';
import { backupReminder, buildBackup, deliverBackup, importBackup, parseBackup, type BackupFile } from '../../logic/backup';
import { getAllEntries } from '../../store/library';
import { useSettings } from '../../store/SettingsContext';

// Backup — spec §9.6 (5) and §7.6. The confirmation to import is inside the screen, not confirm().

export function BackupSection() {
  const { settings, update } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [hasData, setHasData] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);

  useEffect(() => void getAllEntries().then((e) => setHasData(e.length > 0)), []);

  const exportNow = async () => {
    setMessage(null);
    const how = await deliverBackup(await buildBackup());
    if (how !== 'cancelled') {
      await update({}); // reload the saved date
      setMessage({ text: how === 'shared' ? 'Copia lista.' : 'Copia descargada.', error: false });
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    const parsed = parseBackup(await file.text());
    if (parsed.ok) setPending(parsed.backup);
    else setMessage({ text: parsed.message, error: true });
    if (input.current) input.current.value = '';
  };

  const reminder = backupReminder(settings.lastBackupAt, hasData, Date.now());

  return (
    <section className="block" aria-labelledby="backup-title">
      <h2 id="backup-title" className="t-section">Copia de seguridad</h2>
      <button type="button" className="btn-secondary pressable" onClick={exportNow}><span className="ellipsis">Exportar copia</span></button>
      <button type="button" className="btn-secondary pressable" onClick={() => input.current?.click()}><span className="ellipsis">Importar copia</span></button>
      <label className="visually-hidden" htmlFor="backup-file">Archivo de copia</label>
      <input id="backup-file" ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => void pick(e.target.files?.[0])} />

      {pending && (
        <div className="card" role="alertdialog" aria-label="Confirmar importación">
          <p className="tag-row__confirm">
            Esto sustituirá tus datos actuales por la copia: {pending.library.length} {pending.library.length === 1 ? 'título' : 'títulos'} y {pending.tags.length} tags. Tus claves se quedan.
          </p>
          <div className="tag-form__actions">
            <button
              type="button"
              className="tag-action tag-action--danger pressable"
              onClick={async () => {
                await importBackup(pending);
                await update({});
                setPending(null);
                setHasData(pending.library.length > 0);
                setMessage({ text: 'Copia importada.', error: false });
              }}
            >
              Importar
            </button>
            <button type="button" className="tag-action pressable" onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {message && <p className={message.error ? 'field__error' : 'field__ok'}>{message.text}</p>}
      {reminder && <p className="backup__reminder">{reminder}</p>}
    </section>
  );
}

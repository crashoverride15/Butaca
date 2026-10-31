import { MOMENTS, defaultMoment, type Moment } from '../logic/featured';
import { Icon, type IconName } from './Icon';
import './MomentoSelector.css';

// Moment of the day — spec §8.4. Remembered in localStorage (`butaca.momento`).

const ICON: Record<Moment, IconName> = { Noche: 'moon', 'Entre semana': 'calendar', 'Para dormirme': 'bed' };
const KEY = 'butaca.momento';

export function loadMoment(now = new Date()): Moment {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (MOMENTS as string[]).includes(saved)) return saved as Moment;
  } catch {
    /* no storage: use the default */
  }
  return defaultMoment(now);
}

export function saveMoment(m: Moment): void {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* not remembered */
  }
}

export function MomentoSelector({ value, onChange }: { value: Moment; onChange: (m: Moment) => void }) {
  return (
    <div className="momento" role="group" aria-label="Momento">
      {MOMENTS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          className={'momento__btn pressable' + (value === m ? ' is-selected' : '')}
          onClick={() => {
            saveMoment(m);
            onChange(m);
          }}
        >
          <Icon name={ICON[m]} size={20} color={value === m ? 'var(--accent-light)' : 'currentColor'} />
          <span className="momento__label ellipsis">{m}</span>
        </button>
      ))}
    </div>
  );
}

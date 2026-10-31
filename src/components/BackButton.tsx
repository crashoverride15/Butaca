import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

// Round back button (spec §9.2, §9.6): history.back(), or Home when there is no history.

export function BackButton({ glass = false }: { glass?: boolean }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };
  return (
    <button
      type="button"
      className="pressable"
      aria-label="Volver"
      onClick={goBack}
      style={{
        width: 44,
        height: 44,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        background: glass ? 'var(--overlay-glass)' : 'var(--surface-2)',
        border: glass ? '1px solid rgba(255,255,255,0.12)' : 'none',
      }}
    >
      <Icon name="back" size={22} />
    </button>
  );
}

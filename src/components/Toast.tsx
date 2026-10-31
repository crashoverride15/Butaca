import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './Toast.css';

// Toast — spec §8.14. One at a time, 4 s (6 s with several actions).

export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastState {
  message: string;
  actions: ToastAction[];
}

interface ToastApi {
  show: (message: string, actions?: ToastAction[]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number>();

  const show = useCallback((message: string, actions: ToastAction[] = []) => {
    window.clearTimeout(timer.current);
    setToast({ message, actions });
    timer.current = window.setTimeout(() => setToast(null), actions.length > 1 ? 6000 : 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="toast__text ellipsis">{toast.message}</span>
          {toast.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="toast__action pressable"
              onClick={() => {
                window.clearTimeout(timer.current);
                setToast(null);
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

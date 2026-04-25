import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Sistema único de notificaciones tipo toast.
 *
 * Sustituye al showNotification() duplicado en cada HTML antiguo
 * de SERVER/pages/auth/. Cualquier componente puede llamar a
 * useNotification().notify(mensaje, tipo) para mostrar un toast.
 *
 * Tipos soportados: 'success' | 'error' | 'info'.
 * Estilo definido en styles/index.css con tokens del @theme.
 */

export const NotificationContext = createContext(null);

const TYPE_STYLES = {
  success: {
    box: 'bg-mint-400/15 border-mint-400/40 text-emerald-700',
    icon: 'fa-check-circle',
  },
  error: {
    box: 'bg-coral-400/15 border-coral-400/40 text-rose-700',
    icon: 'fa-exclamation-circle',
  },
  info: {
    box: 'bg-brand-400/15 border-brand-400/40 text-brand-700',
    icon: 'fa-info-circle',
  },
};

let nextId = 1;

export function NotificationProvider({ children, autoDismissMs = 3500 }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message, type = 'info') => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => dismiss(id), autoDismissMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [autoDismissMs, dismiss],
  );

  // Limpieza al desmontar para evitar leaks en HMR.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-5 right-5 z-[100] flex flex-col gap-3 pointer-events-none"
      >
        {items.map((n) => {
          const styles = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
          return (
            <div
              key={n.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-xl border backdrop-blur-md shadow-card min-w-[280px] max-w-sm animate-[var(--animate-slide-in-right)] ${styles.box}`}
            >
              <i className={`fas ${styles.icon} text-xl`} aria-hidden="true" />
              <span className="font-medium text-sm text-ink flex-1">{n.message}</span>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                className="text-ink-faint hover:text-ink transition-colors text-sm"
                aria-label="Cerrar notificación"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

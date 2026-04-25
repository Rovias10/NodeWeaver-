import { useContext } from 'react';
import { NotificationContext } from './NotificationProvider.jsx';

/**
 * Hook para emitir notificaciones desde cualquier componente.
 *
 * @returns {{
 *   notify: (message: string, type?: 'success'|'error'|'info') => number,
 *   dismiss: (id: number) => void,
 * }}
 */
export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification debe usarse dentro de <NotificationProvider>.');
  }
  return ctx;
}

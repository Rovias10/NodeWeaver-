import { relativeTime } from '@/utils/relativeTime.js';

/**
 * Badge que refleja el estado del auto-save.
 *
 * Estados (gestionados por useMapAutoSave):
 *   idle   → sin cambios pendientes.
 *   saving → petición en vuelo.
 *   saved  → último save OK; muestra "Guardado · hace 3s".
 *   error  → último save falló; muestra el mensaje de error.
 */
export function SaveIndicator({ status, lastSavedAt, lastError }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
        <span className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        Guardando…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-coral-500" title={lastError ?? ''}>
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        Error al guardar
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-emerald-700">
        <i className="fas fa-circle-check" aria-hidden="true" />
        Guardado
        {lastSavedAt && (
          <span className="text-ink-faint text-xs">· {relativeTime(lastSavedAt)}</span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-faint">
      <i className="fas fa-circle" aria-hidden="true" />
      Sin cambios
    </span>
  );
}

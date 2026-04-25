import { useEffect } from 'react';

/**
 * Atajos de teclado del editor de mapas.
 *
 * Atajos:
 *   · Delete / Backspace → borra el nodo seleccionado (si lo hay).
 *   · Ctrl+S / ⌘+S      → fuerza el save inmediato (bypass del debounce).
 *
 * Importante: ignoramos el evento cuando el foco está en un input,
 * textarea o elemento contenteditable. Sin ese guard, pulsar Delete
 * mientras editas el título o un label de nodo borraría el nodo
 * entero en lugar de un carácter.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled        Sólo escuchar cuando true.
 * @param {() => void} opts.onSaveNow   Callback para Ctrl+S.
 * @param {() => void} opts.onDeleteSel Callback para Delete.
 */
export function useEditorKeybindings({ enabled, onSaveNow, onDeleteSel }) {
  useEffect(() => {
    if (!enabled) return undefined;

    const isEditableTarget = (target) => {
      if (!target) return false;
      const tag = (target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const handler = (e) => {
      // Ctrl+S / Cmd+S → save manual.
      const isSave = (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S');
      if (isSave) {
        // Aunque el foco esté en un input, queremos guardar (no es destructivo).
        e.preventDefault();
        onSaveNow?.();
        return;
      }

      // Delete / Backspace → borrar nodo seleccionado.
      // Sólo si el foco NO está en un campo editable (caso contrario,
      // el usuario está escribiendo y borrar el nodo sería un desastre).
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditableTarget(e.target)) {
        onDeleteSel?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onSaveNow, onDeleteSel]);
}

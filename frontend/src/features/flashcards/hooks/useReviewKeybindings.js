import { useEffect } from 'react';

/**
 * Atajos de teclado de la sesión de repaso de flashcards.
 *
 * Atajos:
 *   · Espacio → revela la respuesta (sólo si aún no está revelada).
 *   · 1       → marca la tarjeta como Fallo (sólo tras revelar).
 *   · 2       → marca la tarjeta como Bien  (sólo tras revelar).
 *   · 3       → marca la tarjeta como Fácil (sólo tras revelar).
 *
 * Mismo patrón de guard que useEditorKeybindings: si el foco está en
 * un input/textarea/contenteditable, ignoramos el evento — el usuario
 * está escribiendo y no debería disparar atajos por accidente.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled    Sólo escuchar cuando true.
 * @param {boolean} opts.revealed   Si la tarjeta actual ya muestra la respuesta.
 * @param {() => void} opts.onReveal
 * @param {(grade: 'fail'|'good'|'easy') => void} opts.onGrade
 */
export function useReviewKeybindings({ enabled, revealed, onReveal, onGrade }) {
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
      if (isEditableTarget(e.target)) return;

      // Espacio → revelar (si aún no se ha revelado).
      if (e.key === ' ' || e.code === 'Space') {
        if (!revealed) {
          e.preventDefault();
          onReveal?.();
        }
        return;
      }

      // 1/2/3 sólo aplican tras revelar — antes no tienen sentido y
      // pulsarlas por accidente sería frustrante.
      if (!revealed) return;

      if (e.key === '1') { e.preventDefault(); onGrade?.('fail'); }
      else if (e.key === '2') { e.preventDefault(); onGrade?.('good'); }
      else if (e.key === '3') { e.preventDefault(); onGrade?.('easy'); }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, revealed, onReveal, onGrade]);
}

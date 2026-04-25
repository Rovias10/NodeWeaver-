import { useEffect, useState } from 'react';

/**
 * Hook reactivo que indica si el viewport supera un breakpoint dado.
 *
 * Implementación con window.matchMedia: gratis en CPU, sin listeners de
 * resize y respeta el zoom del navegador. Suscripción/desuscripción
 * correctamente limpiadas al desmontar para no fugar memoria.
 *
 * Uso:
 *   const isDesktop = useBreakpoint('(min-width: 1024px)');
 *
 * Por defecto comprueba el breakpoint 'lg' de Tailwind (>= 1024px),
 * que es donde la sidebar pasa a estar siempre visible.
 *
 * @param {string} query Media query CSS válida.
 * @returns {boolean}
 */
export function useBreakpoint(query = '(min-width: 1024px)') {
  // Evita el "flash" en el primer render si window existe.
  const getMatch = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false);

  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);

    // Sincroniza por si la query cambió desde el render inicial.
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

/**
 * Toolbar del feed comunidad: tabs Recientes/Populares + buscador
 * con debounce de 400 ms + acceso rápido a "Mis favoritos".
 *
 * Componente controlado: el estado real (sort y q efectivo) vive en
 * la página. Aquí mantenemos un buffer local del input para que el
 * usuario pueda teclear sin disparar una petición por cada tecla.
 *
 * Props:
 *   - sort:           'recent' | 'popular'.
 *   - q:              texto de búsqueda actual.
 *   - onSortChange:   callback(nextSort).
 *   - onQueryChange:  callback(nextQ) — se dispara con debounce.
 */
export function FeedToolbar({ sort, q, onSortChange, onQueryChange }) {
  const [localQ, setLocalQ] = useState(q ?? '');
  const debounceRef = useRef(null);
  useEffect(() => {
    setLocalQ(q ?? '');
  }, [q]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleInput = (e) => {
    const next = e.target.value;
    setLocalQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onQueryChange?.(next.trim());
    }, 400);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div role="tablist" aria-label="Ordenar feed" className="flex gap-1 border-b border-line">
        <Tab active={sort === 'recent'} onClick={() => onSortChange?.('recent')}>
          <i className="fas fa-clock mr-2" aria-hidden="true" />
          Recientes
        </Tab>
        <Tab active={sort === 'popular'} onClick={() => onSortChange?.('popular')}>
          <i className="fas fa-fire mr-2" aria-hidden="true" />
          Populares
        </Tab>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:flex-none">
          <i
            className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none text-sm"
            aria-hidden="true"
          />
          <input
            type="search"
            value={localQ}
            onChange={handleInput}
            placeholder="Buscar mapas..."
            aria-label="Buscar mapas en el feed"
            className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl border border-line bg-white/70 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-400/60 focus:border-brand-400/60"
          />
        </div>
        <Link
          to="/comunidad/favoritos"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-ink-muted hover:text-ink hover:bg-brand-50 border border-line transition-colors"
          title="Mis favoritos"
        >
          <i className="fas fa-bookmark" aria-hidden="true" />
          <span className="hidden sm:inline">Favoritos</span>
        </Link>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
        (active
          ? 'border-brand-500 text-brand-700'
          : 'border-transparent text-ink-muted hover:text-ink')
      }
    >
      {children}
    </button>
  );
}

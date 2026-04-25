import { Card } from '@/components/ui/Card.jsx';

/**
 * Tarjeta con cabecera fija (icono + título + descripción) y children
 * para el contenido. Usada por todas las secciones del perfil para
 * que tengan el mismo ritmo visual sin duplicar markup.
 */
export function SectionCard({ icon, title, description, children, className = '' }) {
  return (
    <Card padded className={`flex flex-col gap-5 ${className}`}>
      <header className="flex items-start gap-3">
        {icon && (
          <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <i className={`fas ${icon}`} aria-hidden="true" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="text-sm text-ink-muted mt-0.5">{description}</p>}
        </div>
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

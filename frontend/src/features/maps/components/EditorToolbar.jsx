import { Button } from '@/ui/Button.jsx';

/**
 * Barra de acciones del editor: añadir concepto, zoom, guardar manual,
 * volver al listado. El botón "Deshacer" queda deshabilitado en M3
 * con tooltip "Próximamente": Drawflow no trae undo y un undo correcto
 * son ~4h más, fuera del scope de esta entrega (ver maps-plan.md §5.3).
 *
 * Props:
 *   - onAddConcept:  añade un nodo en el centro del viewport.
 *   - onZoomIn / onZoomOut / onZoomReset.
 *   - onSaveNow:     fuerza el flush del auto-save pendiente.
 *   - onBack:        navega de vuelta a /mapas.
 *   - isSaving:      muestra el spinner en "Guardar".
 */
export function EditorToolbar({
  onAddConcept,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSaveNow,
  onBack,
  isSaving = false,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-glass backdrop-blur-md border border-line rounded-xl px-3 py-2 shadow-card">
      <Button variant="ghost" size="md" onClick={onBack} title="Volver al listado">
        <i className="fas fa-arrow-left" aria-hidden="true" />
        <span className="hidden sm:inline">Volver</span>
      </Button>

      <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />

      <Button onClick={onAddConcept} size="md" title="Añadir concepto">
        <i className="fas fa-plus" aria-hidden="true" />
        <span className="hidden sm:inline">Concepto</span>
      </Button>

      <Button
        variant="ghost"
        size="md"
        disabled
        title="Próximamente · deshacer disponible en una versión futura"
      >
        <i className="fas fa-rotate-left" aria-hidden="true" />
      </Button>

      <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />

      <Button variant="ghost" size="md" onClick={onZoomOut} title="Alejar" aria-label="Alejar">
        <i className="fas fa-magnifying-glass-minus" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="md" onClick={onZoomReset} title="Ajustar zoom" aria-label="Ajustar zoom">
        <i className="fas fa-expand" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="md" onClick={onZoomIn} title="Acercar" aria-label="Acercar">
        <i className="fas fa-magnifying-glass-plus" aria-hidden="true" />
      </Button>

      <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />

      <Button onClick={onSaveNow} size="md" isLoading={isSaving} title="Guardar ahora">
        <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
        <span className="hidden sm:inline">Guardar</span>
      </Button>
    </div>
  );
}

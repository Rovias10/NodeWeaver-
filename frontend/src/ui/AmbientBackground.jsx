/**
 * Capa decorativa global de la SPA.
 *
 * En NodeWeaver cada HTML repetía 6 <div fixed inset-0 ...> con glows.
 * Aquí lo encapsulamos en un único componente para reutilizar en landing,
 * auth y shell.
 *
 * Diseño: paleta veraniega "Cielo Claro" (ver docs/redesign-plan.md §1).
 *  - Capa 1: fondo paper sólido.
 *  - Capa 2: gradiente vertical brand→sun→paper que da sensación de cielo.
 *  - Capa 3: grid pattern azul cielo muy suave.
 *  - Capa 4: tres glows redondos (sun, brand, coral) en posiciones fijas.
 *
 * Si la página tiene contenido scrollable largo, el background se queda
 * fijo gracias a "fixed inset-0".
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true">
      <div className="fixed inset-0 bg-paper z-[-10] pointer-events-none" />
      <div
        className="fixed inset-0 bg-gradient-to-b from-brand-200/40 via-sun-200/20 to-paper z-[-9] pointer-events-none"
      />
      <div className="fixed inset-0 grid-pattern opacity-60 z-[-8] pointer-events-none" />

      <div className="fixed top-[-15%] left-[-10%] w-[55%] h-[55%] rounded-full bg-sun-300/30 blur-[140px] pointer-events-none z-[-7]" />
      <div className="fixed bottom-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-brand-400/25 blur-[130px] pointer-events-none z-[-7]" />
      <div className="fixed top-[25%] right-[30%] w-[30%] h-[30%] rounded-full bg-coral-400/20 blur-[120px] pointer-events-none z-[-7]" />
    </div>
  );
}

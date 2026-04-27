/**
 * Footer simple de la landing.
 * Mantenemos el mensaje académico explícito ("Proyecto Final DAW")
 * porque honestidad de contexto > marketing aspiracional.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-line/60 py-10 px-6 mt-16">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-ink-muted">
        <div className="flex items-center gap-3">
          <img
            src="/Logotipo.svg"
            alt="Logotipo de StudyWeaver"
            className="h-10 w-auto"
          />
          <span className="text-ink-faint">© 2026 · Proyecto Final DAW</span>
        </div>
        <nav className="flex gap-2">
          <a href="#" className="hover:text-ink transition-colors px-2 py-1">Términos</a>
          <a href="#" className="hover:text-ink transition-colors px-2 py-1">Privacidad</a>
          <a href="#" className="hover:text-ink transition-colors px-2 py-1">Sobre el proyecto</a>
        </nav>
      </div>
    </footer>
  );
}

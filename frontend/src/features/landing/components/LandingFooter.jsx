/**
 * Footer simple de la landing.
 * Mantenemos el mensaje académico explícito ("Proyecto Final DAW")
 * porque honestidad de contexto > marketing aspiracional.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-line/60 py-10 px-6 mt-16">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="block text-base font-extrabold tracking-tight bg-gradient-to-r from-brand-600 via-brand-500 to-coral-400 bg-clip-text text-transparent">
            StudyWeaver
          </span>
          <span className="text-ink-faint">© 2026 · Proyecto Final DAW</span>
        </div>
        <nav className="flex gap-6">
          <a href="#" className="hover:text-ink transition-colors">Términos</a>
          <a href="#" className="hover:text-ink transition-colors">Privacidad</a>
          <a href="#" className="hover:text-ink transition-colors">Sobre el proyecto</a>
        </nav>
      </div>
    </footer>
  );
}

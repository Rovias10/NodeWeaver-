/**
 * Separador horizontal con la palabra "o" en el centro.
 * Repite el patrón visual común a login.html y register.html.
 */
export function AuthDivider({ label = 'o' }) {
  return (
    <div className="relative flex items-center py-2">
      <div className="flex-1 border-t border-line" />
      <span className="flex-shrink-0 mx-4 text-ink-faint text-sm">{label}</span>
      <div className="flex-1 border-t border-line" />
    </div>
  );
}

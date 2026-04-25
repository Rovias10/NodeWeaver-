/**
 * Ilustración SVG inline para el hero: un mapa conceptual estilizado
 * con 5 nodos conectados.
 *
 * Decisiones:
 *   - SVG inline: sin librerías ni archivos extra; cero peticiones HTTP.
 *   - Los nodos usan los tokens de la paleta veraniega vía colores fijos
 *     equivalentes (sky-500 / sun-300 / coral-400). No podemos referenciar
 *     CSS vars de Tailwind 4 dentro de SVG porque el navegador resuelve
 *     gradientes en tiempo de render, así que dejamos hex.
 *   - Marcado decorativo (aria-hidden). El significado lo aporta el
 *     texto del hero a su lado.
 */
export function HeroIllustration({ className = '' }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      viewBox="0 0 480 420"
      xmlns="http://www.w3.org/2000/svg"
      className={`w-full h-full ${className}`}
    >
      <defs>
        <linearGradient id="hero-line" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3aa8fa" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>
        <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0ea5e9" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Halo de fondo */}
      <circle cx="240" cy="210" r="200" fill="url(#hero-glow)" />

      {/* Conexiones */}
      <g stroke="url(#hero-line)" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 240 210 C 200 130, 150 90, 110 70" />
        <path d="M 240 210 C 290 130, 340 80, 380 60" />
        <path d="M 240 210 C 200 280, 160 320, 120 340" />
        <path d="M 240 210 C 290 290, 340 330, 380 350" />
      </g>

      {/* Nodo central */}
      <g filter="url(#soft-shadow)">
        <circle cx="240" cy="210" r="48" fill="#ffffff" stroke="#0ea5e9" strokeWidth="2.5" />
        <text
          x="240"
          y="216"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#0369a1"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          Tema
        </text>
      </g>

      {/* Nodos satélite */}
      <g filter="url(#soft-shadow)">
        <circle cx="100" cy="62" r="30" fill="#dbeefe" stroke="#7cc6fd" strokeWidth="2" />
        <text x="100" y="68" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0369a1" fontFamily="ui-sans-serif, system-ui">
          PDF
        </text>
      </g>
      <g filter="url(#soft-shadow)">
        <circle cx="384" cy="56" r="30" fill="#fde68a" stroke="#fbbf24" strokeWidth="2" />
        <text x="384" y="62" textAnchor="middle" fontSize="13" fontWeight="600" fill="#92400e" fontFamily="ui-sans-serif, system-ui">
          IA
        </text>
      </g>
      <g filter="url(#soft-shadow)">
        <circle cx="116" cy="346" r="30" fill="#fda4af" stroke="#fb7185" strokeWidth="2" />
        <text x="116" y="352" textAnchor="middle" fontSize="13" fontWeight="600" fill="#9f1239" fontFamily="ui-sans-serif, system-ui">
          Quiz
        </text>
      </g>
      <g filter="url(#soft-shadow)">
        <circle cx="384" cy="354" r="30" fill="#a7f3d0" stroke="#34d399" strokeWidth="2" />
        <text x="384" y="360" textAnchor="middle" fontSize="13" fontWeight="600" fill="#064e3b" fontFamily="ui-sans-serif, system-ui">
          Card
        </text>
      </g>
    </svg>
  );
}

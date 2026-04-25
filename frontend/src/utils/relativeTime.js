/**
 * Devuelve una cadena tipo "hace 3 días" o "ahora mismo" en castellano.
 *
 * Usa Intl.RelativeTimeFormat (nativo del navegador, soportado desde
 * 2019 en todos los modernos) — sin dependencias externas tipo
 * date-fns o dayjs, defendible ante tribunal.
 *
 * @param {string|Date} input  Fecha ISO/MySQL o Date.
 * @returns {string}  Texto relativo en castellano.
 */
const RTF = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

const STEPS = [
  { unit: 'year',   seconds: 31536000 },
  { unit: 'month',  seconds: 2592000  },
  { unit: 'week',   seconds: 604800   },
  { unit: 'day',    seconds: 86400    },
  { unit: 'hour',   seconds: 3600     },
  { unit: 'minute', seconds: 60       },
];

export function relativeTime(input) {
  if (!input) return '';
  // MySQL devuelve "Y-m-d H:i:s" sin TZ. Lo tratamos como hora local
  // del servidor; si en un futuro el backend devuelve ISO con Z, este
  // parser sigue funcionando.
  const date = input instanceof Date ? input : new Date(String(input).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';

  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 45) return 'justo ahora';

  for (const { unit, seconds } of STEPS) {
    if (absSec >= seconds) {
      const value = Math.round(diffSec / seconds);
      return RTF.format(value, unit);
    }
  }
  return RTF.format(diffSec, 'second');
}

/**
 * Lista única de secciones navegables del shell autenticado.
 * Compartida entre AppSidebar (desktop) y MobileDrawer (mobile)
 * para que añadir o renombrar una sección sólo requiera tocar
 * este archivo.
 *
 * El orden importa: es el orden visual de la sidebar/drawer y
 * también el orden en el que AppNavbar resuelve la sección actual
 * a partir del pathname (ver `currentSection` en AppNavbar.jsx).
 *
 * "Inicio" abre el dashboard del usuario y va primero porque es
 * el home de la app autenticada. "Mis apuntes" queda en segunda
 * posición como zona de trabajo principal.
 */
export const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Inicio',
    icon: 'fa-house',
    end: true,
  },
  {
    to: '/apuntes',
    label: 'Mis apuntes',
    icon: 'fa-file-lines',
    end: true,
  },
  {
    to: '/mapas',
    label: 'Mis mapas',
    icon: 'fa-diagram-project',
  },
  {
    to: '/flashcards',
    label: 'Flashcards',
    icon: 'fa-clone',
  },
  {
    to: '/comunidad',
    label: 'Comunidad',
    icon: 'fa-users',
  },
  {
    to: '/perfil',
    label: 'Mi perfil',
    icon: 'fa-user-gear',
  },
];

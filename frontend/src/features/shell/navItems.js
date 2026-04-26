/**
 * Lista única de secciones navegables del shell autenticado.
 * Compartida entre AppSidebar (desktop) y MobileDrawer (mobile)
 * para que añadir o renombrar una sección sólo requiera tocar
 * este archivo.
 *
 * Las rutas marcadas con disabled=true muestran un badge "Próximamente"
 * y no son clicables — sirven para que el alumno pueda defender la
 * estructura completa de la app aunque no todas las features estén
 * implementadas.
 */
export const NAV_ITEMS = [
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
    to: '/dashboard',
    label: 'Inicio',
    icon: 'fa-house',
  },
  {
    to: '/perfil',
    label: 'Mi perfil',
    icon: 'fa-user-gear',
  },
];

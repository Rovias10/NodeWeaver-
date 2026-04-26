/**
 * Constantes con las rutas de la API. Centralizar aquí evita tipear
 * strings sueltos por todo el código y facilita refactorizar el día
 * que el backend cambie a URLs limpias.
 *
 * El backend ([backend/API/router/api.php]) recibe la ruta como query string:
 *   GET  index.php?route=profile/me
 *   POST index.php?route=auth/login
 *
 * apiClient ya añade el prefijo "?route=" antes de cada ruta.
 */

export const ENDPOINTS = {
  auth: {
    login:           'auth/login',
    register:        'auth/register',
    forgotPassword:  'auth/forgot-password',
    resetPassword:   'auth/reset-password',
    confirmAccount:  'auth/confirm-account',
    google:          'auth/google',
  },
  profile: {
    me:              'profile/me',
    update:          'profile/update',
    password:        'profile/password',
    avatar:          'profile/avatar',
  },
  maps: {
    list:            'maps/list',
    get:             'maps/get',
    save:            'maps/save',
    remove:          'maps/delete',
  },
  ai: {
    expand:          'ai/expand',
  },
  flashcards: {
    list:            'flashcards/list',
    due:             'flashcards/due',
    save:            'flashcards/save',
    review:          'flashcards/review',
    remove:          'flashcards/delete',
    generateFromMap: 'flashcards/generate-from-map',
  },
  notes: {
    list:            'notes/list',
    get:             'notes/get',
    upload:          'notes/upload',
    remove:          'notes/delete',
  },
  community: {
    feed:            'community/feed',
    map:             'community/map',
    profile:         'community/profile',
    profileMaps:     'community/profile-maps',
    favorites:       'community/favorites',
    like:            'community/like',
    comments:        'community/comments',
    comment:         'community/comment',
    commentDelete:   'community/comment-delete',
  },
};

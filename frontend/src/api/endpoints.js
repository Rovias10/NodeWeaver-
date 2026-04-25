/**
 * Constantes con las rutas de la API. Centralizar aquí evita tipear
 * strings sueltos por todo el código y facilita refactorizar el día
 * que migremos a backend/API/ con URLs limpias.
 *
 * El backend actual ([API/router/api.php]) recibe la ruta como query string:
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
};

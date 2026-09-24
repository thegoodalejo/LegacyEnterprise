// Desarrollo 100% local: backend con `php -S 127.0.0.1:8080 -t backend` + MariaDB local.
// Uso: npm run start:local  (ng serve --configuration local)
// Autocontenido a propósito: fileReplacements reemplaza environment.ts por este archivo, así que no puede importarlo.
export const APP_VERSION = 'dev';

export const environment = {
  production: false,
  appName: 'Legacy Enterprise',
  appVersion: APP_VERSION,
  apiUrl: 'http://127.0.0.1:8080',
  firebase: {
    apiKey: 'AIzaSyBN9-V8DwPppKwYr77NaqIUDKQDeNvoAyI',
    authDomain: 'legacyenterprise-731cb.firebaseapp.com',
    projectId: 'legacyenterprise-731cb',
    storageBucket: 'legacyenterprise-731cb.firebasestorage.app',
    messagingSenderId: '29644516990',
    appId: '1:29644516990:web:e6dfcf2d1bcf0e342c322f',
  },
  vapidKey: '',
};

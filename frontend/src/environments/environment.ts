// Desarrollo local → API de QA. La config web de Firebase es pública por diseño.
// El CI de PDN reemplaza APP_VERSION por el hash del commit (ver deploy-pdn.yml).
export const APP_VERSION = 'dev';

export const environment = {
  production: false,
  appName: 'Legacy Enterprise',
  appVersion: APP_VERSION,
  apiUrl: 'https://qa.legacyenterprise.legacysoftware.cloud',
  firebase: {
    apiKey: 'AIzaSyBN9-V8DwPppKwYr77NaqIUDKQDeNvoAyI',
    authDomain: 'legacyenterprise-731cb.firebaseapp.com',
    projectId: 'legacyenterprise-731cb',
    storageBucket: 'legacyenterprise-731cb.firebasestorage.app',
    messagingSenderId: '29644516990',
    appId: '1:29644516990:web:e6dfcf2d1bcf0e342c322f',
  },
  vapidKey: '', // Fase 4: Firebase → Configuración → Cloud Messaging → Certificados push web
};

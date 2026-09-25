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
  // Key de navegador de Google Maps (pública por diseño, como la de Firebase): SIEMPRE con restricción por referrer y con solo
  // «Maps JavaScript API» + «Geocoding API». Vacía = el selector de ubicación funciona solo con coordenadas escritas a mano.
  googleMapsApiKey: 'AIzaSyBK_j4oVauc_UCkpq2Dm7Iachg7setFVNc',
  vapidKey: 'BIMQjxRKPahxOUx00LzzIo8tMXc7YMDYVS3QuR0f7zAtNtB9mawrYk3t-9898_suEIJzmIL1FFkbG9EmMHmg70s',   // pública por diseño (Firebase → Cloud Messaging → Certificados push web)
};

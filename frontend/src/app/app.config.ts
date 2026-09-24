import { ApplicationConfig, inject, isDevMode, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { TranslationService } from './services/translation.service';

// Fechas y números en español por defecto; los pipes que dependen del idioma reciben i18n.lang() (es | en).
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es' },
    provideRouter(routes, withComponentInputBinding()),
    // Idioma inicial; con sesión (Fase 2) manda usuarios.idioma.
    provideAppInitializer(() => inject(TranslationService).use('es')),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import type { Messaging } from 'firebase/messaging';
import { environment } from '../../environments/environment';

/** Inicializa Firebase una sola vez para toda la app. */
@Injectable({ providedIn: 'root' })
export class FirebaseCoreService {
  readonly app: FirebaseApp = initializeApp(environment.firebase);
  readonly auth: Auth = getAuth(this.app);
  private messagingPromise: Promise<Messaging | null> | null = null;

  /**
   * null si el navegador no soporta push (iOS fuera de la PWA instalada, navegadores viejos).
   * firebase/messaging se importa bajo demanda: pesa ~100 kB y solo hace falta al activar push.
   */
  messaging(): Promise<Messaging | null> {
    this.messagingPromise ??= import('firebase/messaging')
      .then(async m => ((await m.isSupported()) ? m.getMessaging(this.app) : null))
      .catch(() => null);
    return this.messagingPromise;
  }
}

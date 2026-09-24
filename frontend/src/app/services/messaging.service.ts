import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { FirebaseCoreService } from './firebase-core.service';
import { NotificationsService } from './notifications.service';
import { TranslationService } from './translation.service';

// Scope propio: ngsw-worker.js ocupa '/', y solo puede haber una registración por scope.
const FCM_SW_URL = '/firebase-messaging-sw.js';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export type PushState = 'unsupported' | 'default' | 'denied' | 'granted';

/**
 * Push con FCM. El permiso se pide SOLO por acción del usuario (botón "Activar notificaciones"):
 * pedirlo al cargar hace que el navegador lo bloquee y el usuario no entienda por qué.
 * Llamar init() una vez con sesión: si ya había permiso, re-registra el token (rota con el tiempo).
 * firebase/messaging se importa bajo demanda (ver FirebaseCoreService) para no inflar el bundle inicial.
 */
@Injectable({ providedIn: 'root' })
export class MessagingService {
  private fb = inject(FirebaseCoreService);
  private api = inject(ApiService);
  private notifications = inject(NotificationsService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private i18n = inject(TranslationService);

  readonly state = signal<PushState>(this.currentState());
  private listening = false;

  async init(): Promise<void> {
    if (!(await this.fb.messaging())) { this.state.set('unsupported'); return; }
    void this.listenForeground();
    if (Notification.permission === 'granted') await this.ensureToken().catch(e => console.warn('[push] token', e));
  }

  /** Botón "Activar notificaciones". Devuelve true si quedó activo. */
  async enable(): Promise<boolean> {
    if (!(await this.fb.messaging())) { this.state.set('unsupported'); return false; }
    const perm = await Notification.requestPermission();
    this.state.set(perm as PushState);
    if (perm !== 'granted') return false;
    await this.ensureToken();
    void this.listenForeground();
    return true;
  }

  async disable(): Promise<void> {
    const messaging = await this.fb.messaging();
    if (messaging) {
      const { deleteToken } = await import('firebase/messaging');
      await deleteToken(messaging).catch(() => undefined);
    }
    await this.api.post('users/save_fcm_token.php', { fcm_token: '' });
  }

  private async ensureToken(): Promise<void> {
    const messaging = await this.fb.messaging();
    if (!messaging) return;
    const { getToken } = await import('firebase/messaging');
    const reg = await navigator.serviceWorker.register(FCM_SW_URL, { scope: FCM_SW_SCOPE });
    await this.waitForActivation(reg);
    const token = await getToken(messaging, { vapidKey: environment.vapidKey, serviceWorkerRegistration: reg });
    if (token) await this.api.post('users/save_fcm_token.php', { fcm_token: token });
  }

  /** App abierta y visible: el push no se muestra como notificación del sistema, se avisa aquí. */
  private async listenForeground(): Promise<void> {
    const messaging = await this.fb.messaging();
    if (!messaging || this.listening) return;
    this.listening = true;
    const { onMessage } = await import('firebase/messaging');
    onMessage(messaging, payload => {
      const d = payload.data ?? {};
      void this.notifications.refreshCount();
      const ref = this.snackBar.open(`${d['title'] ?? ''}${d['body'] ? ': ' + d['body'] : ''}`, this.i18n.t('notif.view'), {
        duration: 6000, verticalPosition: 'top',
      });
      ref.onAction().subscribe(() => this.router.navigate(['/notificaciones'], { queryParams: { n: d['uuid'], sede: d['id_sede'] } }));
    });
  }

  private waitForActivation(reg: ServiceWorkerRegistration): Promise<void> {
    if (reg.active?.state === 'activated') return Promise.resolve();
    const sw = reg.installing || reg.waiting || reg.active;
    if (!sw) return Promise.resolve();
    return new Promise(resolve => {
      if (sw.state === 'activated') resolve();
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
    });
  }

  private currentState(): PushState {
    // Sin clave VAPID (Fase 4 pendiente) no se puede obtener token: se trata como no soportado.
    if (!environment.vapidKey) return 'unsupported';
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
    return Notification.permission as PushState;
  }
}

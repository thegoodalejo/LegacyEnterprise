import { Injectable, computed, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 7;

/**
 * Invita a instalar la app si no está instalada (patrón de Kingdom + iOS).
 * - Chrome/Edge/Android: beforeinstallprompt → botón Instalar.
 * - iOS Safari: no hay evento; se muestran las instrucciones "Compartir → Agregar a inicio".
 * - Nunca se muestra si ya corre instalada. "Ahora no" lo oculta 7 días en ese dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferred: BeforeInstallPromptEvent | null = null;
  private canPrompt = signal(false);
  private dismissed = signal(this.readDismissed());

  readonly isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /** 'prompt' = botón instalar · 'ios' = instrucciones · null = no mostrar nada. */
  readonly mode = computed<'prompt' | 'ios' | null>(() => {
    if (this.isStandalone || this.dismissed()) return null;
    if (this.canPrompt()) return 'prompt';
    if (this.isIos) return 'ios';
    return null;
  });

  constructor() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canPrompt.set(false);
    });
  }

  async install(): Promise<void> {
    if (!this.deferred) return;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.canPrompt.set(false);
  }

  dismiss(): void {
    this.dismissed.set(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000)); } catch { /* sin storage */ }
  }

  private readDismissed(): boolean {
    try { return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now(); } catch { return false; }
  }
}

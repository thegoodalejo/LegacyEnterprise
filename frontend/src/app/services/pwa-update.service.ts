import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../environments/environment';
import { TranslationService } from './translation.service';

/**
 * Mantiene la PWA al día. Inyectarlo una vez en AppComponent y llamar start().
 * 1. Service worker de Angular: VERSION_READY → activar + recargar; se busca actualización al volver
 *    la pestaña a primer plano y cada 6h.
 * 2. Chequeo contra el backend (patrón de Kingdom): si app_global_status.version ≠ APP_VERSION del
 *    bundle, se avisa y se recarga. Cubre el caso en que el SW no detectó el cambio.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private sw = inject(SwUpdate);
  private snackBar = inject(MatSnackBar);
  private i18n = inject(TranslationService);
  private reloading = false;

  start(): void {
    if (this.sw.isEnabled) {
      this.sw.versionUpdates.subscribe(ev => {
        if (ev.type === 'VERSION_READY') void this.sw.activateUpdate().then(() => this.reload());
        if (ev.type === 'VERSION_INSTALLATION_FAILED') console.warn('[pwa] instalación de versión falló', ev.error);
      });
      this.sw.unrecoverable.subscribe(() => this.reload());
      const check = () => this.sw.checkForUpdate().catch(() => undefined);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
      setInterval(check, 6 * 3_600_000);
    }
    void this.checkBackendVersion();
  }

  private async checkBackendVersion(): Promise<void> {
    if (environment.appVersion === 'dev') return;
    try {
      const r = await fetch(`${environment.apiUrl}/app_global_status.php`, { cache: 'no-store' }).then(x => x.json());
      if (r?.version && r.version !== environment.appVersion) {
        // El CI publica el backend antes que el frontend: durante ese rato la versión no coincide
        // aunque se recargue. Una sola recarga por versión del servidor evita un bucle.
        const key = 'reloaded_for_version';
        try { if (sessionStorage.getItem(key) === r.version) return; sessionStorage.setItem(key, r.version); } catch { return; }
        this.snackBar.open(this.i18n.t('pwa.updating'), this.i18n.t('pwa.update_now'), { duration: 8000 })
          .afterDismissed().subscribe(() => this.reload());
      }
    } catch { /* sin red: se reintenta en la próxima carga */ }
  }

  private reload(): void {
    if (this.reloading) return;
    this.reloading = true;
    document.location.reload();
  }
}

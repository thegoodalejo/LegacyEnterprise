import { Component, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { LoadingOverlayComponent } from './components/loading-overlay.component';
import { PwaInstallBannerComponent } from './components/pwa-install-banner.component';
import { ApiService } from './services/api.service';
import { AuthService } from './services/auth.service';
import { MessagingService } from './services/messaging.service';
import { PwaUpdateService } from './services/pwa-update.service';
import { SessionService } from './services/session.service';
import { ThemeService } from './services/theme.service';
import { TranslationService } from './services/translation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingOverlayComponent, PwaInstallBannerComponent],
  templateUrl: './app.html',
})
export class App {
  constructor() {
    document.getElementById('app-splash')?.remove();
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    inject(ThemeService);
    inject(PwaUpdateService).start();
    inject(AuthService); // arranca onIdTokenChanged → handshake → sesión (la marca la aplica SessionService)


    const session = inject(SessionService);
    const i18n = inject(TranslationService);
    const messaging = inject(MessagingService);
    effect(() => {
      const u = session.user();
      if (!u) return;
      untracked(() => {
        if (u.idioma && u.idioma !== i18n.lang()) void i18n.use(u.idioma);
        // Push: solo re-registra el token si el usuario ya había dado permiso (nunca lo pide solo).
        if (u.id_sede && messaging.state() === 'granted') void messaging.init();
      });
    });

    // Solo desarrollo (el build de producción define ngDevMode=false y elimina el bloque): permite a las pruebas
    // de Playwright abrir sesión con un token de prueba contra el backend local, sin el popup de Google.
    if (ngDevMode) {
      const api = inject(ApiService);
      const router = inject(Router);
      const auth = inject(AuthService);
      (window as unknown as { __leDev: unknown }).__leDev = {
        // whenReady primero: si no, el onIdTokenChanged(null) inicial de Firebase puede llegar a mitad del
        // reload y anular el token (la sesión vuelve con la respuesta, pero sin token).
        login: async (token: string) => { await auth.whenReady(); api.setToken(token); await session.reload(); },
        go: (url: string) => router.navigateByUrl(url),   // navegar sin recargar (recargar pierde la sesión de prueba)
      };
    }
  }
}

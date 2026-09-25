import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { TranslationService } from './translation.service';

interface MapsWindow extends Window {
  __leGmReady?: () => void;
  gm_authFailure?: () => void;
}

/**
 * Carga la API de Google Maps (JavaScript) una sola vez, bajo demanda: nada de Google se descarga hasta que alguien abre
 * el selector de ubicación. La key sale de environment.googleMapsApiKey (key de navegador, restringida por referrer).
 * Sin key, con la key rechazada o sin red, `load()` resuelve false y el selector queda en modo «coordenadas escritas».
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private i18n = inject(TranslationService);
  private pending: Promise<boolean> | null = null;

  /** Hay una key configurada en el ambiente. */
  readonly configured = !!environment.googleMapsApiKey;
  /** Google rechazó la key (referrer no permitido, API sin habilitar, facturación…): lo avisa gm_authFailure. */
  readonly authFailed = signal(false);

  load(): Promise<boolean> {
    // Si la API ya está en la página se usa tal cual; si no, hace falta la key del ambiente.
    if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') return Promise.resolve(true);
    if (!this.configured) return Promise.resolve(false);
    this.pending ??= new Promise<boolean>(resolve => {
      const w = window as MapsWindow;
      let done = false;
      const finish = (ok: boolean): void => { if (!done) { done = true; resolve(ok); } };

      w.gm_authFailure = () => this.authFailed.set(true);
      w.__leGmReady = () => finish(true);
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(environment.googleMapsApiKey)}`
        + `&loading=async&callback=__leGmReady&language=${encodeURIComponent(this.i18n.lang())}`;
      s.onerror = () => { this.pending = null; s.remove(); finish(false); };
      document.head.appendChild(s);
      setTimeout(() => { if (!done) { this.pending = null; finish(false); } }, 20000);
    });
    return this.pending;
  }
}

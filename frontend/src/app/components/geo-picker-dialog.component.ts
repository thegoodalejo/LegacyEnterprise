import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { formatCoords, mapsUrl, parseCoords } from '../pages/crm/crm-format';
import { GoogleMapsLoaderService } from '../services/google-maps-loader.service';
import { TranslatePipe } from '../services/translation.service';

export interface GeoPickerData {
  lat: number | null;
  lng: number | null;
  /** Dirección escrita en el formulario: si aún no hay punto, se busca en el mapa. */
  direccion: string;
  ciudad: string;
}
export type GeoPickerResult =
  | { lat: number; lng: number; direccion: string | null; ciudad: string | null }
  | { clear: true };

interface Sugerencia { texto: string; res: google.maps.GeocoderResult }

const CENTRO_INICIAL = { lat: 4.570868, lng: -74.297333 };   // Colombia; sin punto previo el mapa abre aquí

/**
 * Selector de ubicación con mapa de Google: clic o arrastre del pin, búsqueda por dirección (Geocoding) y «mi ubicación».
 * Devuelve lat/lng (y la dirección y ciudad que Google reconoce para ese punto). Siempre se pueden escribir las
 * coordenadas a mano; sin key de Google (o si la rechaza) ese es el único modo y el resto se oculta.
 */
@Component({
  selector: 'app-geo-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatIconButton, MatFormField, MatHint, MatLabel, MatSuffix, MatIcon, MatInput, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.geo.title' | translate }}</h2>
    <mat-dialog-content>
      @if (!sinMapa()) {
        <div class="search">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'crm.geo.search' | translate }}</mat-label>
            <input matInput id="geo-search" autocomplete="off" [ngModel]="query()" (ngModelChange)="query.set($event)" (keydown.enter)="buscar()" />
            <button matSuffix mat-icon-button type="button" id="btn-geo-search" (click)="buscar()" [disabled]="buscando()" [attr.aria-label]="'crm.geo.search_btn' | translate">
              <mat-icon>search</mat-icon>
            </button>
          </mat-form-field>
          <button mat-icon-button type="button" id="btn-geo-mine" (click)="miUbicacion()" [attr.aria-label]="'crm.geo.use_mine' | translate"><mat-icon>my_location</mat-icon></button>
        </div>
        @if (sugerencias().length) {
          <ul class="results" id="geo-results">
            @for (s of sugerencias(); track $index) {
              <li><button type="button" mat-button (click)="elegir(s.res)">{{ s.texto }}</button></li>
            }
          </ul>
        }
      } @else if (!cargando()) {
        <p class="notice" id="geo-notice">
          <mat-icon>info</mat-icon>
          <span>{{ (loader.configured && !loader.authFailed() ? 'crm.geo.unavailable' : (loader.authFailed() ? 'crm.geo.rejected' : 'crm.geo.not_configured')) | translate }}</span>
        </p>
      }
      <div #mapEl class="map" id="geo-map" [class.hidden]="sinMapa()" role="application" [attr.aria-label]="'crm.geo.map' | translate"></div>
      @if (mensaje(); as m) { <p class="err" role="alert" id="geo-message">{{ m | translate }}</p> }

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="coords">
        <mat-label>{{ 'crm.geo.coords' | translate }}</mat-label>
        <input matInput id="geo-coords" inputmode="decimal" placeholder="4.711000, -74.072100" autocomplete="off"
               [ngModel]="coordsText()" (ngModelChange)="coordsText.set($event)" (keydown.enter)="aplicarCoords()" (blur)="aplicarCoords()" />
        <mat-hint>{{ 'crm.geo.coords_hint' | translate }}</mat-hint>
      </mat-form-field>
      @if (direccionMapa(); as d) {
        <p class="found muted" id="geo-address">{{ 'crm.geo.address_found' | translate: { address: d } }}</p>
      }
      @if (lat() !== null && lng() !== null) {
        <a class="open" id="geo-open" [href]="urlMapa()" target="_blank" rel="noopener"><mat-icon>open_in_new</mat-icon>{{ 'crm.form.open_in_maps' | translate }}</a>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (d.lat !== null) { <button mat-button type="button" id="btn-geo-clear" class="danger-text" (click)="quitar()">{{ 'crm.geo.clear' | translate }}</button> }
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-geo-confirm" [disabled]="!puedeConfirmar()" (click)="confirmar()">{{ 'crm.geo.confirm' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .search { display: flex; align-items: center; gap: 4px; margin-top: 4px; mat-form-field { flex: 1 1 auto; min-width: 0; } }
    .results { list-style: none; margin: 4px 0 8px; padding: 4px; border-radius: 12px; background: var(--md-sys-color-surface-container); max-height: 180px; overflow-y: auto;
      button { width: 100%; justify-content: flex-start; text-align: left; white-space: normal; height: auto; padding: 8px 12px; } }
    .map { height: min(50vh, 380px); min-height: 240px; width: 100%; margin: 8px 0 12px; border-radius: 16px; overflow: hidden; background: var(--md-sys-color-surface-container-high); &.hidden { display: none; } }
    .notice { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0 12px; padding: 12px; border-radius: 12px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-body-medium); }
    .err { color: var(--md-sys-color-error); margin: 0 0 8px; font: var(--mat-sys-body-small); }
    .found { margin: 8px 0 0; font: var(--mat-sys-body-small); overflow-wrap: anywhere; }
    .open { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; color: var(--md-sys-color-primary); font: var(--mat-sys-label-large); }
    .danger-text { color: var(--md-sys-color-error); margin-right: auto; }
  `,
})
export class GeoPickerDialogComponent implements AfterViewInit {
  readonly d = inject<GeoPickerData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<GeoPickerDialogComponent, GeoPickerResult>);
  readonly loader = inject(GoogleMapsLoaderService);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  readonly lat = signal<number | null>(this.d.lat);
  readonly lng = signal<number | null>(this.d.lng);
  readonly direccionMapa = signal<string | null>(null);
  private ciudadMapa: string | null = null;

  readonly cargando = signal(true);
  private readonly fallo = signal(false);
  readonly buscando = signal(false);
  readonly query = signal([this.d.direccion, this.d.ciudad].map(x => x.trim()).filter(Boolean).join(', '));
  readonly sugerencias = signal<Sugerencia[]>([]);
  readonly mensaje = signal<string | null>(null);
  readonly coordsText = signal(this.d.lat !== null && this.d.lng !== null ? formatCoords(this.d.lat, this.d.lng) : '');

  private map: google.maps.Map | null = null;
  private marker: google.maps.marker.AdvancedMarkerElement | null = null;
  private geocoder: google.maps.Geocoder | null = null;
  private seq = 0;

  /** Sin mapa: sin key, key rechazada, sin red o error al iniciar. */
  sinMapa(): boolean {
    return this.fallo() || this.loader.authFailed();
  }

  urlMapa(): string {
    return mapsUrl(this.lat() ?? 0, this.lng() ?? 0);
  }

  ngAfterViewInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    const ok = await this.loader.load();
    if (ok) {
      try {
        const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
        const { AdvancedMarkerElement } = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;
        const { Geocoder } = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary;
        this.geocoder = new Geocoder();
        const conPunto = this.lat() !== null && this.lng() !== null;
        this.map = new Map(this.mapEl().nativeElement, {
          center: conPunto ? { lat: this.lat()!, lng: this.lng()! } : CENTRO_INICIAL,
          zoom: conPunto ? 16 : 5,
          mapId: 'DEMO_MAP_ID',   // los pins avanzados exigen un mapId; este es el de demostración de Google
          gestureHandling: 'greedy', streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
        });
        this.marker = new AdvancedMarkerElement({ gmpDraggable: true, position: conPunto ? { lat: this.lat()!, lng: this.lng()! } : null, map: conPunto ? this.map : null });
        this.map.addListener('click', (e: google.maps.MapMouseEvent) => { if (e.latLng) this.mover(e.latLng.lat(), e.latLng.lng()); });
        this.marker.addListener('dragend', () => {
          const p = this.marker?.position;
          if (p) this.mover(typeof p.lat === 'function' ? p.lat() : p.lat, typeof p.lng === 'function' ? p.lng() : p.lng, false);
        });
      } catch {
        this.fallo.set(true);
      }
    } else {
      this.fallo.set(true);
    }
    this.cargando.set(false);
    // Sin punto previo pero con una dirección escrita: se propone el primer resultado (no se guarda hasta confirmar).
    if (!this.sinMapa() && this.lat() === null && this.query()) void this.buscar(true);
  }

  /** Pone el pin (y, si hace falta, mueve el mapa) y pide a Google la dirección de ese punto. */
  private mover(lat: number, lng: number, centrar = true, zoom?: number): void {
    this.lat.set(lat); this.lng.set(lng);
    this.coordsText.set(formatCoords(lat, lng));
    this.mensaje.set(null); this.sugerencias.set([]);
    if (this.marker && this.map) {
      this.marker.position = { lat, lng };
      this.marker.map = this.map;
      if (centrar) { this.map.panTo({ lat, lng }); if (zoom) this.map.setZoom(zoom); }
    }
    void this.detalles(lat, lng);
  }

  private async detalles(lat: number, lng: number): Promise<void> {
    if (!this.geocoder) return;
    const id = ++this.seq;
    try {
      const r = await this.geocoder.geocode({ location: { lat, lng } });
      if (id !== this.seq) return;   // el usuario ya movió el pin otra vez
      this.aplicarDetalle(r.results[0]);
    } catch {
      if (id === this.seq) this.aplicarDetalle(undefined);
    }
  }

  private aplicarDetalle(res: google.maps.GeocoderResult | undefined): void {
    const comp = res?.address_components ?? [];
    const de = (tipo: string): string | null => comp.find(c => c.types.includes(tipo))?.long_name ?? null;
    this.direccionMapa.set(res?.formatted_address ?? null);
    this.ciudadMapa = de('locality') ?? de('administrative_area_level_2') ?? de('administrative_area_level_1');
  }

  async buscar(auto = false): Promise<void> {
    const q = this.query().trim();
    if (!q || !this.geocoder) return;
    this.buscando.set(true); this.mensaje.set(null); this.sugerencias.set([]);
    try {
      const r = await this.geocoder.geocode({ address: q });
      const lista = r.results.slice(0, 5);
      if (!lista.length) { if (!auto) this.mensaje.set('crm.geo.not_found'); }
      else if (lista.length === 1 || auto) this.elegir(lista[0]);
      else this.sugerencias.set(lista.map(res => ({ texto: res.formatted_address, res })));
    } catch (e) {
      // En la API con promesas, «sin resultados» llega como error ZERO_RESULTS.
      if (!auto) this.mensaje.set((e as { code?: string })?.code === 'ZERO_RESULTS' ? 'crm.geo.not_found' : 'crm.geo.search_error');
    } finally {
      this.buscando.set(false);
    }
  }

  elegir(res: google.maps.GeocoderResult): void {
    const loc = res.geometry.location;
    this.mover(loc.lat(), loc.lng(), true, 17);
    this.aplicarDetalle(res);
  }

  miUbicacion(): void {
    if (!navigator.geolocation) { this.mensaje.set('crm.geo.geo_denied'); return; }
    navigator.geolocation.getCurrentPosition(
      p => this.mover(p.coords.latitude, p.coords.longitude, true, 17),
      () => this.mensaje.set('crm.geo.geo_denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /** Coordenadas escritas o pegadas (p. ej. desde Google Maps: clic derecho en el punto → copiar). */
  aplicarCoords(): void {
    const t = this.coordsText().trim();
    if (!t) return;
    const c = parseCoords(t);
    if (!c) { this.mensaje.set('crm.geo.invalid_coords'); return; }
    if (c.lat === this.lat() && c.lng === this.lng()) return;
    this.mover(c.lat, c.lng, true, 16);
  }

  /** Hay un punto elegido, o unas coordenadas válidas escritas que aún no se aplicaron (se aplican al confirmar). */
  puedeConfirmar(): boolean {
    return (this.lat() !== null && this.lng() !== null) || parseCoords(this.coordsText()) !== null;
  }

  confirmar(): void {
    if (this.lat() === null) this.aplicarCoords();
    const lat = this.lat(), lng = this.lng();
    if (lat === null || lng === null) return;
    this.ref.close({ lat, lng, direccion: this.direccionMapa(), ciudad: this.ciudadMapa });
  }

  quitar(): void {
    this.ref.close({ clear: true });
  }
}

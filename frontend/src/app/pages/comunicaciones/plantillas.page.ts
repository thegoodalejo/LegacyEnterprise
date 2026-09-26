import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { ComunicacionesService, EstadoPlantilla, PlantillaCom } from '../../services/comunicaciones.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime } from '../crm/crm-format';

type Filtro = 'todas' | 'aprobada' | 'revision' | 'rechazada' | 'borrador';

/**
 * Plantillas de WhatsApp (L2+): estado en Meta, categoría (y si Meta la reclasificó), calidad y créditos por mensaje. Crear, editar, duplicar,
 * eliminar y sincronizar con Meta (trae también las creadas fuera del sistema).
 */
@Component({
  selector: 'app-plantillas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatButton, MatIconButton, MatFormField, MatPrefix, MatIcon, MatInput, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'com.tpl.title' | translate }}</h1>
        <div class="actions">
          <button mat-stroked-button id="btn-sync" (click)="sincronizar()"><mat-icon>sync</mat-icon>{{ 'com.tpl.sync' | translate }}</button>
          <a mat-flat-button id="btn-new-tpl" routerLink="/m/comunicaciones/plantillas/nueva"><mat-icon>add</mat-icon>{{ 'com.tpl.new' | translate }}</a>
        </div>
      </header>
      <section class="info">
        <mat-icon>info</mat-icon>
        <p>{{ 'com.tpl.info' | translate: { u: tarifas().utility, m: tarifas().marketing } }}</p>
      </section>
      <div class="filters">
        <div class="chips" role="tablist">
          @for (f of filtros; track f) {
            <button role="tab" class="fchip" [class.on]="filtro() === f" [attr.aria-selected]="filtro() === f" (click)="filtro.set(f)">{{ 'com.tpl.f.' + f | translate }} ({{ conteo(f) }})</button>
          }
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [ngModel]="q()" (ngModelChange)="q.set($event)" [placeholder]="'com.tpl.search' | translate" />
        </mat-form-field>
      </div>

      <div class="grid">
        @for (p of visibles(); track p.id) {
          <article class="card" [class.sel]="p.id === resaltada()" [attr.data-id]="p.id">
            <div class="chead">
              <a class="nm" [routerLink]="['/m/comunicaciones/plantillas', p.id]">{{ p.nombre }}</a>
              <span class="estado" [attr.data-estado]="p.estado">{{ 'com.tpl.st.' + p.estado | translate }}</span>
              <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'common.more' | translate"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu="matMenu">
                <a mat-menu-item [routerLink]="['/m/comunicaciones/plantillas', p.id]"><mat-icon>edit</mat-icon>{{ (editable(p) ? 'common.edit' : 'com.tpl.view') | translate }}</a>
                <a mat-menu-item routerLink="/m/comunicaciones/plantillas/nueva" [queryParams]="{ duplicar: p.id }"><mat-icon>content_copy</mat-icon>{{ 'com.tpl.duplicate' | translate }}</a>
                @if (p.estado !== 'eliminada') { <button mat-menu-item (click)="eliminar(p)"><mat-icon>delete</mat-icon>{{ 'common.delete' | translate }}</button> }
              </mat-menu>
            </div>
            <div class="tags">
              <span class="tag">{{ 'com.tpl.cat.' + (p.categoria || p.categoria_solicitada) | translate }} · {{ p.creditos }} {{ 'com.credits_short' | translate }}</span>
              <span class="tag">{{ p.idioma }}</span>
              @if (p.calidad && p.calidad !== 'UNKNOWN') { <span class="tag" [attr.data-q]="p.calidad">{{ 'com.admin.quality' | translate }}: {{ p.calidad }}</span> }
              @if (p.origen === 'meta') { <span class="tag" [matTooltip]="'com.tpl.from_meta_hint' | translate">{{ 'com.tpl.from_meta' | translate }}</span> }
            </div>
            @if (p.reclasificada) {
              <p class="reclas"><mat-icon>warning</mat-icon>{{ 'com.tpl.reclassified' | translate: { cat: ('com.tpl.cat.' + p.categoria | translate), n: p.creditos ?? 0 } }}</p>
            }
            @if (p.estado === 'rechazada' && p.motivo_rechazo) { <p class="rech"><mat-icon>block</mat-icon>{{ p.motivo_rechazo }}</p> }
            <p class="cuerpo">{{ p.cuerpo }}</p>
            <div class="foot muted small">{{ p.linea_nombre }} · {{ fecha(p.updated_at) }}@if (p.creada_por) { · {{ p.creada_por }} }</div>
          </article>
        } @empty {
          @if (!cargando()) {
            <div class="empty-state wide"><mat-icon>article</mat-icon><strong>{{ 'com.tpl.empty' | translate }}</strong><span>{{ 'com.tpl.empty_hint' | translate }}</span>
              <a mat-flat-button routerLink="/m/comunicaciones/plantillas/nueva"><mat-icon>add</mat-icon>{{ 'com.tpl.new' | translate }}</a></div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .info { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 16px; margin-bottom: 16px;
      background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); p { margin: 0; } }
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; .search { flex: 1 1 220px; max-width: 360px; } }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; }
    .fchip { padding: 6px 12px; border-radius: 16px; border: 1px solid var(--md-sys-color-outline-variant); background: none; color: var(--md-sys-color-on-surface-variant);
      font: var(--mat-sys-label-large); cursor: pointer; &.on { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); border-color: transparent; } }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .card { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant); min-width: 0; &.sel { outline: 2px solid var(--md-sys-color-primary); } }
    .chead { display: flex; align-items: center; gap: 8px; }
    .nm { flex: 1; min-width: 0; font: var(--mat-sys-title-medium); color: inherit; text-decoration: none; overflow-wrap: anywhere; &:hover { text-decoration: underline; } }
    .estado { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); white-space: nowrap; background: var(--md-sys-color-surface-container-highest);
      &[data-estado='aprobada'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-estado='pendiente'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
      &[data-estado='rechazada'], &[data-estado='pausada'], &[data-estado='deshabilitada'] { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { padding: 2px 8px; border-radius: 8px; font: var(--mat-sys-label-small); border: 1px solid var(--md-sys-color-outline-variant); &[data-q='RED'] { color: var(--md-sys-color-error); } }
    .reclas, .rech { display: flex; gap: 6px; align-items: flex-start; margin: 0; padding: 8px 10px; border-radius: 10px; font: var(--mat-sys-body-small);
      background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); mat-icon { width: 18px; height: 18px; font-size: 18px; flex: none; } }
    .cuerpo { margin: 0; font: var(--mat-sys-body-medium); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    .wide { grid-column: 1 / -1; }
  `,
})
export default class PlantillasPage {
  /** ?p=<id>: plantilla a resaltar (desde un aviso). */
  readonly p = input<string>();
  private com = inject(ComunicacionesService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private router = inject(Router);
  private i18n = inject(TranslationService);
  readonly plantillas = signal<PlantillaCom[]>([]);
  readonly tarifas = signal({ utility: 1, marketing: 20 });
  readonly filtro = signal<Filtro>('todas');
  readonly q = signal('');
  readonly cargando = signal(true);
  readonly resaltada = computed(() => Number(this.p() ?? 0));
  readonly filtros: Filtro[] = ['todas', 'aprobada', 'revision', 'rechazada', 'borrador'];
  readonly visibles = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.plantillas().filter(p => this.coincide(p, this.filtro()) && (!q || p.nombre.includes(q) || p.cuerpo.toLowerCase().includes(q)));
  });

  constructor() {
    void this.cargar();
    effect(() => { const id = this.resaltada(); untracked(() => { if (id) setTimeout(() => document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center' }), 300); }); });
  }

  private coincide(p: PlantillaCom, f: Filtro): boolean {
    const grupos: Record<Filtro, EstadoPlantilla[]> = { todas: [], aprobada: ['aprobada'], revision: ['pendiente'], rechazada: ['rechazada', 'pausada', 'deshabilitada'], borrador: ['borrador'] };
    return f === 'todas' || grupos[f].includes(p.estado);
  }
  conteo(f: Filtro): number { return this.plantillas().filter(p => this.coincide(p, f)).length; }
  editable(p: PlantillaCom): boolean { return ['borrador', 'rechazada', 'aprobada', 'pausada'].includes(p.estado); }
  fecha(s: string): string { return formatDateTime(s); }

  async cargar(): Promise<void> {
    try {
      const r = await this.loading.wrap(() => this.com.listPlantillas());
      if (r.action && r.data) { this.plantillas.set(r.data.plantillas); this.tarifas.set({ utility: r.data.tarifas.utility, marketing: r.data.tarifas.marketing }); }
    } finally { this.cargando.set(false); }
  }

  async sincronizar(): Promise<void> {
    const r = await this.loading.wrap(() => this.com.sincronizarPlantillas());
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.tpl.sync_error'), message: r.mensaje }); return; }
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const lineas = r.data.cuentas.map(c => c.error ? `WABA ${c.waba_id}: ${c.error}` : t('com.tpl.sync_line', { waba: c.waba_id, n: c.nuevas ?? 0, u: c.actualizadas ?? 0, d: c.eliminadas ?? 0 }));
    await this.dialogs.info({ title: t('com.tpl.sync_done'), message: lineas.join('\n') });
    await this.cargar();
  }

  async eliminar(p: PlantillaCom): Promise<void> {
    const ok = await this.dialogs.confirm({ title: this.i18n.t('com.tpl.delete_title'), message: this.i18n.t('com.tpl.delete_msg', { name: p.nombre }), confirmText: this.i18n.t('common.delete'), danger: true });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.com.eliminarPlantilla(p.id));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('com.tpl.delete_error'), message: r.mensaje });
    await this.cargar();
  }
}

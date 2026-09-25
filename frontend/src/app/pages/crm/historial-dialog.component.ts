import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CrmService, EntradaHistorial } from '../../services/crm.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime, isoToDmy } from './crm-format';

export interface HistorialDialogData { id: number; nombre: string }

interface Linea { id: number; icon: string; titulo: string; detalles: string[]; usuario: string; fecha: string; lote: boolean }

/** Historial de cambios de un contacto: por defecto los últimos 3 meses; "Ver anteriores" muestra todo lo guardado. */
@Component({
  selector: 'app-historial-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButton, MatIcon, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.hist.title' | translate }}</h2>
    <mat-dialog-content>
      <p class="sub muted">
        <strong>{{ d.nombre }}</strong> · {{ (todo() ? 'crm.hist.range_all' : 'crm.hist.range_3m') | translate }}
      </p>
      <ol class="timeline" id="history-list">
        @for (l of lineas(); track l.id) {
          <li>
            <mat-icon class="dot" aria-hidden="true">{{ l.icon }}</mat-icon>
            <div class="body">
              <div class="head">
                <strong>{{ l.titulo }}</strong>
                @if (l.lote) { <span class="batch">{{ 'crm.hist.batch' | translate }}</span> }
              </div>
              @for (x of l.detalles; track $index) { <div class="detail">{{ x }}</div> }
              <div class="meta muted">{{ l.usuario }} · {{ l.fecha }}</div>
            </div>
          </li>
        } @empty {
          @if (!cargando()) {
            <div class="empty-state"><mat-icon>history_toggle_off</mat-icon><span>{{ 'crm.hist.empty' | translate }}</span></div>
          }
        }
      </ol>
      @if (lineas().length < total()) {
        <button mat-button id="btn-hist-more" (click)="cargar(false)">{{ 'crm.hist.more' | translate }}</button>
      }
      @if (hayAnteriores() && !todo()) {
        <button mat-stroked-button id="btn-hist-older" (click)="verTodo()"><mat-icon>history</mat-icon>{{ 'crm.hist.older' | translate }}</button>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .sub { margin: 0 0 12px; }
    .timeline { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    li { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
    .dot { flex: none; color: var(--md-sys-color-primary); }
    .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .batch { padding: 0 8px; border-radius: 999px; background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); font: var(--mat-sys-label-small); }
    .detail { font: var(--mat-sys-body-medium); }
    .meta { font: var(--mat-sys-body-small); }
  `,
})
export class HistorialDialogComponent {
  readonly d = inject<HistorialDialogData>(MAT_DIALOG_DATA);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private i18n = inject(TranslationService);

  private readonly entradas = signal<EntradaHistorial[]>([]);
  private readonly responsables = signal<Map<number, string>>(new Map());
  readonly total = signal(0);
  readonly hayAnteriores = signal(false);
  readonly todo = signal(false);
  readonly cargando = signal(true);
  private pagina = 0;

  readonly lineas = computed<Linea[]>(() => this.entradas().map(e => this.describir(e)));

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const r = await this.crm.listResponsables();
    if (r.action && r.data) this.responsables.set(new Map(r.data.usuarios.map(u => [u.id, u.nombre])));
    await this.cargar(true);
  }

  async cargar(reset: boolean): Promise<void> {
    if (reset) { this.pagina = 0; this.entradas.set([]); }
    this.cargando.set(true);
    try {
      const r = await this.loading.wrap(() => this.crm.listHistorial(this.d.id, this.todo() ? '2000-01-01' : null, this.pagina + 1));
      if (r.action && r.data) {
        this.pagina = r.data.pagina;
        this.entradas.update(l => [...l, ...r.data!.historial]);
        this.total.set(r.data.total);
        this.hayAnteriores.set(r.data.hay_anteriores);
      }
    } finally {
      this.cargando.set(false);
    }
  }

  async verTodo(): Promise<void> {
    this.todo.set(true);
    await this.cargar(true);
  }

  // ─── Presentación ──────────────────────────────────────────────────────────────────────────────────────────────
  private t(k: string, p?: Record<string, string | number>): string { return this.i18n.t(k, p); }

  private valor(campo: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (campo === 'id_responsable') return this.responsables().get(Number(v)) ?? String(v);
    if (typeof v === 'boolean') return this.t(v ? 'common.yes' : 'common.no');
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return isoToDmy(v);
    return String(v);
  }

  private etiquetaCampo(campo: string, etiqueta?: string): string {
    if (etiqueta) return etiqueta;
    const k = `crm.field.${campo}`;
    const s = this.t(k);
    return s === k ? campo : s;
  }

  private describir(e: EntradaHistorial): Linea {
    const det = e.detalle ?? {};
    const base = { id: e.id, usuario: e.usuario ?? '—', fecha: formatDateTime(e.created_at), lote: !!det.lote };
    const rol = det.rol ? ` (${det.rol})` : '';
    const tagsLote = Array.isArray(det.tags) ? det.tags.map(n => `«${n}»`).join(', ') : '';
    switch (e.accion) {
      case 'creado':
        return { ...base, icon: 'add_circle', titulo: this.t('crm.hist.created'), detalles: det.origen === 'referencia_de_organizacion' ? [this.t('crm.hist.created_as_ref')] : [] };
      case 'actualizado': {
        const d: string[] = (det.cambios ?? []).map(c => `${this.etiquetaCampo(c.campo, c.etiqueta)}: ${this.valor(c.campo, c.antes)} → ${this.valor(c.campo, c.despues)}`);
        if (det.tags && !Array.isArray(det.tags)) {
          if (det.tags.agregados.length) d.push(this.t('crm.hist.tags_added', { tags: det.tags.agregados.map(n => `«${n}»`).join(', ') }));
          if (det.tags.quitados.length) d.push(this.t('crm.hist.tags_removed', { tags: det.tags.quitados.map(n => `«${n}»`).join(', ') }));
        }
        return { ...base, icon: 'edit', titulo: this.t('crm.hist.updated'), detalles: d };
      }
      case 'archivado': return { ...base, icon: 'delete', titulo: this.t('crm.hist.archived'), detalles: [] };
      case 'restaurado': return { ...base, icon: 'restore_from_trash', titulo: this.t('crm.hist.restored'), detalles: [] };
      case 'tags_agregados': return { ...base, icon: 'label', titulo: this.t('crm.hist.tags_added', { tags: tagsLote }), detalles: [] };
      case 'tags_quitados': return { ...base, icon: 'label_off', titulo: this.t('crm.hist.tags_removed', { tags: tagsLote }), detalles: [] };
      case 'vinculo_agregado':
      case 'vinculo_actualizado':
      case 'vinculo_quitado': {
        const quien = det.persona?.nombre ?? det.organizacion?.nombre ?? '';
        const icon = e.accion === 'vinculo_quitado' ? 'link_off' : 'link';
        return { ...base, icon, titulo: this.t(`crm.hist.${e.accion}`, { name: quien }) + rol, detalles: [] };
      }
      default: return { ...base, icon: 'history', titulo: e.accion, detalles: [] };
    }
  }
}

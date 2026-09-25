import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmService, VentaDetalle } from '../../services/crm.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate, formatDateTime } from './crm-format';

/**
 * Detalle de una venta: cliente, documento, fecha, líneas, de dónde vino (importación o registro manual) y su historial.
 * Una venta manual se anula (con motivo) o se restaura aquí (L2+); las importadas se revierten con su importación.
 * Se cierra con `true` si la venta cambió, para que quien la abrió recargue.
 */
@Component({
  selector: 'app-venta-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatDialogModule, MatButton, MatFormField, MatLabel, MatIcon, MatInput, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.sales.sale' | translate }} {{ d()?.venta?.documento || '' }}</h2>
    <mat-dialog-content>
      @if (d(); as det) {
        <dl class="head">
          <div><dt>{{ 'crm.opp.client' | translate }}</dt><dd><a class="link" [routerLink]="['/m/crm/contactos', det.venta.id_contacto]" (click)="cerrar()">{{ det.venta.cliente }}</a></dd></div>
          <div><dt>{{ 'crm.sales.date' | translate }}</dt><dd>{{ fmt(det.venta.fecha) }}</dd></div>
          <div><dt>{{ 'crm.sales.total' | translate }}</dt><dd><strong>{{ cfg.money(det.venta.total) }}</strong></dd></div>
          @if (!det.venta.activo) { <div><dt>{{ 'crm.col.status' | translate }}</dt><dd class="warn" id="sale-status">{{ (manual() ? 'crm.sales.annulled' : 'crm.sales.inactive') | translate }}</dd></div> }
        </dl>
        <div class="table-scroll">
          <table class="t">
            <thead><tr><th>{{ 'crm.oreport.item' | translate }}</th><th class="n">{{ 'crm.opp.qty' | translate }}</th><th class="n">{{ 'crm.opp.price' | translate }}</th><th class="n">{{ 'crm.opp.total' | translate }}</th></tr></thead>
            <tbody>
              @for (l of det.lineas; track l.id) {
                <tr><td><strong>{{ l.nombre || '—' }}</strong><br /><span class="muted small">{{ detalleLinea(l.codigo, l.categoria, l.id_item ? null : ('crm.sales.no_item' | translate)) }}</span></td>
                  <td class="n">{{ fmtNum(l.cantidad) }}{{ l.unidad ? ' ' + l.unidad : '' }}</td><td class="n">{{ cfg.money(l.precio_unitario) }}</td><td class="n">{{ cfg.money(l.total) }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        @if (manual()) {
          <p class="muted small" id="sale-origin">{{ 'crm.sales.origin_manual' | translate: { date: fmtDt(det.venta.created_at), user: det.venta.creado_por || '—' } }}</p>
        } @else {
          <p class="muted small">{{ 'crm.sales.origin' | translate: { file: det.venta.archivo || '—', date: fmtDt(det.venta.created_at), user: det.venta.creado_por || '—' } }}</p>
        }
        @if (historial().length) {
          <section class="hist" id="sale-history">
            <h3>{{ 'crm.sales.history' | translate }}</h3>
            <ol>
              @for (h of historial(); track h.id) {
                <li><mat-icon aria-hidden="true">{{ h.icon }}</mat-icon><span><strong>{{ h.titulo }}</strong>@if (h.detalle) { <br />{{ h.detalle }} }<br /><span class="muted small">{{ h.usuario }} · {{ h.fecha }}</span></span></li>
              }
            </ol>
          </section>
        }
        @if (anulando()) {
          <section class="annul" id="sale-annul">
            <p>{{ 'crm.sales.annul_msg' | translate }}</p>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.sales.annul_reason' | translate }}</mat-label>
              <input matInput id="sale-annul-reason" maxlength="255" autocomplete="off" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" (keydown.enter)="anular()" />
            </mat-form-field>
          </section>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (puedeEditar() && d(); as det) {
        @if (anulando()) {
          <button mat-button (click)="anulando.set(false)">{{ 'common.cancel' | translate }}</button>
          <button mat-flat-button class="danger" id="btn-sale-annul-ok" (click)="anular()" [disabled]="!motivo().trim() || ocupado()">{{ 'crm.sales.annul' | translate }}</button>
        } @else if (det.venta.activo) {
          <button mat-button class="danger-t" id="btn-sale-annul" (click)="anulando.set(true)"><mat-icon>block</mat-icon>{{ 'crm.sales.annul' | translate }}</button>
        } @else {
          <button mat-button id="btn-sale-restore" (click)="restaurar()" [disabled]="ocupado()"><mat-icon>restore</mat-icon>{{ 'crm.sales.restore' | translate }}</button>
        }
      }
      @if (!anulando()) { <button mat-button (click)="cerrar()">{{ 'common.close' | translate }}</button> }
    </mat-dialog-actions>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; gap: 12px 32px; margin: 0 0 12px; div { display: flex; flex-direction: column; } dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); } dd { margin: 0; } }
    .t { width: 100%; border-collapse: collapse; th, td { padding: 6px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; } .n { text-align: right; white-space: nowrap; } }
    .small { font: var(--mat-sys-body-small); } .link { color: var(--md-sys-color-primary); } .warn { color: var(--md-sys-color-error); }
    .hist { margin-top: 8px; h3 { margin: 0 0 4px; font: var(--mat-sys-title-small); color: var(--md-sys-color-on-surface-variant); }
      ol { list-style: none; margin: 0; padding: 0; } li { display: flex; gap: 10px; padding: 6px 0; overflow-wrap: anywhere; } mat-icon { flex: none; color: var(--md-sys-color-primary); } }
    .annul { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid var(--md-sys-color-error); p { margin: 0; } }
    .danger { --mat-button-filled-container-color: var(--md-sys-color-error); --mat-button-filled-label-text-color: var(--md-sys-color-on-error);
      background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); &[disabled] { opacity: 0.38; } }
    .danger-t { color: var(--md-sys-color-error); }
  `,
})
export class VentaDialogComponent {
  private id = inject<number>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<VentaDialogComponent, boolean>);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  private session = inject(SessionService);
  readonly cfg = inject(CrmConfigService);
  readonly d = signal<VentaDetalle | null>(null);
  readonly anulando = signal(false);
  readonly motivo = signal('');
  readonly ocupado = signal(false);
  private cambio = false;

  /** Registrada a mano (sin importación). */
  readonly manual = computed(() => !!this.d() && this.d()!.venta.id_importacion === null);
  readonly puedeEditar = computed(() => this.manual() && this.session.hasMinRole('L2'));
  readonly historial = computed(() => (this.d()?.historial ?? []).map(h => {
    const base = { id: h.id, usuario: h.usuario ?? '—', fecha: formatDateTime(h.created_at), detalle: '' };
    switch (h.accion) {
      case 'creado': return { ...base, icon: 'add_shopping_cart', titulo: this.i18n.t('crm.sales.h_creado') };
      case 'anulado': return { ...base, icon: 'block', titulo: this.i18n.t('crm.sales.h_anulado'), detalle: h.detalle?.motivo ? this.i18n.t('crm.hist.reason', { reason: h.detalle.motivo }) : '' };
      case 'restaurado': return { ...base, icon: 'restore', titulo: this.i18n.t('crm.sales.h_restaurado') };
      case 'reemplazado': return { ...base, icon: 'swap_horiz', titulo: this.i18n.t('crm.sales.h_reemplazado', { file: h.archivo || '#' + (h.detalle?.id_importacion ?? '') }) };
      default: return { ...base, icon: 'history', titulo: h.accion };
    }
  }));

  constructor() {
    // Esc o tocar fuera también cierran con el resultado (si se anuló o restauró, quien abrió recarga).
    this.ref.disableClose = true;
    this.ref.backdropClick().subscribe(() => this.cerrar());
    this.ref.keydownEvents().subscribe(e => { if (e.key === 'Escape') { e.preventDefault(); this.cerrar(); } });
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const r = await this.crm.getVenta(this.id);
    if (r.action && r.data) this.d.set(r.data);
  }

  async anular(): Promise<void> {
    const motivo = this.motivo().trim();
    if (!motivo || this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.crm.anularVenta(this.id, motivo));
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.sales.annul_error'), message: r.mensaje }); return; }
      this.cambio = true;
      this.anulando.set(false);
      this.motivo.set('');
      await this.cargar();
    } finally {
      this.ocupado.set(false);
    }
  }

  async restaurar(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.crm.restaurarVenta(this.id));
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.sales.restore_error'), message: r.mensaje }); return; }
      this.cambio = true;
      await this.cargar();
    } finally {
      this.ocupado.set(false);
    }
  }

  cerrar(): void { this.ref.close(this.cambio); }
  /** «código · categoría · sin ítem del catálogo», sin separadores sueltos cuando falta alguna parte. */
  detalleLinea(...partes: (string | null)[]): string { return partes.filter(x => !!x).join(' · '); }
  fmtNum(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 4 }); }
  fmt(s: string): string { return formatDate(s); }
  fmtDt(s: string): string { return formatDateTime(s); }
}

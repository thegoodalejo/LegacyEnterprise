import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmService, VentaDetalle } from '../../services/crm.service';
import { TranslatePipe } from '../../services/translation.service';
import { formatDate, formatDateTime } from './crm-format';

/** Detalle de una venta: cliente, documento, fecha, líneas y de qué importación vino. */
@Component({
  selector: 'app-venta-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatDialogModule, MatButton, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.sales.sale' | translate }} {{ d()?.venta?.documento || '' }}</h2>
    <mat-dialog-content>
      @if (d(); as det) {
        <dl class="head">
          <div><dt>{{ 'crm.opp.client' | translate }}</dt><dd><a class="link" [routerLink]="['/m/crm/contactos', det.venta.id_contacto]" mat-dialog-close>{{ det.venta.cliente }}</a></dd></div>
          <div><dt>{{ 'crm.sales.date' | translate }}</dt><dd>{{ fmt(det.venta.fecha) }}</dd></div>
          <div><dt>{{ 'crm.sales.total' | translate }}</dt><dd><strong>{{ cfg.money(det.venta.total) }}</strong></dd></div>
          @if (!det.venta.activo) { <div><dt>{{ 'crm.col.status' | translate }}</dt><dd class="warn">{{ 'crm.sales.inactive' | translate }}</dd></div> }
        </dl>
        <div class="table-scroll">
          <table class="t">
            <thead><tr><th>{{ 'crm.oreport.item' | translate }}</th><th class="n">{{ 'crm.opp.qty' | translate }}</th><th class="n">{{ 'crm.opp.price' | translate }}</th><th class="n">{{ 'crm.opp.total' | translate }}</th></tr></thead>
            <tbody>
              @for (l of det.lineas; track l.id) {
                <tr><td><strong>{{ l.nombre || '—' }}</strong><br /><span class="muted small">{{ l.codigo }}{{ l.categoria ? ' · ' + l.categoria : '' }}{{ l.id_item ? '' : ' · ' + ('crm.sales.no_item' | translate) }}</span></td>
                  <td class="n">{{ l.cantidad }}{{ l.unidad ? ' ' + l.unidad : '' }}</td><td class="n">{{ cfg.money(l.precio_unitario) }}</td><td class="n">{{ cfg.money(l.total) }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted small">{{ 'crm.sales.origin' | translate: { file: det.venta.archivo || '—', date: fmtDt(det.venta.created_at), user: det.venta.creado_por || '—' } }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>{{ 'common.close' | translate }}</button></mat-dialog-actions>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; gap: 12px 32px; margin: 0 0 12px; div { display: flex; flex-direction: column; } dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); } dd { margin: 0; } }
    .t { width: 100%; border-collapse: collapse; th, td { padding: 6px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; } .n { text-align: right; white-space: nowrap; } }
    .small { font: var(--mat-sys-body-small); } .link { color: var(--md-sys-color-primary); } .warn { color: var(--md-sys-color-error); }
  `,
})
export class VentaDialogComponent {
  private id = inject<number>(MAT_DIALOG_DATA);
  private crm = inject(CrmService);
  readonly cfg = inject(CrmConfigService);
  readonly d = signal<VentaDetalle | null>(null);

  constructor() {
    void this.crm.getVenta(this.id).then(r => { if (r.action && r.data) this.d.set(r.data); });
  }

  fmt(s: string): string { return formatDate(s); }
  fmtDt(s: string): string { return formatDateTime(s); }
}

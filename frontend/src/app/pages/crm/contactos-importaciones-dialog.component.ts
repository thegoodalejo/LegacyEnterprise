import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CrmService, Importacion } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime } from './crm-format';

/** Se cierra con el lote cuyos contactos se quieren ver (filtro «Importación» del listado), o con `true` si se revirtió alguno. */
export type ImportacionesContactosResult = { lote: { id: number; archivo: string } } | true;

/**
 * Importaciones de contactos de la sede (lotes): quién y cuándo, qué tipo, contadores, errores por fila, «Ver sus contactos» y «Revertir» (L2+:
 * archiva los contactos que ese lote creó; los que solo actualizó quedan igual).
 */
@Component({
  selector: 'app-contactos-importaciones-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButton, MatIcon, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.cimp.history_title' | translate }}</h2>
    <mat-dialog-content>
      <div class="imports" id="cimp-lotes">
        @for (i of lotes(); track i.id) {
          <article class="imp" [class.off]="i.estado === 'revertida'" [id]="'cimp-lote-' + i.id">
            <div class="imp-head">
              <mat-icon>{{ i.tipo_contacto === 'organizacion' ? 'business' : 'person' }}</mat-icon>
              <div class="imp-t"><strong>{{ i.archivo || ('#' + i.id) }}</strong><span class="muted small">{{ fmtDt(i.created_at) }} · {{ i.creado_por || '—' }} ·
                {{ (i.tipo_contacto === 'organizacion' ? 'crm.tipo.organizaciones' : 'crm.tipo.personas') | translate }}</span></div>
              <span class="state" [attr.data-estado]="i.estado">{{ 'crm.sales.st_' + i.estado | translate }}</span>
            </div>
            <div class="imp-n small">
              <span>{{ 'crm.cimp.i_new' | translate: { n: i.contactos_nuevos } }}</span>
              @if (i.contactos_actualizados) { <span>{{ 'crm.cimp.i_updated' | translate: { n: i.contactos_actualizados } }}</span> }
              @if (i.contactos_omitidos) { <span>{{ 'crm.cimp.i_skipped' | translate: { n: i.contactos_omitidos } }}</span> }
              @if (i.personas_creadas) { <span>{{ 'crm.cimp.i_people' | translate: { n: i.personas_creadas } }}</span> }
              @if (i.vinculos_creados) { <span>{{ 'crm.cimp.i_links' | translate: { n: i.vinculos_creados } }}</span> }
              <span [class.err]="i.filas_error > 0">{{ 'crm.sales.i_errors' | translate: { n: i.filas_error } }}</span>
            </div>
            @if (i.estado === 'revertida') { <span class="muted small">{{ 'crm.sales.reverted_by' | translate: { date: fmtDt(i.revertido_at!), user: i.revertido_por || '—' } }}</span> }
            <div class="imp-a">
              @if (i.errores.length) { <button mat-button (click)="verErrores(i)"><mat-icon>error_outline</mat-icon>{{ 'crm.sales.see_errors' | translate }}</button> }
              @if (i.contactos_nuevos || i.personas_creadas) { <button mat-button [id]="'btn-cimp-ver-' + i.id" (click)="ver(i)"><mat-icon>filter_list</mat-icon>{{ 'crm.cimp.see_contacts' | translate }}</button> }
              @if (puedeRevertir() && i.estado !== 'revertida') {
                <button mat-button class="danger-t" [id]="'btn-cimp-revert-' + i.id" (click)="revertir(i)"><mat-icon>undo</mat-icon>{{ 'crm.sales.revert' | translate }}</button>
              }
            </div>
          </article>
        } @empty { <p class="muted" id="cimp-lotes-empty">{{ 'crm.cimp.no_imports' | translate }}</p> }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button (click)="cerrar()">{{ 'common.close' | translate }}</button></mat-dialog-actions>
  `,
  styles: `
    .imports { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
    .imp { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.65; } }
    .imp-head { display: flex; align-items: center; gap: 12px; } .imp-t { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .state { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
      &[data-estado='revertida'] { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); } &[data-estado='procesando'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); } }
    .imp-n { display: flex; flex-wrap: wrap; gap: 4px 16px; } .imp-a { display: flex; flex-wrap: wrap; gap: 4px; }
    .err, .danger-t { color: var(--md-sys-color-error); } .small { font: var(--mat-sys-body-small); }
  `,
})
export class ContactosImportacionesDialogComponent {
  private ref = inject(MatDialogRef<ContactosImportacionesDialogComponent, ImportacionesContactosResult>);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  private session = inject(SessionService);

  readonly lotes = signal<Importacion[]>([]);
  readonly puedeRevertir = computed(() => this.session.hasMinRole('L2'));
  private revirtio = false;

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listImportaciones(1, 100, 'contactos'));
    if (r.action && r.data) this.lotes.set(r.data.importaciones);
  }

  fmtDt(s: string): string { return formatDateTime(s); }
  cerrar(): void { this.ref.close(this.revirtio || undefined); }
  ver(i: Importacion): void { this.ref.close({ lote: { id: i.id, archivo: i.archivo || '#' + i.id } }); }

  async verErrores(i: Importacion): Promise<void> {
    const lineas = i.errores.slice(0, 40).map(e => this.i18n.t('crm.imp.row', { n: e.fila }) + ': ' + e.motivo);
    if (i.errores.length > 40) lineas.push('…');
    await this.dialogs.info({ title: this.i18n.t('crm.sales.errors_of', { file: i.archivo || '#' + i.id }), message: lineas.join('\n') });
  }

  async revertir(i: Importacion): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('crm.sales.revert_title'), message: this.i18n.t('crm.cimp.revert_msg', { file: i.archivo || '#' + i.id, n: i.contactos_nuevos + i.personas_creadas }),
      confirmText: this.i18n.t('crm.sales.revert'), danger: true,
    });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.revertirImportacion(i.id));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.sales.revert_error'), message: r.mensaje }); return; }
    this.revirtio = true;
    await this.dialogs.success({ title: this.i18n.t('crm.sales.reverted'), message: this.i18n.t('crm.cimp.reverted_msg', { n: r.data.contactos_archivados ?? 0 }) });
    await this.cargar();
  }
}

/** Abre el historial de importaciones de contactos. */
export function abrirImportacionesContactos(matDialog: MatDialog): MatDialogRef<ContactosImportacionesDialogComponent, ImportacionesContactosResult> {
  return matDialog.open(ContactosImportacionesDialogComponent, { ...dialogSize('720px'), autoFocus: 'dialog' });
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmOppReportService } from '../../services/crm-opp-report.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { CampoConValor, CrmService, Etapa, NotaOp, OportunidadDetalle } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime, isoToDmy } from './crm-format';
import { HistorialDialogComponent } from './historial-dialog.component';
import { CierreDialogResult, OportunidadCierreDialogComponent, hoyIso } from './oportunidad-cierre-dialog.component';
import { abrirOportunidadDialog } from './oportunidad-dialog.component';

/** Editar el texto de una nota. */
@Component({
  selector: 'app-nota-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.opp.note_edit' | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'crm.opp.note' | translate }}</mat-label>
        <textarea matInput id="nota-texto" rows="5" maxlength="5000" [(ngModel)]="texto"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-nota" [mat-dialog-close]="texto.trim()" [disabled]="!texto.trim()">{{ 'common.save' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `.full { width: 100%; }`,
})
export class NotaDialogComponent {
  readonly d = inject<{ texto: string }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<NotaDialogComponent, string>);
  texto = this.d.texto;
}

/** Ficha de una oportunidad: datos, etapa, líneas, notas, etiquetas, campos personalizados, auditoría e historial. */
@Component({
  selector: 'app-oportunidad-perfil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatButton, MatIconButton, MatIcon, MatFormField, MatLabel, MatInput, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip, ExportMenuComponent, TagChipComponent, TranslatePipe],
  template: `
    <div class="page">
      @if (d(); as det) {
        @let o = det.oportunidad;
        <header class="head">
          <a mat-icon-button routerLink="/m/crm/oportunidades" [attr.aria-label]="'crm.opp.back' | translate"><mat-icon>arrow_back</mat-icon></a>
          <span class="avatar" aria-hidden="true"><mat-icon>trending_up</mat-icon></span>
          <div class="title">
            <h1 id="op-title">{{ o.titulo }}</h1>
            <div class="badges">
              <span class="pill stage" id="badge-stage"><span class="dot" [style.background]="o.etapa_color || 'var(--md-sys-color-outline)'"></span>{{ o.etapa_nombre }}</span>
              @if (o.estado !== 'abierta') { <span class="pill" [class.won]="o.estado === 'ganada'" [class.lost]="o.estado === 'perdida'" id="badge-status">{{ 'crm.opp.status_' + o.estado | translate }}</span> }
              @if (!o.activo) { <span class="pill warn" id="badge-archived">{{ 'crm.filters.archived_one' | translate }}</span> }
            </div>
          </div>
          <div class="actions">
            <app-export-menu [alcances]="alcanceFicha()" (exportar)="exportar($event)" />
            <button mat-flat-button id="btn-edit" (click)="edit()"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
            @if (o.activo) {
              <button mat-stroked-button id="btn-move" [matMenuTriggerFor]="moveMenu"><mat-icon>swap_horiz</mat-icon>{{ 'crm.opp.move_to' | translate }}</button>
              <mat-menu #moveMenu="matMenu">
                @for (e of det.etapas; track e.id) {
                  @if (e.id !== o.id_etapa && e.activo) { <button mat-menu-item [id]="'move-' + e.id" (click)="mover(e)"><mat-icon [style.color]="e.color || null">circle</mat-icon>{{ e.nombre }}</button> }
                }
              </mat-menu>
            }
            @if (canAudit()) {
              <button mat-icon-button id="btn-history" (click)="history()" [matTooltip]="'crm.hist.title' | translate" [attr.aria-label]="'crm.hist.title' | translate"><mat-icon>history</mat-icon></button>
              <button mat-icon-button id="btn-archive" (click)="toggleArchived()" [matTooltip]="(o.activo ? 'crm.opp.archive' : 'crm.restore') | translate" [attr.aria-label]="(o.activo ? 'crm.opp.archive' : 'crm.restore') | translate">
                <mat-icon>{{ o.activo ? 'inventory_2' : 'restore_from_trash' }}</mat-icon>
              </button>
            }
          </div>
        </header>

        <div class="grid">
          <section class="card">
            <h2>{{ 'crm.profile.data' | translate }}</h2>
            <dl>
              <div><dt>{{ 'crm.opp.client' | translate }}</dt><dd><a class="inline-link" id="op-client" [routerLink]="['/m/crm/contactos', o.id_contacto]">{{ o.contacto_nombre }}</a></dd></div>
              @if (o.id_persona_contacto) { <div><dt>{{ 'crm.opp.contact_person' | translate }}</dt><dd><a class="inline-link" [routerLink]="['/m/crm/contactos', o.id_persona_contacto]">{{ o.persona_nombre }}</a></dd></div> }
              <div><dt>{{ 'crm.form.responsable' | translate }}</dt><dd>{{ o.responsable_nombre || '—' }}</dd></div>
              <div><dt>{{ 'crm.opp.value' | translate }}</dt><dd id="op-value"><strong>{{ cfg.money(o.valor) }}</strong>
                @if (o.etapa_tipo === 'abierta') { <span class="muted small"> · {{ 'crm.opp.weighted' | translate }} {{ cfg.money(o.valor * o.etapa_probabilidad / 100) }} ({{ o.etapa_probabilidad }} %)</span> }</dd></div>
              <div><dt>{{ 'crm.opp.close_estimated' | translate }}</dt><dd>{{ o.fecha_cierre_estimada ? fmt(o.fecha_cierre_estimada) : '—' }}</dd></div>
              @if (o.estado !== 'abierta') {
                <div><dt>{{ 'crm.opp.closed_on' | translate }}</dt><dd>{{ o.fecha_cierre_real ? fmt(o.fecha_cierre_real) : '—' }}</dd></div>
                @if (o.motivo_nombre) { <div><dt>{{ 'crm.opp.close_reason' | translate }}</dt><dd id="op-reason">{{ o.motivo_nombre }}</dd></div> }
              }
              <div><dt>{{ 'crm.opp.in_stage_since' | translate }}</dt><dd>{{ fmtDt(o.etapa_desde) }}</dd></div>
              @if (o.descripcion) { <div><dt>{{ 'crm.opp.description' | translate }}</dt><dd class="pre">{{ o.descripcion }}</dd></div> }
            </dl>
          </section>

          @if (det.lineas.length) {
            <section class="card" id="op-lines">
              <h2>{{ 'crm.opp.lines' | translate }}</h2>
              @for (l of det.lineas; track l.id) {
                <div class="line">
                  <span class="lt"><strong>{{ l.item_nombre || l.descripcion }}</strong>
                    <span class="muted small">{{ l.item_codigo }}{{ l.item_codigo && l.item_unidad ? ' · ' : '' }}{{ l.item_unidad }}</span></span>
                  <span class="muted small">{{ l.cantidad }} × {{ cfg.money(l.precio_unitario) }}</span>
                  <strong>{{ cfg.money(l.total) }}</strong>
                </div>
              }
              <div class="line total"><span>{{ 'crm.opp.total' | translate }}</span><strong>{{ cfg.money(o.valor) }}</strong></div>
            </section>
          }

          <section class="card" id="op-notes">
            <h2>{{ 'crm.opp.notes' | translate }}</h2>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="full">
              <mat-label>{{ 'crm.opp.note_new' | translate }}</mat-label>
              <textarea matInput id="nota-nueva" rows="2" maxlength="5000" [ngModel]="nota()" (ngModelChange)="nota.set($event)"></textarea>
            </mat-form-field>
            <button mat-flat-button id="btn-add-nota" class="add" (click)="agregarNota()" [disabled]="!nota().trim()">{{ 'crm.opp.note_add' | translate }}</button>
            @for (n of det.notas; track n.id) {
              <article class="note">
                <p class="pre">{{ n.nota }}</p>
                <div class="meta muted small">{{ n.autor || '—' }} · {{ fmtDt(n.created_at) }}
                  @if (puedeEditar(n)) {
                    <button mat-icon-button (click)="editarNota(n)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button (click)="eliminarNota(n)" [attr.aria-label]="'common.delete' | translate"><mat-icon>delete</mat-icon></button>
                  }
                </div>
              </article>
            } @empty { <p class="muted">{{ 'crm.opp.no_notes' | translate }}</p> }
          </section>

          <section class="card">
            <div class="card-head">
              <h2>{{ 'crm.form.tags' | translate }}</h2>
              <button mat-button id="btn-edit-tags" (click)="editTags()"><mat-icon>label</mat-icon>{{ 'crm.form.edit_tags' | translate }}</button>
            </div>
            <div class="chips" id="profile-tags">
              @for (t of det.tags; track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> } @empty { <span class="muted">—</span> }
            </div>
          </section>

          @if (det.campos.length) {
            <section class="card">
              <h2>{{ 'crm.form.custom' | translate }}</h2>
              <dl id="profile-custom">@for (f of det.campos; track f.id) { <div><dt>{{ f.etiqueta }}</dt><dd>{{ valor(f) }}</dd></div> }</dl>
            </section>
          }
        </div>

        <footer class="audit muted small" id="audit-info">
          <span>{{ 'crm.profile.created' | translate: { date: fmtDt(o.created_at), user: o.creado_por_nombre || '—' } }}</span>
          <span>{{ 'crm.profile.modified' | translate: { date: fmtDt(o.updated_at), user: o.modificado_por_nombre || '—' } }}</span>
        </footer>
      } @else if (notFound()) {
        <div class="empty-state"><mat-icon>search_off</mat-icon><strong>{{ 'crm.opp.not_found' | translate }}</strong>
          <a mat-button routerLink="/m/crm/oportunidades">{{ 'crm.opp.back' | translate }}</a></div>
      }
    </div>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
    .avatar { width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; flex: none; background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
    .title { flex: 1 1 200px; min-width: 0; h1 { margin: 0; font: var(--mat-sys-headline-small); overflow-wrap: anywhere; } }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .pill.won { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .pill.lost, .pill.warn { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
    .card { padding: 20px; border-radius: 20px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .card h2 { margin: 0 0 4px; font: var(--mat-sys-title-medium); }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; } }
    dl { margin: 0; display: flex; flex-direction: column; gap: 10px; }
    dl > div { display: flex; flex-direction: column; }
    dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .pre { white-space: pre-wrap; margin: 0; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .line { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &.total { border: none; font: var(--mat-sys-title-small); grid-template-columns: 1fr auto; } }
    .lt { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
    .full { width: 100%; } .add { align-self: flex-end; }
    .note { padding: 8px 0; border-top: 1px solid var(--md-sys-color-outline-variant); }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .small { font: var(--mat-sys-body-small); } .inline-link { color: var(--md-sys-color-primary); }
    .audit { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 20px; }
  `,
})
export default class OportunidadPerfilPage {
  /** Parámetro :id de la ruta (component input binding). */
  readonly id = input<string>();
  private crm = inject(CrmService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private session = inject(SessionService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  private reportes = inject(CrmOppReportService);
  readonly alcanceFicha = computed(() => [{ id: 'ficha', etiqueta: this.i18n.t('crm.oreport.scope_sheet') }]);

  readonly d = signal<OportunidadDetalle | null>(null);
  readonly notFound = signal(false);
  readonly nota = signal('');
  readonly canAudit = computed(() => this.session.hasMinRole('L2'));

  constructor() {
    effect(() => {
      const id = Number(this.id());
      // untracked: load() usa LoadingService.wrap(), que lee sus propias señales (ver contacto-perfil.page.ts).
      if (id > 0) untracked(() => void this.load(id));
    });
  }

  async load(id = Number(this.id())): Promise<void> {
    this.notFound.set(false);
    const r = await this.loading.wrap(() => this.crm.getOportunidad(id));
    if (r.action && r.data) this.d.set(r.data);
    else { this.d.set(null); this.notFound.set(true); }
  }

  fmt(iso: string): string { return isoToDmy(iso); }
  fmtDt(s: string): string { return formatDateTime(s); }
  valor(f: CampoConValor): string {
    const v = f.valor;
    if (v === null || v === '') return '—';
    if (typeof v === 'boolean') return this.i18n.t(v ? 'common.yes' : 'common.no');
    return f.tipo_dato === 'fecha' ? isoToDmy(String(v)) : String(v);
  }
  puedeEditar(n: NotaOp): boolean { return this.canAudit() || n.id_autor === this.session.user()?.id; }

  async exportar(e: ExportSolicitud): Promise<void> {
    const det = this.d();
    if (det) await ejecutarExportacion(this, () => this.reportes.exportarFicha(det, e.formato));
  }

  edit(): void {
    const o = this.d()?.oportunidad;
    if (o) abrirOportunidadDialog(this.matDialog, { id: o.id }).afterClosed().subscribe(r => { if (r) void this.load(); });
  }

  async mover(e: Etapa): Promise<void> {
    const o = this.d()?.oportunidad;
    if (!o) return;
    let cierre: CierreDialogResult | undefined;
    if (e.tipo !== 'abierta') {
      cierre = await firstValueFrom(this.matDialog.open(OportunidadCierreDialogComponent, { ...dialogSize('480px'), data: { etapa: e, titulo: o.titulo }, autoFocus: 'first-tabbable' }).afterClosed());
      if (!cierre) return;
    }
    const r = await this.loading.wrap(() => this.crm.moveOportunidad({ id: o.id, idEtapa: e.id, idMotivo: cierre?.idMotivo, fechaCierre: cierre?.fechaCierre ?? (e.tipo === 'abierta' ? undefined : hoyIso()), nota: cierre?.nota }));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('crm.opp.move_error'), message: r.mensaje });
    await this.load();
  }

  // ─── Notas ─────────────────────────────────────────────────────────────────────────────────────────────────────
  async agregarNota(): Promise<void> {
    const o = this.d()?.oportunidad;
    if (!o || !this.nota().trim()) return;
    const r = await this.loading.wrap(() => this.crm.saveNota({ id: 0, id_oportunidad: o.id, nota: this.nota().trim() }));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.opp.note_error'), message: r.mensaje }); return; }
    this.nota.set('');
    await this.load();
  }

  async editarNota(n: NotaOp): Promise<void> {
    const texto = await firstValueFrom(this.matDialog.open(NotaDialogComponent, { ...dialogSize('480px'), data: { texto: n.nota }, autoFocus: 'first-tabbable' }).afterClosed()) as string | undefined;
    if (!texto) return;
    const r = await this.loading.wrap(() => this.crm.saveNota({ id: n.id, nota: texto }));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('crm.opp.note_error'), message: r.mensaje });
    await this.load();
  }

  async eliminarNota(n: NotaOp): Promise<void> {
    const ok = await this.dialogs.confirm({ title: this.i18n.t('crm.opp.note_delete_title'), message: this.i18n.t('crm.opp.note_delete_msg'), confirmText: this.i18n.t('common.delete'), danger: true });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.saveNota({ id: n.id, activo: 0 }));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('crm.opp.note_error'), message: r.mensaje });
    await this.load();
  }

  // ─── Etiquetas, historial y archivado ──────────────────────────────────────────────────────────────────────────
  editTags(): void {
    const det = this.d();
    if (!det) return;
    const actuales = det.tags.map(t => ({ id: t.id, nombre: t.nombre, color: t.color }));
    this.matDialog.open(TagPickerDialogComponent, { ...dialogSize('480px'), data: { seleccion: actuales.map(t => t.id), actuales, tipo: 'oportunidad' } })
      .afterClosed().subscribe(async (r: TagPickerResult | undefined) => {
        if (!r) return;
        const antes = new Set(actuales.map(t => t.id)), despues = new Set(r.ids);
        const agregar = r.ids.filter(x => !antes.has(x)), quitar = actuales.map(t => t.id).filter(x => !despues.has(x));
        const id = det.oportunidad.id;
        if (agregar.length) await this.loading.wrap(() => this.crm.bulkOportunidades('tags_agregar', { ids: [id] }, agregar));
        if (quitar.length) await this.loading.wrap(() => this.crm.bulkOportunidades('tags_quitar', { ids: [id] }, quitar));
        await this.load();
      });
  }

  history(): void {
    const o = this.d()?.oportunidad;
    if (o) this.matDialog.open(HistorialDialogComponent, { ...dialogSize('560px'), data: { id: o.id, nombre: o.titulo, tabla: 'crm_oportunidades' } });
  }

  async toggleArchived(): Promise<void> {
    const o = this.d()?.oportunidad;
    if (!o) return;
    const archivar = o.activo;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(archivar ? 'crm.opp.archive_title' : 'crm.opp.restore_title'), message: this.i18n.t(archivar ? 'crm.opp.archive_msg' : 'crm.opp.restore_msg', { name: o.titulo }),
      confirmText: this.i18n.t(archivar ? 'crm.opp.archive' : 'crm.restore'), danger: archivar,
    });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.bulkOportunidades(archivar ? 'archivar' : 'restaurar', { ids: [o.id] }));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: r.mensaje }); return; }
    if (archivar) await this.router.navigateByUrl('/m/crm/oportunidades');
    else await this.load();
  }
}

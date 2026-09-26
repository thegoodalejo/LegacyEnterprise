import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { ComunicacionesService, EnvioResultado, Linea, PlantillaCom, VariableDef } from '../../services/comunicaciones.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { WaPreviewComponent } from './wa-preview.component';

export interface EnviarPlantillaData { idConversacion?: number; idContacto?: number; contactoNombre: string; idLinea?: number }

export function abrirEnviarPlantilla(dialog: MatDialog, data: EnviarPlantillaData) {
  return dialog.open<EnviarPlantillaDialogComponent, EnviarPlantillaData, EnvioResultado>(EnviarPlantillaDialogComponent, { ...dialogSize('720px'), data, autoFocus: false });
}

/** Etiqueta de dónde sale el valor de una variable automática (para la vista previa). */
export function etiquetaOrigen(t: (k: string) => string, v: VariableDef): string {
  if (v.origen === 'fijo') return v.valor ?? '';
  if (v.origen.startsWith('campo:')) return `[${t('com.tpl.origin.campo')}]`;
  return `[${t('com.tpl.origin.' + v.origen)}]`;
}

/**
 * Enviar una plantilla aprobada a un contacto: la forma de escribirle fuera de la ventana de 24 h o de iniciar la conversación.
 * Pide solo lo que el sistema no puede completar solo: variables «a mano», el destino del enlace de seguimiento y el archivo del encabezado.
 */
@Component({
  selector: 'app-enviar-plantilla-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatFormField, MatLabel, MatHint, MatIcon, MatInput,
    MatSelect, MatOption, WaPreviewComponent, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'com.send_tpl.title' | translate: { name: data.contactoNombre } }}</h2>
    <mat-dialog-content>
      <div class="layout">
        <div class="form-grid">
          @if (!data.idConversacion && lineas().length > 1) {
            <mat-form-field appearance="outline">
              <mat-label>{{ 'com.line' | translate }}</mat-label>
              <mat-select id="send-tpl-line" [ngModel]="idLinea()" (ngModelChange)="cambiarLinea($event)">
                @for (l of lineas(); track l.id) { <mat-option [value]="l.id">{{ l.nombre }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'com.send_tpl.template' | translate }}</mat-label>
            <mat-select id="send-tpl-select" [ngModel]="tpl()?.id ?? null" (ngModelChange)="elegir($event)">
              @for (p of plantillas(); track p.id) {
                <mat-option [value]="p.id">{{ p.nombre }} · {{ 'com.tpl.cat.' + (p.categoria || p.categoria_solicitada) | translate }} · {{ p.creditos }} {{ 'com.credits_short' | translate }}</mat-option>
              }
            </mat-select>
            @if (!cargando() && !plantillas().length) { <mat-hint>{{ 'com.send_tpl.none' | translate }}</mat-hint> }
          </mat-form-field>

          @if (tpl(); as p) {
            @if (p.encabezado?.variable?.origen === 'manual') {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'com.send_tpl.header_var' | translate }}</mat-label>
                <input matInput id="send-tpl-h1" [ngModel]="valores()['h1'] ?? ''" (ngModelChange)="setValor('h1', $event)" [placeholder]="p.encabezado?.variable?.ejemplo ?? ''" maxlength="60" />
              </mat-form-field>
            }
            @for (v of manuales(); track v.n) {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'com.send_tpl.var' | translate: { n: v.n } }}</mat-label>
                <input matInput [id]="'send-tpl-var-' + v.n" [ngModel]="valores()[v.n] ?? ''" (ngModelChange)="setValor(v.n, $event)" [placeholder]="v.ejemplo" maxlength="500" />
                @if (v.defecto) { <mat-hint>{{ 'com.send_tpl.default' | translate: { v: v.defecto } }}</mat-hint> }
              </mat-form-field>
            }
            @if (tieneEnlace()) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'com.send_tpl.link' | translate }}</mat-label>
                <input matInput id="send-tpl-link" type="url" [ngModel]="destino()" (ngModelChange)="destino.set($event)" placeholder="https://" maxlength="1000" />
                <mat-hint>{{ 'com.send_tpl.link_hint' | translate }}</mat-hint>
              </mat-form-field>
            }
            @if (p.encabezado && p.encabezado.tipo !== 'texto') {
              <div class="file">
                <button mat-stroked-button type="button" (click)="fileInput.click()"><mat-icon>attach_file</mat-icon>{{ 'com.send_tpl.file_' + p.encabezado.tipo | translate }}</button>
                <span class="muted">{{ archivo()?.name || ('com.send_tpl.no_file' | translate) }}</span>
                <input #fileInput type="file" hidden [accept]="accept(p.encabezado.tipo)" (change)="elegirArchivo($event)" />
              </div>
            }
            <p class="muted small">{{ 'com.send_tpl.cost' | translate: { n: p.creditos ?? 1 } }}</p>
          }
        </div>
        @if (tpl(); as p) {
          <app-wa-preview [encabezadoTipo]="p.encabezado?.tipo ?? 'ninguno'" [encabezadoTexto]="encabezadoPreview()" [cuerpo]="cuerpoPreview()" [pie]="p.pie"
                          [botones]="p.botones" [mediaUrl]="mediaUrl()" [mediaNombre]="archivo()?.name ?? null" />
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-send-tpl" [disabled]="!tpl() || enviando()" (click)="enviar()"><mat-icon>send</mat-icon>{{ 'com.send_tpl.send' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 280px); gap: 24px; align-items: start; }
    @media (max-width: 719px) { .layout { grid-template-columns: 1fr; } }
    .file { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .small { font: var(--mat-sys-body-small); margin: 0; }
  `,
})
export class EnviarPlantillaDialogComponent {
  readonly data = inject<EnviarPlantillaData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<EnviarPlantillaDialogComponent, EnvioResultado>);
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly lineas = signal<Linea[]>([]);
  readonly idLinea = signal<number | null>(this.data.idLinea ?? null);
  readonly plantillas = signal<PlantillaCom[]>([]);
  readonly tpl = signal<PlantillaCom | null>(null);
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly archivo = signal<File | null>(null);
  readonly mediaUrl = signal<string | null>(null);
  readonly valores = signal<Record<string, string>>({});
  readonly destino = signal('');

  readonly manuales = computed(() => (this.tpl()?.variables ?? []).filter(v => v.origen === 'manual'));
  readonly tieneEnlace = computed(() => (this.tpl()?.botones ?? []).some(b => b.tipo === 'enlace' && !b.externa));
  readonly cuerpoPreview = computed(() => {
    const p = this.tpl();
    const vals = this.valores();
    if (!p) return '';
    const t = (k: string) => this.i18n.t(k);
    return p.cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const v = p.variables.find(x => x.n === Number(n));
      if (!v) return '';
      return v.origen === 'manual' ? (vals[n] || `[${v.ejemplo}]`) : etiquetaOrigen(t, v);
    });
  });
  readonly encabezadoPreview = computed(() => {
    const e = this.tpl()?.encabezado;
    const vals = this.valores();
    if (!e || e.tipo !== 'texto') return null;
    const v = e.variable;
    return (e.texto ?? '').replace(/\{\{\s*1\s*\}\}/, v ? (v.origen === 'manual' ? (vals['h1'] || `[${v.ejemplo}]`) : etiquetaOrigen(k => this.i18n.t(k), v)) : '');
  });

  constructor() {
    void this.init();
  }

  setValor(k: string | number, v: string): void { this.valores.update(o => ({ ...o, [String(k)]: v })); }

  private async init(): Promise<void> {
    if (!this.data.idConversacion) {
      const r = await this.com.listLineasSede();
      if (r.action && r.data) {
        this.lineas.set(r.data.lineas);
        if (!this.idLinea() && r.data.lineas.length) this.idLinea.set(r.data.lineas[0].id);
      }
    }
    await this.cargarPlantillas();
  }

  private async cargarPlantillas(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.com.listPlantillas({ enviables: true, idLinea: this.data.idConversacion ? this.data.idLinea ?? null : this.idLinea() });
      this.plantillas.set(r.action && r.data ? r.data.plantillas : []);
      if (this.plantillas().length === 1) this.elegir(this.plantillas()[0].id);
    } finally { this.cargando.set(false); }
  }

  cambiarLinea(id: number): void { this.idLinea.set(id); this.tpl.set(null); void this.cargarPlantillas(); }

  elegir(id: number): void {
    this.tpl.set(this.plantillas().find(p => p.id === id) ?? null);
    this.valores.set({});
    this.elegirArchivoNulo();
  }

  accept(tipo: string): string { return tipo === 'imagen' ? 'image/jpeg,image/png' : tipo === 'video' ? 'video/mp4' : 'application/pdf'; }

  elegirArchivo(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.archivo.set(f);
    if (this.mediaUrl()) URL.revokeObjectURL(this.mediaUrl()!);
    this.mediaUrl.set(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  }
  private elegirArchivoNulo(): void { this.archivo.set(null); this.mediaUrl.set(null); }

  async enviar(): Promise<void> {
    const p = this.tpl();
    if (!p) return;
    this.enviando.set(true);
    try {
      const r = await this.com.enviarPlantilla({
        idPlantilla: p.id, idConversacion: this.data.idConversacion, idContacto: this.data.idConversacion ? undefined : this.data.idContacto,
        idLinea: this.data.idConversacion ? undefined : this.idLinea() ?? undefined, valores: this.valores(), destino: this.destino().trim(),
      }, this.archivo());
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.send_tpl.error'), message: r.mensaje }); return; }
      if (!r.data.ok) { await this.dialogs.error({ title: this.i18n.t('com.send_tpl.error'), message: r.data.error ?? r.mensaje }); }
      this.ref.close(r.data);
    } catch {
      await this.dialogs.error({ title: this.i18n.t('com.send_tpl.error'), message: this.i18n.t('common.error') });
    } finally { this.enviando.set(false); }
  }
}

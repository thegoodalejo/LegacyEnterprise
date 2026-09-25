import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { CamposFormComponent } from '../../components/campos-form.component';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { DateInputComponent } from '../../components/date-input.component';
import { ItemPickerComponent } from '../../components/item-picker.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CampoDef, CrmService, CrmTag, Embudo, ItemCatalogo, OportunidadDetalle, TipoContacto, UsuarioSede, ValorCampo } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

export interface OportunidadDialogData {
  /** Editar esta oportunidad; sin id se crea una. */
  id?: number;
  /** Contacto ya elegido (al crear desde su perfil). */
  contacto?: { id: number; nombre: string; tipo: TipoContacto };
  /** Etapa donde arranca (al crear desde una columna del tablero). */
  idEtapa?: number;
}
export interface OportunidadDialogResult { id: number }

interface LineaEdit { key: number; id_item: number | null; nombre: string; unidad: string | null; descripcion: string; cantidad: string; precio: string }
interface ContactoElegido { id: number; nombre: string }

/** Número desde lo que se escribe (acepta coma decimal); 0 si no es un número. */
const num = (s: string): number => {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Crear o editar una oportunidad: título, cliente (Organización o Persona) y persona de contacto, responsable, fecha de cierre estimada,
 * líneas del catálogo (o descripción libre) cuyo total es el valor, campos personalizados y etiquetas. El cambio de etapa va aparte.
 */
@Component({
  selector: 'app-oportunidad-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButton, MatIconButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatHint, MatLabel, MatIcon, MatInput,
    MatSelect, MatOption, CamposFormComponent, ContactoPickerComponent, DateInputComponent, ItemPickerComponent, TagChipComponent, TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ (d.id ? 'crm.opp.edit' : 'crm.opp.new') | translate }}</h2>
    <mat-dialog-content>
      @if (!loaded()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
      @else if (sinEmbudo()) { <div class="empty-state"><mat-icon>filter_alt_off</mat-icon><span>{{ 'crm.opp.no_funnel' | translate }}</span></div> }
      @else {
        <div class="form">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.opp.title_field' | translate }}</mat-label>
            <input matInput id="op-titulo" [(ngModel)]="titulo" maxlength="190" required />
          </mat-form-field>

          <section class="block">
            <h3>{{ 'crm.opp.client' | translate }}</h3>
            @if (contacto(); as c) {
              <div class="chips"><span class="pill" id="op-contacto-chip">{{ c.nombre }}</span>
                <button mat-icon-button type="button" (click)="quitarContacto()" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button></div>
            } @else {
              <mat-button-toggle-group [value]="tipoBusqueda()" (change)="tipoBusqueda.set($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'crm.opp.client' | translate">
                <mat-button-toggle value="organizacion">{{ 'crm.tipo.organizacion' | translate }}</mat-button-toggle>
                <mat-button-toggle value="persona">{{ 'crm.tipo.persona' | translate }}</mat-button-toggle>
              </mat-button-toggle-group>
              <app-contacto-picker [tipo]="tipoBusqueda()" inputId="op-contacto" [label]="'crm.opp.client_search' | translate" (picked)="elegirContacto($event.id, $event.nombre_completo, $event.tipo)" />
            }
            <h3>{{ 'crm.opp.contact_person' | translate }}</h3>
            @if (persona(); as p) {
              <div class="chips"><span class="pill">{{ p.nombre }}</span>
                <button mat-icon-button type="button" (click)="persona.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button></div>
            } @else {
              <app-contacto-picker tipo="persona" inputId="op-persona" [label]="'crm.opp.person_search' | translate" (picked)="persona.set({ id: $event.id, nombre: $event.nombre_completo })" />
            }
          </section>

          <div class="row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.filters.owner' | translate }}</mat-label>
              <mat-select id="op-responsable" [(ngModel)]="responsable">
                <mat-option [value]="null">—</mat-option>
                @for (u of responsables(); track u.id) { <mat-option [value]="u.id">{{ u.nombre }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <app-date-input [label]="'crm.opp.close_estimated' | translate" [value]="fechaCierre()" (valueChange)="fechaCierre.set($event)" />
            @if (!d.id) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.opp.stage' | translate }}</mat-label>
                <mat-select id="op-etapa" [ngModel]="idEtapa()" (ngModelChange)="idEtapa.set($event)">
                  @for (o of opcionesEtapa(); track o.id) { <mat-option [value]="o.id">{{ o.texto }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
          </div>

          <section class="block">
            <h3>{{ 'crm.opp.lines' | translate }}</h3>
            <div class="row">
              <app-item-picker inputId="op-item" [label]="'crm.opp.add_item' | translate" (picked)="agregarItem($event)" />
              <button mat-stroked-button type="button" id="btn-add-free-line" (click)="agregarLibre()"><mat-icon>add</mat-icon>{{ 'crm.opp.add_free' | translate }}</button>
            </div>
            @for (l of lineas(); track l.key; let i = $index) {
              <div class="line">
                @if (l.id_item) {
                  <div class="lname"><strong>{{ l.nombre }}</strong>@if (l.unidad) { <span class="muted small">{{ l.unidad }}</span> }</div>
                } @else {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="lname">
                    <mat-label>{{ 'crm.opp.line_desc' | translate }}</mat-label>
                    <input matInput [id]="'linea-desc-' + i" maxlength="255" [ngModel]="l.descripcion" (ngModelChange)="setLinea(l.key, { descripcion: $event })" />
                  </mat-form-field>
                }
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="lnum">
                  <mat-label>{{ 'crm.opp.qty' | translate }}</mat-label>
                  <input matInput [id]="'linea-cant-' + i" inputmode="decimal" [ngModel]="l.cantidad" (ngModelChange)="setLinea(l.key, { cantidad: $event })" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="lnum">
                  <mat-label>{{ 'crm.opp.price' | translate }}</mat-label>
                  <input matInput [id]="'linea-precio-' + i" inputmode="decimal" [ngModel]="l.precio" (ngModelChange)="setLinea(l.key, { precio: $event })" />
                </mat-form-field>
                <span class="ltotal">{{ cfg.money(totalLinea(l)) }}</span>
                <button mat-icon-button type="button" (click)="quitarLinea(l.key)" [attr.aria-label]="'common.delete' | translate"><mat-icon>delete</mat-icon></button>
              </div>
            }
          </section>

          @if (lineas().length) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.opp.value' | translate }}</mat-label>
              <input matInput id="op-valor" [value]="cfg.money(totalLineas())" disabled />
              <mat-hint>{{ 'crm.opp.value_from_lines' | translate }}</mat-hint>
            </mat-form-field>
          } @else {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.opp.value' | translate }}</mat-label>
              <input matInput id="op-valor" inputmode="decimal" [(ngModel)]="valor" />
              <mat-hint>{{ cfg.money(num(valor)) }}</mat-hint>
            </mat-form-field>
          }

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'crm.opp.description' | translate }}</mat-label>
            <textarea matInput id="op-descripcion" rows="3" maxlength="5000" [(ngModel)]="descripcion"></textarea>
          </mat-form-field>

          @if (campos().length) {
            <section class="block">
              <h3>{{ 'crm.form.custom' | translate }}</h3>
              <app-campos-form [campos]="campos()" [(valores)]="vals" />
            </section>
          }
          <section class="block">
            <h3>{{ 'crm.form.tags' | translate }}</h3>
            <div class="chips">
              @for (t of tags(); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }
              <button mat-button type="button" id="btn-pick-tags" (click)="pickTags()"><mat-icon>label</mat-icon>{{ 'crm.form.edit_tags' | translate }}</button>
            </div>
          </section>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-op" (click)="save()" [disabled]="saving() || !canSave()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
    .block { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    h3 { margin: 0; font: var(--mat-sys-title-small); color: var(--md-sys-color-on-surface-variant); }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; > * { flex: 1 1 200px; min-width: 0; } > button { flex: 0 0 auto; } }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .pill { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-large); overflow-wrap: anywhere; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--md-sys-color-outline-variant); }
    .lname { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
    .lnum { flex: 0 1 120px; }
    .ltotal { flex: 0 1 130px; text-align: right; font: var(--mat-sys-label-large); }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export class OportunidadDialogComponent {
  readonly d = inject<OportunidadDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<OportunidadDialogComponent, OportunidadDialogResult>);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  readonly num = num;

  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly embudos = signal<Embudo[]>([]);
  readonly responsables = signal<UsuarioSede[]>([]);
  private readonly camposDef = signal<CampoDef[]>([]);
  readonly campos = computed(() => this.camposDef().filter(c => c.activo));
  readonly sinEmbudo = computed(() => this.loaded() && !this.d.id && !this.opcionesEtapa().length);

  titulo = '';
  readonly contacto = signal<ContactoElegido | null>(null);
  readonly tipoBusqueda = signal<TipoContacto>('organizacion');
  readonly persona = signal<ContactoElegido | null>(null);
  responsable: number | null = null;
  readonly fechaCierre = signal<string | null>(null);
  readonly idEtapa = signal<number | null>(null);
  valor = '';
  descripcion = '';
  readonly lineas = signal<LineaEdit[]>([]);
  vals = signal<Record<number, string>>({});
  readonly tags = signal<CrmTag[]>([]);
  private nextKey = 1;

  /** Etapas abiertas y activas de los embudos activos (con el nombre del embudo si hay más de uno). */
  readonly opcionesEtapa = computed(() => {
    const varios = this.embudos().length > 1;
    return this.embudos().flatMap(e => e.etapas.filter(t => t.activo && t.tipo === 'abierta').map(t => ({ id: t.id, texto: varios ? `${e.nombre} · ${t.nombre}` : t.nombre })));
  });
  readonly totalLineas = computed(() => r2(this.lineas().reduce((s, l) => s + this.totalLinea(l), 0)));

  constructor() {
    if (this.d.contacto) this.contacto.set({ id: this.d.contacto.id, nombre: this.d.contacto.nombre });
    void this.load();
  }

  private async load(): Promise<void> {
    const [emb, resp, camp] = await this.loading.wrap(() => Promise.all([this.crm.listEmbudos(true), this.crm.listResponsables(), this.crm.listCampos(true, 'oportunidad')]));
    if (emb.action && emb.data) this.embudos.set(emb.data.embudos);
    if (resp.action && resp.data) this.responsables.set(resp.data.usuarios);
    if (camp.action && camp.data) this.camposDef.set(camp.data.campos);
    if (this.d.id) {
      const r = await this.loading.wrap(() => this.crm.getOportunidad(this.d.id!));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.opp.load_error'), message: r.mensaje }); this.ref.close(); return; }
      this.llenar(r.data);
    } else {
      this.idEtapa.set(this.d.idEtapa ?? this.opcionesEtapa()[0]?.id ?? null);
      if (this.d.contacto) void this.personaPorDefecto(this.d.contacto.id);
    }
    this.loaded.set(true);
  }

  private llenar(det: OportunidadDetalle): void {
    const o = det.oportunidad;
    this.titulo = o.titulo;
    this.contacto.set({ id: o.id_contacto, nombre: o.contacto_nombre });
    this.persona.set(o.id_persona_contacto ? { id: o.id_persona_contacto, nombre: o.persona_nombre ?? '' } : null);
    this.responsable = o.id_responsable;
    this.fechaCierre.set(o.fecha_cierre_estimada);
    this.valor = o.valor ? String(o.valor) : '';
    this.descripcion = o.descripcion ?? '';
    this.lineas.set(det.lineas.map(l => ({
      key: this.nextKey++, id_item: l.id_item, nombre: l.item_nombre ?? '', unidad: l.item_unidad ?? null, descripcion: l.descripcion ?? '',
      cantidad: String(l.cantidad), precio: String(l.precio_unitario),
    })));
    this.tags.set(det.tags.map(t => ({ id: t.id, nombre: t.nombre, color: t.color })));
    const v: Record<number, string> = {};
    for (const f of det.campos) if (f.valor !== null) v[f.id] = this.aTexto(f.valor);
    this.vals.set(v);
    this.camposDef.update(defs => defs.concat(det.campos.filter(f => !f.activo && f.valor !== null && !defs.some(x => x.id === f.id)).map(f => ({
      id: f.id, aplica_a: 'oportunidad', clave: f.clave, etiqueta: f.etiqueta, tipo_dato: f.tipo_dato, obligatorio: f.obligatorio, orden: 999, activo: true,
    }))));
  }

  private aTexto(v: ValorCampo): string { return typeof v === 'boolean' ? String(v) : String(v ?? ''); }

  // ─── Cliente y persona de contacto ─────────────────────────────────────────────────────────────────────────────
  elegirContacto(id: number, nombre: string, tipo: TipoContacto): void {
    this.contacto.set({ id, nombre });
    if (tipo === 'organizacion') void this.personaPorDefecto(id);
  }

  quitarContacto(): void { this.contacto.set(null); }

  /** Al elegir una organización sin persona de contacto, se propone la persona principal de sus vínculos. */
  private async personaPorDefecto(idOrg: number): Promise<void> {
    if (this.persona()) return;
    const r = await this.crm.getContacto(idOrg);
    const p = r.action && r.data ? r.data.vinculos.find(v => v.principal) : undefined;
    if (p && !this.persona()) this.persona.set({ id: p.id, nombre: p.nombre_completo });
  }

  // ─── Líneas ────────────────────────────────────────────────────────────────────────────────────────────────────
  agregarItem(i: ItemCatalogo): void {
    this.lineas.update(l => [...l, { key: this.nextKey++, id_item: i.id, nombre: i.nombre, unidad: i.unidad, descripcion: '', cantidad: '1', precio: i.precio_ref !== null ? String(i.precio_ref) : '0' }]);
  }
  agregarLibre(): void {
    this.lineas.update(l => [...l, { key: this.nextKey++, id_item: null, nombre: '', unidad: null, descripcion: '', cantidad: '1', precio: '0' }]);
  }
  setLinea(key: number, patch: Partial<LineaEdit>): void { this.lineas.update(l => l.map(x => (x.key === key ? { ...x, ...patch } : x))); }
  quitarLinea(key: number): void { this.lineas.update(l => l.filter(x => x.key !== key)); }
  totalLinea(l: LineaEdit): number { return r2(num(l.cantidad) * num(l.precio)); }

  // ─── Etiquetas ─────────────────────────────────────────────────────────────────────────────────────────────────
  pickTags(): void {
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'), data: { seleccion: this.tags().map(t => t.id), actuales: this.tags(), tipo: 'oportunidad' },
    }).afterClosed().subscribe((res: TagPickerResult | undefined) => { if (res) this.tags.set(res.tags); });
  }

  // ─── Guardar ───────────────────────────────────────────────────────────────────────────────────────────────────
  canSave(): boolean {
    if (!this.loaded() || !this.titulo.trim() || !this.contacto()) return false;
    if (!this.d.id && this.idEtapa() === null) return false;
    return this.lineas().every(l => (l.id_item || l.descripcion.trim()) && num(l.cantidad) > 0);
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      const campos: Record<number, string> = {};
      for (const c of this.campos()) campos[c.id] = this.vals()[c.id] ?? '';
      const payload: Record<string, unknown> = {
        id: this.d.id ?? 0, titulo: this.titulo.trim(), id_contacto: this.contacto()!.id, id_persona_contacto: this.persona()?.id ?? '',
        id_responsable: this.responsable ?? '', fecha_cierre_estimada: this.fechaCierre() ?? '', descripcion: this.descripcion.trim(),
        valor: this.lineas().length ? '' : String(num(this.valor)),
        lineas: this.lineas().map(l => ({ id_item: l.id_item, descripcion: l.id_item ? '' : l.descripcion.trim(), cantidad: num(l.cantidad), precio_unitario: num(l.precio) })),
        campos, tag_ids: this.tags().map(t => t.id),
      };
      if (!this.d.id) payload['id_etapa'] = this.idEtapa();
      const r = await this.crm.saveOportunidad(payload);
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.opp.save_error'), message: r.mensaje }); return; }
      this.ref.close({ id: r.data.id });
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.opp.save_error'), message: this.i18n.t('common.error') });
    } finally {
      this.saving.set(false);
    }
  }
}

/** Abre el formulario de oportunidad con el tamaño estándar. */
export function abrirOportunidadDialog(matDialog: MatDialog, data: OportunidadDialogData): MatDialogRef<OportunidadDialogComponent, OportunidadDialogResult> {
  return matDialog.open(OportunidadDialogComponent, { ...dialogSize('960px'), data, autoFocus: 'first-tabbable' });
}

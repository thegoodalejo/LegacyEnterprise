import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { GeoPickerDialogComponent, GeoPickerData, GeoPickerResult } from '../../components/geo-picker-dialog.component';
import { DateInputComponent } from '../../components/date-input.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import {
  Advertencia, CampoDef, ContactoDetalle, ContactoFila, CrmService, CrmTag, PersonaRef, RolVinculo, TipoContacto, UsuarioSede, ValorCampo,
} from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatCoords, mapsUrl } from './crm-format';

export interface ContactoDialogData { id?: number; tipo?: TipoContacto }
export interface ContactoDialogResult { id: number; advertencias: Advertencia[] }

interface RefItem {
  key: number; id_persona?: number; nuevo?: NonNullable<PersonaRef['nuevo']>; nombre: string; id_rol: number | null; principal: boolean;
}

const DOC_PERSONA = ['CC', 'CE', 'TI', 'PAS', 'OTRO'];
const DOC_ORG = ['NIT', 'OTRO'];

/** Crear o editar una Persona o una Organización. Una organización necesita al menos una persona de referencia. */
@Component({
  selector: 'app-contacto-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButton, MatIconButton, MatFormField, MatLabel, MatPrefix,
    MatIcon, MatInput, MatSelect, MatOption, ContactoPickerComponent, DateInputComponent, TagChipComponent, TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ title() | translate }}</h2>
    <mat-dialog-content>
      @if (loaded()) {
        <div class="form-grid">
          @if (esPersona()) {
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.nombres' | translate }}</mat-label>
                <input matInput id="f-nombres" [(ngModel)]="nombres" maxlength="100" required />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.apellidos' | translate }}</mat-label>
                <input matInput id="f-apellidos" [(ngModel)]="apellidos" maxlength="100" />
              </mat-form-field>
            </div>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.doc_type' | translate }}</mat-label>
                <mat-select [(ngModel)]="docTipo">
                  <mat-option value="">—</mat-option>
                  @for (t of docTipos(); track t) { <mat-option [value]="t">{{ t }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.doc_number' | translate }}</mat-label>
                <input matInput id="f-doc" [(ngModel)]="docNumero" maxlength="40" />
              </mat-form-field>
            </div>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.correo' | translate }}</mat-label>
                <input matInput id="f-correo" type="email" [(ngModel)]="correo" maxlength="190" />
              </mat-form-field>
              <app-date-input [label]="'crm.form.nacimiento' | translate" [(value)]="fechaNac" />
            </div>
            <div class="form-row">
              <mat-form-field appearance="outline" class="ind">
                <mat-label>{{ 'crm.form.wa_prefix' | translate }}</mat-label>
                <span matTextPrefix>+</span>
                <input matInput inputmode="numeric" [(ngModel)]="waInd" maxlength="6" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.whatsapp' | translate }}</mat-label>
                <input matInput id="f-wa" inputmode="tel" [(ngModel)]="waNum" maxlength="20" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.telefono' | translate }}</mat-label>
                <input matInput id="f-tel" inputmode="tel" [(ngModel)]="telefono" maxlength="30" />
              </mat-form-field>
            </div>
          } @else {
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.form.razon_social' | translate }}</mat-label>
              <input matInput id="f-razon" [(ngModel)]="razonSocial" maxlength="190" required />
            </mat-form-field>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.doc_type' | translate }}</mat-label>
                <mat-select [(ngModel)]="docTipo">
                  <mat-option value="">—</mat-option>
                  @for (t of docTipos(); track t) { <mat-option [value]="t">{{ t }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.doc_number_org' | translate }}</mat-label>
                <input matInput id="f-doc" [(ngModel)]="docNumero" maxlength="40" />
              </mat-form-field>
            </div>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.correo_fact' | translate }}</mat-label>
                <input matInput id="f-correo" type="email" [(ngModel)]="correoFact" maxlength="190" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'crm.form.telefono' | translate }}</mat-label>
                <input matInput id="f-tel" inputmode="tel" [(ngModel)]="telefono" maxlength="30" />
              </mat-form-field>
            </div>
          }

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.form.direccion' | translate }}</mat-label>
              <input matInput [(ngModel)]="direccion" maxlength="255" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.form.ciudad' | translate }}</mat-label>
              <input matInput [(ngModel)]="ciudad" maxlength="100" />
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.form.responsable' | translate }}</mat-label>
            <mat-select [(ngModel)]="responsable">
              <mat-option [value]="null">—</mat-option>
              @for (u of responsables(); track u.id) { <mat-option [value]="u.id">{{ u.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>

          <section class="block" id="location-block">
            <h3>{{ 'crm.form.location' | translate }}</h3>
            @if (lat() !== null && lng() !== null) {
              <div class="ref-row">
                <mat-icon>location_on</mat-icon>
                <span class="ref-name" id="location-coords">{{ coordsLabel() }}</span>
                <a mat-button [href]="urlMapa()" target="_blank" rel="noopener" id="location-open">{{ 'crm.form.open_in_maps' | translate }}</a>
                <button mat-button type="button" id="btn-pick-location" (click)="pickLocation()">{{ 'crm.form.change_location' | translate }}</button>
                <button mat-button type="button" id="btn-clear-location" (click)="clearLocation()">{{ 'crm.form.remove_location' | translate }}</button>
              </div>
            } @else {
              <div>
                <button mat-stroked-button type="button" id="btn-pick-location" (click)="pickLocation()"><mat-icon>add_location_alt</mat-icon>{{ 'crm.form.pick_on_map' | translate }}</button>
              </div>
            }
          </section>

          @if (!esPersona()) {
            <section class="block" id="parent-block">
              <h3>{{ 'crm.form.parent' | translate }}</h3>
              <p class="muted small">{{ 'crm.form.parent_hint' | translate }}</p>
              @if (padre(); as p) {
                <div class="ref-row">
                  <mat-icon>account_tree</mat-icon>
                  <strong class="ref-name" id="parent-name">{{ p.nombre }}</strong>
                  <button mat-button type="button" id="btn-parent-clear" (click)="padre.set(null)">{{ 'crm.form.parent_clear' | translate }}</button>
                </div>
              } @else {
                <app-contacto-picker tipo="organizacion" inputId="f-parent-search" [label]="'crm.form.parent_search' | translate"
                                     [excluir]="excluirPadre()" (picked)="setPadre($event)" />
              }
            </section>
            <section class="block" id="refs">
              <h3>{{ 'crm.form.refs' | translate }}</h3>
              <p class="muted small">{{ 'crm.form.refs_hint' | translate }}</p>
              @for (r of refs(); track r.key) {
                <div class="ref-row">
                  <button mat-icon-button type="button" (click)="setPrincipal(r.key)" [attr.aria-pressed]="r.principal"
                          [attr.aria-label]="'crm.form.make_main' | translate">
                    <mat-icon [class.on]="r.principal">{{ r.principal ? 'star' : 'star_border' }}</mat-icon>
                  </button>
                  <div class="ref-name">
                    <strong>{{ r.nombre }}</strong>
                    @if (r.nuevo) { <span class="muted small">{{ 'crm.form.new_person' | translate }}</span> }
                  </div>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ref-rol">
                    <mat-label>{{ 'crm.form.role' | translate }}</mat-label>
                    <mat-select [ngModel]="r.id_rol" (ngModelChange)="setRol(r.key, $event)" [id]="'ref-rol-' + r.key">
                      <mat-option [value]="null">{{ 'crm.form.no_role' | translate }}</mat-option>
                      @for (o of rolesPara(r.id_rol); track o.id) { <mat-option [value]="o.id">{{ o.nombre }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                  <button mat-icon-button type="button" (click)="removeRef(r.key)" [attr.aria-label]="'common.delete' | translate">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }
              @if (!refs().length) { <p class="err small">{{ 'crm.form.refs_required' | translate }}</p> }

              <app-contacto-picker tipo="persona" inputId="f-person-search" [label]="'crm.form.search_person' | translate"
                                   [excluir]="idsRefs()" (picked)="addExisting($event)" />
              <button mat-button type="button" id="btn-new-person" (click)="showNew.set(!showNew())">
                <mat-icon>person_add</mat-icon>{{ 'crm.form.new_person_btn' | translate }}
              </button>
              @if (showNew()) {
                <div class="new-person">
                  <div class="form-row">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ 'crm.form.nombres' | translate }}</mat-label>
                      <input matInput id="np-nombres" [(ngModel)]="np.nombres" maxlength="100" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ 'crm.form.apellidos' | translate }}</mat-label>
                      <input matInput [(ngModel)]="np.apellidos" maxlength="100" />
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ 'crm.form.telefono' | translate }}</mat-label>
                      <input matInput inputmode="tel" [(ngModel)]="np.telefono" maxlength="30" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ 'crm.form.correo' | translate }}</mat-label>
                      <input matInput type="email" [(ngModel)]="np.correo" maxlength="190" />
                    </mat-form-field>
                  </div>
                  <button mat-tonal-button type="button" id="btn-add-new-person" (click)="addNew()" [disabled]="!np.nombres.trim()">
                    {{ 'crm.form.add_person' | translate }}
                  </button>
                </div>
              }
            </section>
          }

          @if (campos().length) {
            <section class="block">
              <h3>{{ 'crm.form.custom' | translate }}</h3>
              <div class="form-row wrap">
                @for (c of campos(); track c.id) {
                  @switch (c.tipo_dato) {
                    @case ('fecha') {
                      <app-date-input [label]="c.etiqueta + (c.obligatorio ? ' *' : '')" [value]="vals()[c.id] || null" (valueChange)="setVal(c.id, $event ?? '')" />
                    }
                    @case ('booleano') {
                      <mat-form-field appearance="outline">
                        <mat-label>{{ c.etiqueta }}{{ c.obligatorio ? ' *' : '' }}</mat-label>
                        <mat-select [ngModel]="vals()[c.id] ?? ''" (ngModelChange)="setVal(c.id, $event)" [id]="'campo-' + c.id">
                          <mat-option value="">—</mat-option>
                          <mat-option value="true">{{ 'common.yes' | translate }}</mat-option>
                          <mat-option value="false">{{ 'common.no' | translate }}</mat-option>
                        </mat-select>
                      </mat-form-field>
                    }
                    @default {
                      <mat-form-field appearance="outline">
                        <mat-label>{{ c.etiqueta }}{{ c.obligatorio ? ' *' : '' }}</mat-label>
                        <input matInput [id]="'campo-' + c.id" [attr.inputmode]="c.tipo_dato === 'texto' ? 'text' : (c.tipo_dato === 'entero' ? 'numeric' : 'decimal')"
                               [maxlength]="255" [ngModel]="vals()[c.id] ?? ''" (ngModelChange)="setVal(c.id, $event)" />
                      </mat-form-field>
                    }
                  }
                }
              </div>
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
      <button mat-flat-button id="btn-save-contacto" (click)="save()" [disabled]="saving() || !canSave()">
        {{ (saving() ? 'common.saving' : 'common.save') | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h3 { margin: 0; font: var(--mat-sys-title-medium); }
    .block { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid var(--md-sys-color-outline-variant); }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .err { color: var(--md-sys-color-error); }
    .ind { flex: 0 1 110px; }
    .ref-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .ref-name { display: flex; flex-direction: column; flex: 1 1 140px; min-width: 0; overflow-wrap: anywhere; }
    .ref-rol { flex: 1 1 160px; }
    .on { color: var(--md-sys-color-primary); font-variation-settings: 'FILL' 1; }
    .new-person { display: flex; flex-direction: column; gap: 12px; padding: 12px; border-radius: 12px; background: var(--md-sys-color-surface-container-low); }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .wrap { align-items: flex-start; }
  `,
})
export class ContactoDialogComponent {
  private readonly data = inject<ContactoDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ContactoDialogComponent, ContactoDialogResult>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private loading = inject(LoadingService);
  private i18n = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(Injector);

  readonly id = this.data.id ?? 0;
  readonly tipo = signal<TipoContacto>(this.data.tipo ?? 'persona');
  readonly esPersona = computed(() => this.tipo() === 'persona');
  readonly docTipos = computed(() => (this.esPersona() ? DOC_PERSONA : DOC_ORG));
  readonly title = computed(() =>
    `crm.form.${this.id ? 'edit' : 'new'}_${this.tipo()}`);

  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly responsables = signal<UsuarioSede[]>([]);
  private readonly camposDef = signal<CampoDef[]>([]);
  readonly campos = computed(() => this.camposDef().filter(c => c.activo && c.aplica_a === this.tipo()));
  readonly vals = signal<Record<number, string>>({});
  readonly tags = signal<CrmTag[]>([]);

  // Campos del formulario (ngModel)
  nombres = ''; apellidos = ''; razonSocial = ''; docTipo = ''; docNumero = ''; correo = ''; correoFact = '';
  waInd = '57'; waNum = ''; telefono = ''; direccion = ''; ciudad = ''; responsable: number | null = null;
  readonly fechaNacSig = signal<string | null>(null);
  get fechaNac(): string | null { return this.fechaNacSig(); }
  set fechaNac(v: string | null) { this.fechaNacSig.set(v); }

  // Personas de referencia (Organización)
  readonly refs = signal<RefItem[]>([]);
  private nextKey = 1;
  readonly roles = signal<RolVinculo[]>([]);
  /** Ubicación en el mapa (opcional): latitud y longitud van juntas. */
  readonly lat = signal<number | null>(null);
  readonly lng = signal<number | null>(null);
  readonly coordsLabel = computed(() => (this.lat() !== null && this.lng() !== null ? formatCoords(this.lat()!, this.lng()!) : ''));
  readonly urlMapa = computed(() => mapsUrl(this.lat() ?? 0, this.lng() ?? 0));
  /** Organización a la que pertenece (jerarquía). */
  readonly padre = signal<{ id: number; nombre: string } | null>(null);
  readonly idsRefs = computed(() => this.refs().flatMap(r => r.id_persona ?? []));
  readonly excluirPadre = computed(() => (this.id ? [this.id] : []));
  readonly showNew = signal(false);
  np = { nombres: '', apellidos: '', telefono: '', correo: '' };

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const [camp, resp, rol] = await this.loading.wrap(() => Promise.all([this.crm.listCampos(true), this.crm.listResponsables(), this.crm.listRoles(false)]));
    if (camp.action && camp.data) this.camposDef.set(camp.data.campos);
    if (resp.action && resp.data) this.responsables.set(resp.data.usuarios);
    if (rol.action && rol.data) this.roles.set(rol.data.roles);

    if (this.id) {
      const r = await this.loading.wrap(() => this.crm.getContacto(this.id));
      if (!r.action || !r.data) {
        await this.dialogs.error({ title: this.i18n.t('crm.form.load_error'), message: r.mensaje });
        this.ref.close();
        return;
      }
      this.fill(r.data);
    } else {
      this.docTipo = this.tipo() === 'persona' ? 'CC' : 'NIT';
    }
    this.loaded.set(true);
    // El diálogo intenta enfocar su primer campo al abrirse, pero el formulario aparece cuando terminan de cargar los catálogos:
    // si llegó tarde, el foco quedó fuera de los campos. Se enfoca el primero una vez pintado (sin robar el foco si ya hay uno).
    afterNextRender(() => {
      const primero = document.getElementById(this.esPersona() ? 'f-nombres' : 'f-razon');
      if (primero && !(document.activeElement instanceof HTMLInputElement)) primero.focus();
    }, { injector: this.injector });
  }

  private fill(d: ContactoDetalle): void {
    const c = d.contacto;
    this.tipo.set(c.tipo);
    this.nombres = c.nombres ?? ''; this.apellidos = c.apellidos ?? ''; this.razonSocial = c.razon_social ?? '';
    this.docTipo = c.documento_tipo ?? ''; this.docNumero = c.documento_numero ?? '';
    this.correo = c.correo ?? ''; this.correoFact = c.correo_facturacion ?? '';
    this.waInd = c.whatsapp_indicativo ?? (c.whatsapp_numero ? '' : '57'); this.waNum = c.whatsapp_numero ?? '';
    this.telefono = c.telefono ?? ''; this.direccion = c.direccion ?? ''; this.ciudad = c.ciudad ?? '';
    this.responsable = c.id_responsable; this.fechaNacSig.set(c.fecha_nacimiento);
    this.lat.set(c.lat); this.lng.set(c.lng);
    this.tags.set(d.tags.map(t => ({ id: t.id, nombre: t.nombre, color: t.color })));
    this.refs.set(d.vinculos.map(v => ({ key: this.nextKey++, id_persona: v.id, nombre: v.nombre_completo, id_rol: v.id_rol, principal: v.principal })));
    this.padre.set(c.id_padre ? { id: c.id_padre, nombre: c.padre_nombre ?? '' } : null);
    const v: Record<number, string> = {};
    for (const f of d.campos) if (f.valor !== null) v[f.id] = this.aTexto(f.valor);
    this.vals.set(v);
  }

  private aTexto(v: ValorCampo): string {
    return typeof v === 'boolean' ? String(v) : String(v ?? '');
  }

  setVal(id: number, v: string): void {
    this.vals.update(m => ({ ...m, [id]: v }));
  }

  // ─── Ubicación ─────────────────────────────────────────────────────────────────────────────────────────────────
  pickLocation(): void {
    const data: GeoPickerData = { lat: this.lat(), lng: this.lng(), direccion: this.direccion, ciudad: this.ciudad };
    this.matDialog.open(GeoPickerDialogComponent, { ...dialogSize('720px'), data, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe((res: GeoPickerResult | undefined) => {
        if (!res) return;
        if ('clear' in res) { this.clearLocation(); return; }
        // La dirección y la ciudad de Google solo rellenan lo que esté vacío: no pisan lo que la persona escribió.
        if (!this.direccion.trim() && res.direccion) this.direccion = res.direccion;
        if (!this.ciudad.trim() && res.ciudad) this.ciudad = res.ciudad;
        this.lat.set(res.lat); this.lng.set(res.lng);
        this.cdr.markForCheck();   // dirección/ciudad son campos de ngModel (no signals)
      });
  }

  clearLocation(): void {
    this.lat.set(null); this.lng.set(null);
  }

  // ─── Personas de referencia ────────────────────────────────────────────────────────────────────────────────────
  setPrincipal(key: number): void {
    this.refs.update(l => l.map(r => ({ ...r, principal: r.key === key })));
  }
  setRol(key: number, idRol: number | null): void {
    this.refs.update(l => l.map(r => (r.key === key ? { ...r, id_rol: idRol } : r)));
  }
  /** Roles que se ofrecen: los activos y, si el vínculo ya tenía uno desactivado, ese también. */
  rolesPara(actual: number | null): RolVinculo[] {
    return this.roles().filter(r => r.activo || r.id === actual);
  }
  setPadre(c: ContactoFila): void {
    this.padre.set({ id: c.id, nombre: c.nombre_completo });
  }
  removeRef(key: number): void {
    this.refs.update(l => {
      const n = l.filter(r => r.key !== key);
      if (n.length && !n.some(r => r.principal)) n[0] = { ...n[0], principal: true };
      return n;
    });
  }
  private pushRef(r: Omit<RefItem, 'key' | 'principal'>): void {
    this.refs.update(l => [...l, { ...r, key: this.nextKey++, principal: l.length === 0 }]);
  }

  addExisting(p: ContactoFila): void {
    this.pushRef({ id_persona: p.id, nombre: p.nombre_completo, id_rol: null });
  }

  addNew(): void {
    const n = this.np;
    this.pushRef({
      nuevo: { nombres: n.nombres.trim(), apellidos: n.apellidos.trim(), telefono: n.telefono.trim(), correo: n.correo.trim() },
      nombre: `${n.nombres} ${n.apellidos}`.trim(), id_rol: null,
    });
    this.np = { nombres: '', apellidos: '', telefono: '', correo: '' };
    this.showNew.set(false);
  }

  // ─── Etiquetas ─────────────────────────────────────────────────────────────────────────────────────────────────
  pickTags(): void {
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'),
      data: { seleccion: this.tags().map(t => t.id), actuales: this.tags(), tipo: this.tipo() },
    }).afterClosed().subscribe((res: TagPickerResult | undefined) => { if (res) this.tags.set(res.tags); });
  }

  // ─── Guardar ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** Método y no computed: nombres/razón social van por ngModel (no son signals); se relee en cada detección de cambios. */
  canSave(): boolean {
    if (!this.loaded()) return false;
    if (this.esPersona() ? !this.nombres.trim() : !this.razonSocial.trim()) return false;
    return this.esPersona() || this.refs().length > 0;
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      const campos: Record<number, string> = {};
      for (const c of this.campos()) campos[c.id] = this.vals()[c.id] ?? '';
      const payload: Record<string, unknown> = {
        id: this.id, tipo: this.tipo(), telefono: this.telefono.trim(), direccion: this.direccion.trim(), ciudad: this.ciudad.trim(),
        lat: this.lat() ?? '', lng: this.lng() ?? '',
        id_responsable: this.responsable ?? '', campos, tag_ids: this.tags().map(t => t.id),
      };
      if (this.esPersona()) {
        Object.assign(payload, {
          nombres: this.nombres.trim(), apellidos: this.apellidos.trim(), documento_tipo: this.docTipo, documento_numero: this.docNumero.trim(),
          correo: this.correo.trim(), whatsapp_indicativo: this.waNum.trim() ? this.waInd.trim() : '', whatsapp_numero: this.waNum.trim(), fecha_nacimiento: this.fechaNac ?? '',
        });
      } else {
        Object.assign(payload, {
          razon_social: this.razonSocial.trim(), documento_tipo: this.docTipo, documento_numero: this.docNumero.trim(),
          correo_facturacion: this.correoFact.trim(), id_padre: this.padre()?.id ?? '',
          personas: this.refs().map((r): PersonaRef => (r.id_persona
            ? { id_persona: r.id_persona, id_rol: r.id_rol, principal: r.principal }
            : { nuevo: r.nuevo, id_rol: r.id_rol, principal: r.principal })),
        });
      }
      const r = await this.crm.saveContacto(payload);
      if (!r.action || !r.data) {
        await this.dialogs.error({ title: this.i18n.t('crm.form.save_error'), message: r.mensaje });
        return;
      }
      this.ref.close({ id: r.data.id, advertencias: r.data.advertencias });
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.form.save_error'), message: this.i18n.t('common.error') });
    } finally {
      this.saving.set(false);
    }
  }
}

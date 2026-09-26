import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clipboard } from '@angular/cdk/clipboard';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { MatTooltip } from '@angular/material/tooltip';
import { BolsaEmpresa, ComunicacionesService, LineaAdmin, MetaApp, PasoPrueba, RecargaReciente, Tarifa } from '../../services/comunicaciones.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime } from '../crm/crm-format';

// ─── Diálogo: app de Meta ────────────────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-meta-app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatIconButton, MatFormField, MatLabel, MatHint, MatSuffix,
    MatIcon, MatInput, MatSlideToggle, MatTooltip, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (app ? 'com.admin.edit_app' : 'com.admin.new_app') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline"><mat-label>{{ 'com.admin.name' | translate }}</mat-label><input matInput id="app-name" [(ngModel)]="nombre" maxlength="100" /></mat-form-field>
        <div class="form-row">
          <mat-form-field appearance="outline"><mat-label>App ID</mat-label><input matInput id="app-id" [(ngModel)]="appId" maxlength="40" inputmode="numeric" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>{{ 'com.admin.graph' | translate }}</mat-label><input matInput [(ngModel)]="version" maxlength="6" /></mat-form-field>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>App Secret</mat-label>
          <input matInput id="app-secret" type="password" autocomplete="off" [(ngModel)]="secret" maxlength="32" />
          <mat-hint>{{ (app?.secret_configurado ? 'com.admin.keep_hint' : 'com.admin.secret_hint') | translate }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Verify token</mat-label>
          <input matInput id="app-verify" autocomplete="off" [(ngModel)]="verify" maxlength="100" />
          <button mat-icon-button matSuffix type="button" (click)="generar()" [matTooltip]="'com.admin.generate' | translate" [attr.aria-label]="'com.admin.generate' | translate"><mat-icon>autorenew</mat-icon></button>
          <mat-hint>{{ (app?.verify_configurado ? 'com.admin.keep_hint' : 'com.admin.verify_hint') | translate }}</mat-hint>
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-app" [disabled]="guardando() || !nombre.trim() || !appId.trim()" (click)="guardar()">{{ 'common.save' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class MetaAppDialogComponent {
  readonly app = inject<MetaApp | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MetaAppDialogComponent, boolean>);
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  nombre = this.app?.nombre ?? '';
  appId = this.app?.app_id ?? '';
  version = this.app?.graph_version ?? 'v23.0';
  secret = '';
  verify = '';
  activo = this.app?.activo ?? true;
  readonly guardando = signal(false);

  generar(): void {
    const b = new Uint8Array(18); crypto.getRandomValues(b);
    this.verify = 'le-' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.com.saveApp({ id: this.app?.id ?? 0, nombre: this.nombre.trim(), app_id: this.appId.trim(), graph_version: this.version.trim(),
        app_secret: this.secret.trim(), verify_token: this.verify.trim(), activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.admin.save_error'), message: r.mensaje }); return; }
      if (!this.app && this.verify) {
        await this.dialogs.info({ title: this.i18n.t('com.admin.app_saved'), message: this.i18n.t('com.admin.app_saved_msg', { url: r.data!.webhook_url, token: this.verify }) });
      }
      this.ref.close(true);
    } finally { this.guardando.set(false); }
  }
}

// ─── Diálogo: línea ──────────────────────────────────────────────────────────────────────────────────────────────
interface LineaDialogData { linea: LineaAdmin | null; apps: MetaApp[]; empresas: BolsaEmpresa[] }

@Component({
  selector: 'app-linea-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatOption,
    MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (d.linea ? 'com.admin.edit_line' : 'com.admin.new_line') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'com.admin.branch' | translate }}</mat-label>
          <mat-select id="line-sede" [(ngModel)]="idSede">
            @for (e of d.empresas; track e.id) { @for (s of e.sedes; track s.id) { <mat-option [value]="s.id">{{ e.nombre }} · {{ s.nombre }}@if (!s.contratado) { ({{ 'com.admin.no_module' | translate }}) }</mat-option> } }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'com.admin.app' | translate }}</mat-label>
          <mat-select id="line-app" [(ngModel)]="idApp">@for (a of d.apps; track a.id) { <mat-option [value]="a.id">{{ a.nombre }} ({{ a.app_id }})</mat-option> }</mat-select>
        </mat-form-field>
        <div class="form-row">
          <mat-form-field appearance="outline"><mat-label>{{ 'com.admin.name' | translate }}</mat-label><input matInput id="line-name" [(ngModel)]="nombre" maxlength="100" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>{{ 'com.admin.phone' | translate }}</mat-label><input matInput id="line-phone" [(ngModel)]="telefono" maxlength="30" placeholder="+57 300 000 0000" /></mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field appearance="outline"><mat-label>Phone number ID</mat-label><input matInput id="line-pnid" [(ngModel)]="pnid" maxlength="40" inputmode="numeric" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>WABA ID</mat-label><input matInput id="line-waba" [(ngModel)]="waba" maxlength="40" inputmode="numeric" /></mat-form-field>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'com.admin.token' | translate }}</mat-label>
          <input matInput id="line-token" type="password" autocomplete="off" [(ngModel)]="token" />
          <mat-hint>{{ (d.linea?.token_configurado ? 'com.admin.token_keep' : 'com.admin.token_hint') | translate: { last: d.linea?.token_ultimos4 || '' } }}</mat-hint>
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-line" [disabled]="guardando() || !idSede || !idApp || !nombre.trim() || !pnid.trim() || !waba.trim()" (click)="guardar()">{{ 'common.save' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class LineaDialogComponent {
  readonly d = inject<LineaDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<LineaDialogComponent, number | null>);
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  idSede: number | null = this.d.linea?.id_sede ?? null;
  idApp: number | null = this.d.linea?.id_app ?? this.d.apps[0]?.id ?? null;
  nombre = this.d.linea?.nombre ?? '';
  telefono = this.d.linea?.telefono_visible ?? '';
  pnid = this.d.linea?.phone_number_id ?? '';
  waba = this.d.linea?.waba_id ?? '';
  token = '';
  activo = this.d.linea?.activo ?? true;
  readonly guardando = signal(false);

  async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.com.saveLinea({ id: this.d.linea?.id ?? 0, id_sede: this.idSede, id_app: this.idApp, nombre: this.nombre.trim(), telefono_visible: this.telefono.trim(),
        phone_number_id: this.pnid.trim(), waba_id: this.waba.trim(), access_token: this.token.trim(), activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.admin.save_error'), message: r.mensaje }); return; }
      this.ref.close(r.data!.id);
    } finally { this.guardando.set(false); }
  }
}

// ─── Diálogo: recarga o ajuste ───────────────────────────────────────────────────────────────────────────────────
interface RecargaData { empresas: BolsaEmpresa[]; minimo: number; ambito?: 'empresa' | 'sede'; id?: number }

@Component({
  selector: 'app-recarga-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatLabel,
    MatHint, MatInput, MatSelect, MatOption, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'com.admin.recharge' | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-button-toggle-group [(ngModel)]="tipo" [hideSingleSelectionIndicator]="true">
          <mat-button-toggle value="recarga">{{ 'com.mov.recarga' | translate }}</mat-button-toggle>
          <mat-button-toggle value="ajuste">{{ 'com.mov.ajuste' | translate }}</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'com.admin.wallet' | translate }}</mat-label>
          <mat-select id="recharge-wallet" [(ngModel)]="destino">
            @for (e of d.empresas; track e.id) {
              <mat-option [value]="'e' + e.id">{{ 'com.credits.wallet_company' | translate }}: {{ e.nombre }}</mat-option>
              @for (s of e.sedes; track s.id) { <mat-option [value]="'s' + s.id">— {{ s.nombre }}</mat-option> }
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'com.credits.amount' | translate }}</mat-label>
          <input matInput id="recharge-amount" type="number" [(ngModel)]="creditos" />
          <mat-hint>{{ (tipo === 'recarga' ? 'com.admin.min_hint' : 'com.admin.adjust_hint') | translate: { n: d.minimo } }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>{{ 'com.admin.reference' | translate }}</mat-label><input matInput id="recharge-ref" [(ngModel)]="referencia" maxlength="100" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>{{ 'com.admin.description' | translate }}</mat-label><input matInput id="recharge-desc" [(ngModel)]="descripcion" maxlength="255" /></mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-recharge-ok" [disabled]="guardando() || !destino || !valido()" (click)="guardar()">{{ 'common.save' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class RecargaDialogComponent {
  readonly d = inject<RecargaData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RecargaDialogComponent, boolean>);
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  tipo: 'recarga' | 'ajuste' = 'recarga';
  destino = this.d.ambito && this.d.id ? (this.d.ambito === 'empresa' ? 'e' : 's') + this.d.id : '';
  creditos: number | null = null;
  referencia = '';
  descripcion = '';
  readonly guardando = signal(false);
  valido(): boolean {
    const n = Number(this.creditos);
    return this.tipo === 'recarga' ? n >= this.d.minimo : n !== 0 && !!this.descripcion.trim();
  }

  async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const esEmpresa = this.destino.startsWith('e');
      const id = Number(this.destino.slice(1));
      const r = await this.com.recargar({ ambito: esEmpresa ? 'empresa' : 'sede', id_empresa: esEmpresa ? id : undefined, id_sede: esEmpresa ? undefined : id,
        tipo: this.tipo, creditos: Number(this.creditos), referencia: this.referencia.trim(), descripcion: this.descripcion.trim() });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.admin.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally { this.guardando.set(false); }
  }
}

// ─── Página ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Plataforma (L5): apps de Meta (webhook y secretos cifrados), líneas de WhatsApp de cada sede («Probar conexión» suscribe la WABA), bolsas de
 * créditos con recargas y ajustes, y tarifas (créditos por categoría de mensaje).
 */
@Component({
  selector: 'app-comunicaciones-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIconButton, MatIcon, MatTab, MatTabGroup, MatTooltip, MatFormField, MatInput, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header"><h1>{{ 'com.admin.title' | translate }}</h1></header>
      @if (!cifrado()) {
        <div class="banner" role="alert"><mat-icon>key_off</mat-icon><span>{{ 'com.admin.no_key' | translate }}</span></div>
      }
      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start">
        <mat-tab [label]="'com.admin.apps' | translate">
          <div class="tab">
            <div class="bar"><p class="muted">{{ 'com.admin.apps_hint' | translate }}</p>
              <button mat-flat-button id="btn-new-app" (click)="editarApp(null)"><mat-icon>add</mat-icon>{{ 'com.admin.new_app' | translate }}</button></div>
            @for (a of apps(); track a.id) {
              <section class="block" [class.off]="!a.activo">
                <div class="bhead"><h2>{{ a.nombre }}</h2><span class="muted">App ID {{ a.app_id }} · {{ a.graph_version }} · {{ 'com.admin.n_lines' | translate: { n: a.lineas } }}</span>
                  <span class="spacer"></span><button mat-icon-button (click)="editarApp(a)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button></div>
                <div class="webhook"><span class="lbl">{{ 'com.admin.webhook' | translate }}</span><code>{{ a.webhook_url }}</code>
                  <button mat-icon-button (click)="copiar(a.webhook_url)" [matTooltip]="'com.admin.copy' | translate" [attr.aria-label]="'com.admin.copy' | translate"><mat-icon>content_copy</mat-icon></button></div>
                <div class="chips">
                  <span class="chip" [class.ok]="a.secret_configurado">App Secret {{ a.secret_configurado ? '✓' : '✗' }}</span>
                  <span class="chip" [class.ok]="a.verify_configurado">Verify token {{ a.verify_configurado ? '✓' : '✗' }}</span>
                </div>
              </section>
            } @empty { <div class="empty-state"><mat-icon>apps</mat-icon><span>{{ 'com.admin.no_apps' | translate }}</span></div> }
          </div>
        </mat-tab>
        <mat-tab [label]="'com.admin.lines' | translate">
          <div class="tab">
            <div class="bar"><p class="muted">{{ 'com.admin.lines_hint' | translate }}</p>
              <button mat-flat-button id="btn-new-line" [disabled]="!apps().length" (click)="editarLinea(null)"><mat-icon>add</mat-icon>{{ 'com.admin.new_line' | translate }}</button></div>
            @for (l of lineas(); track l.id) {
              <section class="block" [class.off]="!l.activo">
                <div class="bhead"><h2>{{ l.nombre }}</h2><span class="muted">{{ l.empresa_nombre }} · {{ l.sede_nombre }}</span><span class="spacer"></span>
                  <button mat-stroked-button [id]="'btn-test-' + l.id" (click)="probar(l)"><mat-icon>network_check</mat-icon>{{ 'com.admin.test' | translate }}</button>
                  <button mat-icon-button (click)="editarLinea(l)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button></div>
                <div class="grid2">
                  <span><span class="lbl">{{ 'com.admin.phone' | translate }}</span> {{ l.telefono_visible || '—' }}</span>
                  <span><span class="lbl">{{ 'com.admin.verified_name' | translate }}</span> {{ l.nombre_verificado || '—' }}</span>
                  <span><span class="lbl">Phone number ID</span> {{ l.phone_number_id }}</span>
                  <span><span class="lbl">WABA</span> {{ l.waba_id }}</span>
                  <span><span class="lbl">{{ 'com.admin.app' | translate }}</span> {{ l.app_nombre }}</span>
                  <span><span class="lbl">{{ 'com.admin.token' | translate }}</span> {{ l.token_configurado ? '•••• ' + (l.token_ultimos4 || '') : '✗' }}</span>
                </div>
                <div class="chips">
                  <span class="chip" [class.ok]="!!l.verificada_at">{{ (l.verificada_at ? 'com.admin.verified' : 'com.admin.not_verified') | translate }}</span>
                  <span class="chip" [class.ok]="!!l.suscrita_at">{{ (l.suscrita_at ? 'com.admin.subscribed' : 'com.admin.not_subscribed') | translate }}</span>
                  @if (l.calidad) { <span class="chip" [attr.data-q]="l.calidad">{{ 'com.admin.quality' | translate }}: {{ l.calidad }}</span> }
                  @if (l.nivel_mensajes) { <span class="chip">{{ l.nivel_mensajes }}</span> }
                  <span class="chip" [class.ok]="l.webhook_aqui === true" [class.warn]="l.webhook_aqui === false" [id]="'wh-state-' + l.id">
                    {{ (l.webhook_aqui === null ? 'com.admin.wh_unknown' : l.webhook_aqui ? 'com.admin.wh_here' : 'com.admin.wh_elsewhere') | translate }}</span>
                </div>
                <div class="whrow">
                  @if (l.webhook_aqui === false && l.webhook_efectivo) { <span class="muted small wh-url">{{ 'com.admin.wh_goes_to' | translate: { url: l.webhook_efectivo } }}</span> }
                  <span class="spacer"></span>
                  @if (l.webhook_aqui === true) {
                    <button mat-button [id]="'btn-wh-restore-' + l.id" (click)="webhook(l, 'quitar')"><mat-icon>undo</mat-icon>{{ 'com.admin.wh_restore' | translate }}</button>
                  } @else if (l.webhook_aqui === false) {
                    <button mat-flat-button [id]="'btn-wh-here-' + l.id" [disabled]="!l.token_configurado" (click)="webhook(l, 'activar')"><mat-icon>call_received</mat-icon>{{ 'com.admin.wh_activate' | translate }}</button>
                  }
                  <button mat-icon-button [id]="'btn-wh-check-' + l.id" [disabled]="!l.token_configurado" (click)="webhook(l, 'ver')"
                    [matTooltip]="'com.admin.wh_check' | translate" [attr.aria-label]="'com.admin.wh_check' | translate"><mat-icon>sync</mat-icon></button>
                </div>
                @if (l.ultimo_error) { <p class="err small"><mat-icon>error</mat-icon>{{ l.ultimo_error }}</p> }
              </section>
            } @empty { <div class="empty-state"><mat-icon>phone_iphone</mat-icon><span>{{ 'com.admin.no_lines' | translate }}</span></div> }
          </div>
        </mat-tab>
        <mat-tab [label]="'com.admin.wallets' | translate">
          <div class="tab">
            <div class="bar"><p class="muted">{{ 'com.admin.wallets_hint' | translate }}</p>
              <button mat-flat-button id="btn-recharge" (click)="recargar()"><mat-icon>add_card</mat-icon>{{ 'com.admin.recharge' | translate }}</button></div>
            @for (e of empresas(); track e.id) {
              <section class="block">
                <div class="bhead"><h2>{{ e.nombre }}</h2><span class="spacer"></span><strong class="saldo">{{ num(e.saldo) }}</strong>
                  <button mat-icon-button (click)="recargar('empresa', e.id)" [attr.aria-label]="'com.admin.recharge' | translate"><mat-icon>add_card</mat-icon></button></div>
                @for (s of e.sedes; track s.id) {
                  <div class="srow" [class.off]="!s.contratado">
                    <span>{{ s.nombre }}</span>
                    <span class="muted small">{{ (s.fuente === 'empresa' ? 'com.admin.uses_company' : 'com.admin.uses_own') | translate }}@if (!s.contratado) { · {{ 'com.admin.no_module' | translate }} }</span>
                    <span class="spacer"></span><span>{{ num(s.saldo) }}</span>
                    <button mat-icon-button (click)="recargar('sede', s.id)" [attr.aria-label]="'com.admin.recharge' | translate"><mat-icon>add_card</mat-icon></button>
                  </div>
                }
              </section>
            }
            <h2 class="sub">{{ 'com.admin.recent' | translate }}</h2>
            <div class="table-scroll"><table class="tbl">
              <thead><tr><th>{{ 'com.credits.date' | translate }}</th><th>{{ 'com.credits.type' | translate }}</th><th>{{ 'com.admin.wallet' | translate }}</th><th class="num">{{ 'com.credits.credits' | translate }}</th><th>{{ 'com.admin.reference' | translate }}</th><th>{{ 'com.admin.by' | translate }}</th></tr></thead>
              <tbody>@for (m of ultimas(); track m.id) {
                <tr><td>{{ fecha(m.created_at) }}</td><td>{{ 'com.mov.' + m.tipo | translate }}</td><td>{{ nombreBolsa(m) }}</td><td class="num">{{ num(m.creditos) }}</td><td>{{ m.referencia || m.descripcion || '' }}</td><td>{{ m.usuario || '' }}</td></tr>
              } @empty { <tr><td colspan="6" class="muted">—</td></tr> }</tbody>
            </table></div>
          </div>
        </mat-tab>
        <mat-tab [label]="'com.admin.rates' | translate">
          <div class="tab narrow">
            <p class="muted">{{ 'com.admin.rates_hint' | translate }}</p>
            @for (t of tarifas(); track t.categoria) {
              <div class="srow">
                <span>{{ 'com.cat.' + t.categoria | translate }} <span class="muted small">({{ t.categoria }})</span></span><span class="spacer"></span>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="rate"><input matInput type="number" min="0" max="1000" [id]="'rate-' + t.categoria"
                  [ngModel]="t.creditos" (ngModelChange)="t.creditos = +$event" /></mat-form-field>
                <button mat-stroked-button (click)="guardarTarifa(t)">{{ 'common.save' | translate }}</button>
              </div>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .banner { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; margin-bottom: 12px;
      background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 12px; &.narrow { max-width: 640px; } }
    .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; p { margin: 0; flex: 1 1 320px; } }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: .6; } }
    .bhead { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .webhook { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; code { overflow-wrap: anywhere; padding: 4px 8px; border-radius: 6px; background: var(--md-sys-color-surface-container-high); } }
    .lbl { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest);
      &.ok { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-q='RED'] { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
      &.warn { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); } }
    .whrow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; .wh-url { overflow-wrap: anywhere; flex: 1 1 260px; } }
    .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px 16px; overflow-wrap: anywhere; }
    .err { display: flex; align-items: center; gap: 6px; color: var(--md-sys-color-error); margin: 0; }
    .small { font: var(--mat-sys-body-small); }
    .srow { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: .6; } }
    .saldo { font: var(--mat-sys-title-large); }
    .sub { margin: 12px 0 0; font: var(--mat-sys-title-medium); }
    .rate { width: 110px; }
    .tbl { width: 100%; border-collapse: collapse; th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--md-sys-color-outline-variant); } .num { text-align: right; } }
  `,
})
export default class ComunicacionesAdminPage {
  private com = inject(ComunicacionesService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private clipboard = inject(Clipboard);
  private snack = inject(MatSnackBar);
  private i18n = inject(TranslationService);

  readonly apps = signal<MetaApp[]>([]);
  readonly lineas = signal<LineaAdmin[]>([]);
  readonly empresas = signal<BolsaEmpresa[]>([]);
  readonly ultimas = signal<RecargaReciente[]>([]);
  readonly tarifas = signal<Tarifa[]>([]);
  readonly cifrado = signal(true);
  readonly minimo = signal(1000);
  private readonly nombresSede = computed(() => new Map(this.empresas().flatMap(e => e.sedes.map(s => [s.id, `${e.nombre} · ${s.nombre}`] as const))));

  constructor() { void this.cargar(); }

  async cargar(): Promise<void> {
    const [a, l, b, t] = await this.loading.wrap(() => Promise.all([this.com.listApps(), this.com.listLineas(), this.com.listBilleteras(), this.com.listTarifas()]));
    if (a.action && a.data) { this.apps.set(a.data.apps); this.cifrado.set(a.data.cifrado_disponible); }
    if (l.action && l.data) this.lineas.set(l.data.lineas);
    if (b.action && b.data) { this.empresas.set(b.data.empresas); this.ultimas.set(b.data.ultimas); this.minimo.set(b.data.recarga_minima); }
    if (t.action && t.data) this.tarifas.set(t.data.tarifas);
  }

  num(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO'); }
  fecha(s: string): string { return formatDateTime(s); }
  nombreBolsa(m: RecargaReciente): string {
    return m.ambito === 'empresa' ? (this.empresas().find(e => e.id === m.id_empresa)?.nombre ?? '') : (this.nombresSede().get(m.id_sede ?? 0) ?? '');
  }
  copiar(t: string): void { this.clipboard.copy(t); this.snack.open(this.i18n.t('com.admin.copied'), undefined, { duration: 2000 }); }

  editarApp(a: MetaApp | null): void {
    this.matDialog.open(MetaAppDialogComponent, { ...dialogSize('560px'), data: a }).afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }

  editarLinea(l: LineaAdmin | null): void {
    this.matDialog.open(LineaDialogComponent, { ...dialogSize('720px'), data: { linea: l, apps: this.apps(), empresas: this.empresas() } satisfies LineaDialogData })
      .afterClosed().subscribe(async (id: number | null | undefined) => {
        if (!id) return;
        await this.cargar();
        if (!l) { const nueva = this.lineas().find(x => x.id === id); if (nueva) await this.probar(nueva); }
      });
  }

  async probar(l: LineaAdmin): Promise<void> {
    const r = await this.loading.wrap(() => this.com.probarLinea(l.id));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.admin.test_error'), message: r.mensaje }); return; }
    const linea = (p: PasoPrueba) => `${p.ok ? '✓' : '✗'} ${this.i18n.t('com.admin.step_' + p.paso)}: ${p.detalle}`;
    const msg = r.data.pasos.map(linea).join('\n');
    if (r.data.ok) await this.dialogs.info({ title: this.i18n.t('com.admin.test_ok'), message: msg });
    else await this.dialogs.error({ title: this.i18n.t('com.admin.test_fail'), message: msg });
    await this.cargar();
  }

  /** A dónde manda Meta los mensajes del número: revisar, recibirlos aquí (webhook alterno del número) o devolverlos a la URL de la app. */
  async webhook(l: LineaAdmin, accion: 'ver' | 'activar' | 'quitar'): Promise<void> {
    if (accion !== 'ver') {
      const url = l.webhook_efectivo ?? '—';
      const ok = await this.dialogs.confirm(accion === 'activar'
        ? { title: this.i18n.t('com.admin.wh_activate_title'), message: this.i18n.t('com.admin.wh_activate_msg', { url }), confirmText: this.i18n.t('com.admin.wh_activate') }
        : { title: this.i18n.t('com.admin.wh_restore_title'), message: this.i18n.t('com.admin.wh_restore_msg'), confirmText: this.i18n.t('com.admin.wh_restore'), danger: true });
      if (!ok) return;
    }
    const r = await this.loading.wrap(() => this.com.webhookLinea(l.id, accion));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.admin.wh_error'), message: r.mensaje }); await this.cargar(); return; }
    if (r.data.aviso) await this.dialogs.info({ title: this.i18n.t('com.admin.step_webhook'), message: r.data.aviso });
    else if (accion !== 'ver') this.snack.open(this.i18n.t(accion === 'activar' ? 'com.admin.wh_done_here' : 'com.admin.wh_done_restored'), undefined, { duration: 3000 });
    await this.cargar();
  }

  recargar(ambito?: 'empresa' | 'sede', id?: number): void {
    this.matDialog.open(RecargaDialogComponent, { ...dialogSize('560px'), data: { empresas: this.empresas(), minimo: this.minimo(), ambito, id } satisfies RecargaData })
      .afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }

  async guardarTarifa(t: Tarifa): Promise<void> {
    const r = await this.loading.wrap(() => this.com.saveTarifa(t.categoria, t.creditos));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.admin.save_error'), message: r.mensaje }); return; }
    this.snack.open(this.i18n.t('com.admin.rate_saved'), undefined, { duration: 2000 });
  }
}

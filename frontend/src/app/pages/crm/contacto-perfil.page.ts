import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CampoConValor, ContactoDetalle, CrmService, Meta, OportunidadFila, ResumenVentas, VentaFila } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { ContactoDialogComponent, ContactoDialogResult } from './contacto-dialog.component';
import { formatCoords, formatDateTime, initials, isoToDmy, mapsUrl } from './crm-format';
import { HistorialDialogComponent } from './historial-dialog.component';
import { abrirMetaDialog } from './meta-dialog.component';
import { MetaBarComponent, MetaEstadoComponent, periodoDe, valorMetrica } from './metas-ui';
import { abrirOportunidadDialog } from './oportunidad-dialog.component';
import { VentaDialogComponent } from './venta-dialog.component';
import { abrirVentaManualDialog } from './venta-manual-dialog.component';
import { rangoPeriodo } from './ventas.page';

/** Perfil de un Persona u Organización: datos, vínculos, etiquetas, campos personalizados, auditoría e historial. */
@Component({
  selector: 'app-contacto-perfil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIconButton, MatIcon, MatTooltip, TagChipComponent, MetaBarComponent, MetaEstadoComponent, TranslatePipe],
  template: `
    <div class="page">
      @if (d(); as det) {
        @let c = det.contacto;
        <header class="head">
          <a mat-icon-button routerLink="/m/crm/contactos" [attr.aria-label]="'crm.back' | translate"><mat-icon>arrow_back</mat-icon></a>
          <span class="avatar" [attr.data-tipo]="c.tipo" aria-hidden="true">
            @if (c.tipo === 'persona') { {{ ini() }} } @else { <mat-icon>business</mat-icon> }
          </span>
          <div class="title">
            <h1 id="contact-name">{{ c.nombre_completo }}</h1>
            <div class="badges">
              <span class="pill">{{ 'crm.tipo.' + c.tipo | translate }}</span>
              @if (!c.activo) { <span class="pill warn" id="badge-archived">{{ 'crm.filters.archived_one' | translate }}</span> }
            </div>
          </div>
          <div class="actions">
            <button mat-flat-button id="btn-edit" (click)="edit()"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
            @if (canAudit()) {
              <button mat-icon-button id="btn-history" (click)="history()" [matTooltip]="'crm.hist.title' | translate" [attr.aria-label]="'crm.hist.title' | translate">
                <mat-icon>history</mat-icon>
              </button>
              <button mat-icon-button id="btn-delete" (click)="toggleArchived()" [matTooltip]="(c.activo ? 'crm.delete' : 'crm.restore') | translate" [attr.aria-label]="(c.activo ? 'crm.delete' : 'crm.restore') | translate">
                <mat-icon>{{ c.activo ? 'delete' : 'restore_from_trash' }}</mat-icon>
              </button>
            }
          </div>
        </header>

        <div class="grid">
          <section class="card">
            <h2>{{ 'crm.profile.data' | translate }}</h2>
            <dl>
              @if (c.tipo === 'persona') {
                @if (docLabel()) { <div><dt>{{ 'crm.form.doc_number' | translate }}</dt><dd>{{ docLabel() }}</dd></div> }
                @if (c.correo) { <div><dt>{{ 'crm.form.correo' | translate }}</dt><dd>{{ c.correo }}</dd></div> }
                @if (c.whatsapp_numero) { <div><dt>{{ 'crm.form.whatsapp' | translate }}</dt><dd>+{{ c.whatsapp_indicativo }} {{ c.whatsapp_numero }}</dd></div> }
                @if (c.fecha_nacimiento) { <div><dt>{{ 'crm.form.nacimiento' | translate }}</dt><dd>{{ fmt(c.fecha_nacimiento) }}</dd></div> }
              } @else {
                @if (docLabel()) { <div><dt>{{ 'crm.form.doc_number_org' | translate }}</dt><dd>{{ docLabel() }}</dd></div> }
                @if (c.correo_facturacion) { <div><dt>{{ 'crm.form.correo_fact' | translate }}</dt><dd>{{ c.correo_facturacion }}</dd></div> }
                @if (c.id_padre) {
                  <div id="profile-parent"><dt>{{ 'crm.profile.parent' | translate }}</dt><dd><a class="inline-link" [routerLink]="['/m/crm/contactos', c.id_padre]">{{ c.padre_nombre }}</a></dd></div>
                }
              }
              @if (c.telefono) { <div><dt>{{ 'crm.form.telefono' | translate }}</dt><dd>{{ c.telefono }}</dd></div> }
              @if (c.direccion || c.ciudad) { <div><dt>{{ 'crm.form.direccion' | translate }}</dt><dd>{{ [c.direccion, c.ciudad].filter(x => x).join(', ') }}</dd></div> }
              @if (c.lat !== null && c.lng !== null) {
                <div id="profile-location">
                  <dt>{{ 'crm.profile.location' | translate }}</dt>
                  <dd>{{ coords(c.lat, c.lng) }} · <a class="inline-link" [href]="url(c.lat, c.lng)" target="_blank" rel="noopener">{{ 'crm.form.open_in_maps' | translate }}</a></dd>
                </div>
              }
              <div><dt>{{ 'crm.form.responsable' | translate }}</dt><dd>{{ c.responsable_nombre || '—' }}</dd></div>
            </dl>
          </section>

          <section class="card">
            <h2>{{ (c.tipo === 'organizacion' ? 'crm.profile.people' : 'crm.profile.orgs') | translate }}</h2>
            @for (v of det.vinculos; track v.id) {
              <a class="link-row" [routerLink]="['/m/crm/contactos', v.id]">
                <mat-icon>{{ c.tipo === 'organizacion' ? 'person' : 'business' }}</mat-icon>
                <span class="link-text">
                  <strong>{{ v.nombre_completo }}</strong>
                  <span class="muted small">{{ [v.rol, v.telefono, v.correo].filter(x => x).join(' · ') }}</span>
                </span>
                @if (v.principal) { <mat-icon class="star" [matTooltip]="'crm.profile.main' | translate">star</mat-icon> }
              </a>
            } @empty { <p class="muted">—</p> }
          </section>

          @if (det.hijas.length) {
            <section class="card" id="profile-children">
              <h2>{{ 'crm.profile.children' | translate }} ({{ det.hijas.length }})</h2>
              @for (h of det.hijas; track h.id) {
                <a class="link-row" [routerLink]="['/m/crm/contactos', h.id]">
                  <mat-icon>business</mat-icon>
                  <span class="link-text">
                    <strong>{{ h.nombre_completo }}</strong>
                    @if (!h.activo) { <span class="muted small">{{ 'crm.filters.archived_one' | translate }}</span> }
                  </span>
                </a>
              }
            </section>
          }

          <section class="card">
            <div class="card-head">
              <h2>{{ 'crm.form.tags' | translate }}</h2>
              <button mat-button id="btn-edit-tags" (click)="editTags()"><mat-icon>label</mat-icon>{{ 'crm.form.edit_tags' | translate }}</button>
            </div>
            <div class="chips" id="profile-tags">
              @for (t of det.tags; track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> } @empty { <span class="muted">—</span> }
            </div>
          </section>

          <section class="card" id="profile-opps">
            <div class="card-head">
              <h2>{{ 'crm.opp.of_contact' | translate }}</h2>
              <button mat-button id="btn-new-opp" (click)="newOpp()"><mat-icon>add</mat-icon>{{ 'crm.opp.new' | translate }}</button>
            </div>
            @for (o of opps(); track o.id) {
              <a class="link-row" [routerLink]="['/m/crm/oportunidades', o.id]">
                <mat-icon>trending_up</mat-icon>
                <span class="link-text">
                  <strong>{{ o.titulo }}</strong>
                  <span class="muted small">{{ o.etapa_nombre }} · {{ cfg.money(o.valor) }}</span>
                </span>
              </a>
            } @empty { <p class="muted">—</p> }
            @if (oppsTotal() > opps().length) { <a mat-button routerLink="/m/crm/oportunidades" class="more-opps">{{ 'crm.opp.see_all' | translate: { n: oppsTotal() } }}</a> }
          </section>

          @if (ventasRes(); as vr) {
            <section class="card" id="profile-sales">
              <div class="card-head">
                <h2>{{ 'crm.sales.profile_title' | translate }}</h2>
                @if (canAudit() && c.activo) { <button mat-button id="btn-profile-sale" (click)="nuevaVenta()"><mat-icon>add_shopping_cart</mat-icon>{{ 'crm.cart.register' | translate }}</button> }
              </div>
              @if (vr.ventas) {
                <dl class="sales-k">
                  <div><dt>{{ 'crm.sales.k_total' | translate }}</dt><dd><strong>{{ cfg.money(vr.total) }}</strong></dd></div>
                  <div><dt>{{ 'crm.sales.k_sales' | translate }}</dt><dd>{{ vr.ventas }}</dd></div>
                  <div><dt>{{ 'crm.sales.last' | translate }}</dt><dd>{{ vr.hasta ? fmt(vr.hasta) : '—' }}</dd></div>
                </dl>
                @for (v of ultimasVentas(); track v.id) {
                  <button class="link-row sale" (click)="verVenta(v)"><mat-icon>receipt_long</mat-icon>
                    <span class="link-text"><strong>{{ cfg.money(v.total) }}</strong><span class="muted small">{{ fmt(v.fecha) }} · {{ v.documento || '—' }}@if (v.id_contacto !== det.contacto.id) { · {{ v.cliente }} }</span></span></button>
                }
                @if (det.hijas.length) { <span class="muted small">{{ 'crm.sales.profile_children' | translate }}</span> }
              } @else { <p class="muted">{{ 'crm.sales.profile_empty' | translate }}</p> }
            </section>
          }

          @if (c.tipo === 'organizacion') {
            <section class="card" id="profile-goals">
              <div class="card-head">
                <h2>{{ 'crm.goals.profile_title' | translate }}</h2>
                @if (esAdmin()) { <button mat-button id="btn-new-goal" (click)="nuevaMeta()"><mat-icon>add</mat-icon>{{ 'crm.goals.new' | translate }}</button> }
              </div>
              @for (m of metas(); track m.id) {
                <div class="goal">
                  <div class="goal-t"><strong>{{ m.metrica_nombre }}</strong><span class="muted small">{{ periodoMeta(m) }}</span>
                    @if (esAdmin()) { <button mat-icon-button class="goal-edit" (click)="editarMeta(m)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button> }</div>
                  <app-meta-bar [porcentaje]="m.porcentaje" [tiempoPct]="m.tiempo_pct" [estado]="m.estado" [etiqueta]="m.metrica_nombre" />
                  <div class="goal-n small"><span>{{ fmtMeta(m, m.real) }} {{ 'crm.goals.of' | translate }} {{ fmtMeta(m, m.valor_meta) }} · {{ m.porcentaje }} %</span><app-meta-estado [estado]="m.estado" /></div>
                </div>
              } @empty { <p class="muted">{{ 'crm.goals.profile_empty' | translate }}</p> }
              @if (det.hijas.length && metas().length) { <span class="muted small">{{ 'crm.goals.profile_children' | translate }}</span> }
            </section>
          }

          @if (det.campos.length) {
            <section class="card">
              <h2>{{ 'crm.form.custom' | translate }}</h2>
              <dl id="profile-custom">
                @for (f of det.campos; track f.id) { <div><dt>{{ f.etiqueta }}</dt><dd>{{ valor(f) }}</dd></div> }
              </dl>
            </section>
          }
        </div>

        <footer class="audit muted small" id="audit-info">
          <span>{{ 'crm.profile.created' | translate: { date: fmtDt(c.created_at), user: c.creado_por_nombre || '—' } }}</span>
          <span>{{ 'crm.profile.modified' | translate: { date: fmtDt(c.updated_at), user: c.modificado_por_nombre || '—' } }}</span>
        </footer>
      } @else if (notFound()) {
        <div class="empty-state">
          <mat-icon>search_off</mat-icon><strong>{{ 'crm.profile.not_found' | translate }}</strong>
          <a mat-button routerLink="/m/crm/contactos">{{ 'crm.back' | translate }}</a>
        </div>
      }
    </div>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
    .avatar {
      width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; flex: none; font: var(--mat-sys-title-medium);
      background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
      &[data-tipo='organizacion'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    }
    .title { flex: 1 1 200px; min-width: 0; h1 { margin: 0; font: var(--mat-sys-headline-small); overflow-wrap: anywhere; } }
    .badges { display: flex; gap: 6px; margin-top: 4px; }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .pill.warn { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
    .actions { display: flex; align-items: center; gap: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
    .card { padding: 20px; border-radius: 20px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); min-width: 0; }
    .card h2 { margin: 0 0 12px; font: var(--mat-sys-title-medium); }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; } }
    dl { margin: 0; display: flex; flex-direction: column; gap: 10px; }
    dl > div { display: flex; flex-direction: column; }
    dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .link-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; text-decoration: none; color: inherit; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } }
    .link-text { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .star { color: var(--md-sys-color-primary); font-variation-settings: 'FILL' 1; }
    .small { font: var(--mat-sys-body-small); }
    .inline-link { color: var(--md-sys-color-primary); }
    .audit { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 20px; }
    .more-opps { align-self: flex-start; }
    .sales-k { flex-direction: row; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 8px; }
    .sale { width: 100%; border: none; background: none; cursor: pointer; text-align: left; font: inherit; }
    .goal { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-of-type { border: none; } }
    .goal-t { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; overflow-wrap: anywhere; } .goal-edit { margin: -8px 0 -8px auto; }
    .goal-n { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
  `,
})
export default class ContactoPerfilPage {
  /** Parámetro :id de la ruta (component input binding). */
  readonly id = input<string>();
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private session = inject(SessionService);
  private i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);

  readonly d = signal<ContactoDetalle | null>(null);
  readonly opps = signal<OportunidadFila[]>([]);
  readonly ventasRes = signal<ResumenVentas | null>(null);
  readonly ultimasVentas = signal<VentaFila[]>([]);
  readonly oppsTotal = signal(0);
  readonly metas = signal<Meta[]>([]);
  readonly notFound = signal(false);
  readonly canAudit = computed(() => this.session.hasMinRole('L2'));
  readonly esAdmin = computed(() => this.session.hasMinRole('L4'));
  readonly ini = computed(() => initials(this.d()?.contacto.nombre_completo ?? ''));
  readonly docLabel = computed(() => {
    const c = this.d()?.contacto;
    return c?.documento_numero ? [c.documento_tipo, c.documento_numero].filter(x => x).join(' ') : '';
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      // untracked: load() usa LoadingService.wrap(), que lee sus propias señales; sin esto el efecto se re-dispararía
      // con cada carga de cualquier otra pantalla o diálogo (bucle de recargas con el overlay siempre visible).
      if (id > 0) untracked(() => void this.load(id));
    });
  }

  async load(id = Number(this.id())): Promise<void> {
    this.notFound.set(false);
    const r = await this.loading.wrap(() => this.crm.getContacto(id));
    if (r.action && r.data) {
      this.d.set(r.data); void this.loadOpps(id); void this.loadVentas(id, r.data.hijas.length > 0);
      if (r.data.contacto.tipo === 'organizacion') void this.loadMetas(id);
    }
    else { this.d.set(null); this.notFound.set(true); }
  }

  /** Oportunidades activas de este contacto (como cliente o como persona de contacto). */
  private async loadOpps(id: number): Promise<void> {
    try {
      const r = await this.crm.listOportunidades({ contacto: id, archivo: 'activas' }, 1, 5, 'creado', 'desc');
      if (r.action && r.data) { this.opps.set(r.data.oportunidades); this.oppsTotal.set(r.data.total); }
    } catch { /* la tarjeta queda vacía: no impide ver el perfil */ }
  }

  /** Ventas de los últimos 12 meses (una organización suma las de sus dependientes). */
  private async loadVentas(id: number, conHijas: boolean): Promise<void> {
    try {
      const r = await this.crm.listVentas({ contacto: id, dependientes: conHijas, desde: rangoPeriodo('12m').desde ?? undefined }, 1, 3, 'fecha', 'desc');
      if (r.action && r.data) { this.ventasRes.set(r.data.resumen); this.ultimasVentas.set(r.data.ventas); }
    } catch { /* la tarjeta no aparece: no impide ver el perfil */ }
  }

  /**
   * Metas de esta organización: primero las vigentes (la más corta antes), luego las que empiezan en los próximos 45 días y al final
   * las terminadas en los últimos 60. Como mucho 6.
   */
  private async loadMetas(id: number): Promise<void> {
    const dia = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const hoy = dia(0);
    const grupo = (m: Meta) => (m.fecha_inicio <= hoy && m.fecha_fin >= hoy ? 0 : m.fecha_inicio > hoy ? 1 : 2);
    try {
      const r = await this.crm.listMetas({ id_contacto: id, desde: dia(-60), hasta: dia(45) }, { orden: 'periodo', dir: 'desc', porPagina: 50 });
      if (r.action && r.data) {
        this.metas.set([...r.data.metas].sort((a, b) => grupo(a) - grupo(b) || (grupo(a) === 2 ? b.fecha_fin.localeCompare(a.fecha_fin) : a.dias_total - b.dias_total || a.fecha_inicio.localeCompare(b.fecha_inicio))).slice(0, 6));
      }
    } catch { /* la tarjeta queda vacía: no impide ver el perfil */ }
  }

  periodoMeta(m: Meta): string { return periodoDe(this.i18n, m); }
  fmtMeta(m: Meta, n: number | null): string { return valorMetrica(this.cfg, this.i18n.lang(), m.formato, m.unidad, n); }
  nuevaMeta(): void {
    const c = this.d()?.contacto;
    if (c) abrirMetaDialog(this.matDialog, { contacto: { id: c.id, nombre: c.nombre_completo } }).afterClosed().subscribe(ok => { if (ok) void this.loadMetas(c.id); });
  }
  editarMeta(m: Meta): void {
    const c = this.d()?.contacto;
    if (c) abrirMetaDialog(this.matDialog, { meta: m }).afterClosed().subscribe(ok => { if (ok) void this.loadMetas(c.id); });
  }

  verVenta(v: VentaFila): void {
    this.matDialog.open(VentaDialogComponent, { ...dialogSize('720px'), data: v.id }).afterClosed().subscribe(cambio => { if (cambio) this.recargarVentas(); });
  }

  /** Carrito de venta manual con este contacto como cliente; al registrarla se recargan la tarjeta de ventas y las metas (el avance cambia al instante). */
  nuevaVenta(): void {
    const c = this.d()?.contacto;
    if (!c) return;
    abrirVentaManualDialog(this.matDialog, { contacto: { id: c.id, nombre: c.nombre_completo, tipo: c.tipo } }).afterClosed().subscribe(async r => {
      if (!r) return;
      this.recargarVentas();
      await this.dialogs.success({ title: this.i18n.t('crm.cart.saved'), message: this.i18n.t('crm.cart.saved_msg', { total: this.cfg.money(r.total), client: r.cliente }) });
    });
  }

  private recargarVentas(): void {
    const det = this.d();
    if (!det) return;
    void this.loadVentas(det.contacto.id, det.hijas.length > 0);
    if (det.contacto.tipo === 'organizacion') void this.loadMetas(det.contacto.id);
  }

  newOpp(): void {
    const c = this.d()?.contacto;
    if (c) abrirOportunidadDialog(this.matDialog, { contacto: { id: c.id, nombre: c.nombre_completo, tipo: c.tipo } }).afterClosed().subscribe(r => { if (r) void this.loadOpps(c.id); });
  }

  fmt(iso: string): string { return isoToDmy(iso); }
  coords(lat: number, lng: number): string { return formatCoords(lat, lng); }
  url(lat: number, lng: number): string { return mapsUrl(lat, lng); }
  fmtDt(s: string): string { return formatDateTime(s); }

  valor(f: CampoConValor): string {
    const v = f.valor;
    if (v === null || v === '') return '—';
    if (typeof v === 'boolean') return this.i18n.t(v ? 'common.yes' : 'common.no');
    return f.tipo_dato === 'fecha' ? isoToDmy(String(v)) : String(v);
  }

  edit(): void {
    const c = this.d()?.contacto;
    if (!c) return;
    this.matDialog.open(ContactoDialogComponent, { ...dialogSize('720px'), data: { id: c.id }, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(async (r: ContactoDialogResult | undefined) => {
        if (!r) return;
        await this.load();
        const dup = r.advertencias?.find(a => a.tipo === 'documento_duplicado');
        if (dup) {
          await this.dialogs.info({
            title: this.i18n.t('crm.warn.dup_title'),
            message: this.i18n.t('crm.warn.dup_msg', { names: dup.contactos.map(x => x.nombre_completo).join(', ') }),
          });
        }
      });
  }

  editTags(): void {
    const det = this.d();
    if (!det) return;
    const actuales = det.tags.map(t => ({ id: t.id, nombre: t.nombre, color: t.color }));
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'), data: { seleccion: actuales.map(t => t.id), actuales, tipo: det.contacto.tipo },
    }).afterClosed().subscribe(async (r: TagPickerResult | undefined) => {
      if (!r) return;
      const res = await this.loading.wrap(() => this.crm.setTags(det.contacto.id, r.ids));
      if (!res.action) await this.dialogs.error({ title: this.i18n.t('crm.form.save_error'), message: res.mensaje });
      await this.load();
    });
  }

  history(): void {
    const c = this.d()?.contacto;
    if (c) this.matDialog.open(HistorialDialogComponent, { ...dialogSize('560px'), data: { id: c.id, nombre: c.nombre_completo } });
  }

  async toggleArchived(): Promise<void> {
    const c = this.d()?.contacto;
    if (!c) return;
    const archivar = c.activo;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(archivar ? 'crm.delete_one_title' : 'crm.restore_one_title'),
      message: this.i18n.t(archivar ? 'crm.delete_one_msg' : 'crm.restore_one_msg', { name: c.nombre_completo }),
      confirmText: this.i18n.t(archivar ? 'crm.delete' : 'crm.restore'), danger: archivar,
    });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.bulk(archivar ? 'archivar' : 'restaurar', { ids: [c.id] }));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: r.mensaje }); return; }
    if (archivar) await this.router.navigateByUrl('/m/crm/contactos');
    else await this.load();
  }
}

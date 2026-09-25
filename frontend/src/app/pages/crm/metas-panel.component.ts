import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmService, EstadoMeta, GrupoMetasOrg, Meta, PanelMetas } from '../../services/crm.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { abrirMetaDialog } from './meta-dialog.component';
import { nombreMes } from './metas-periodo';
import { ESTADO_ICONO, MetaBarComponent, MetaEstadoComponent, periodoDe, valorMetrica } from './metas-ui';

const ABIERTO_KEY = 'crm_metas_panel_abierto';
const ESTADOS_GRUPO: EstadoMeta[] = ['cumplida', 'en_ritmo', 'en_riesgo', 'atrasada', 'no_cumplida', 'futura'];

/**
 * Panel de metas en tres niveles: empresa (suma de todas las sedes), sede y organizaciones (por métrica y período, con las que piden atención).
 * `compacto`: para arriba de Oportunidades (se pliega y muestra lo esencial); completo: en la página de metas.
 */
@Component({
  selector: 'app-metas-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, MatButton, MatIconButton, MatIcon, MatTooltip, MetaBarComponent, MetaEstadoComponent, TranslatePipe],
  template: `
    @if (panel(); as p) {
      @if (hayMetas()) {
        <section class="panel" [class.compacto]="compacto()" id="metas-panel" [attr.aria-label]="'crm.goals.panel_title' | translate">
          @if (compacto()) {
            <header class="p-head">
              <button class="toggle" type="button" id="btn-metas-toggle" (click)="alternar()" [attr.aria-expanded]="abierto()">
                <mat-icon>flag</mat-icon><strong>{{ 'crm.goals.panel_title' | translate }}</strong><span class="muted">· {{ mesTexto() }}</span>
                @if (!abierto()) { <span class="resumen muted small">{{ resumenCerrado() }}</span> }
                <mat-icon class="chev">{{ abierto() ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
              <a mat-button routerLink="/m/crm/metas" id="link-metas">{{ 'crm.goals.see_all' | translate }}</a>
            </header>
          }
          @if (!compacto() || abierto()) {
            <div class="niveles">
              @if (p.empresa.length) {
                <div class="nivel" id="nivel-empresa">
                  <h3><mat-icon>domain</mat-icon>{{ 'crm.goals.level_empresa' | translate }}<span class="muted small" [matTooltip]="'crm.goals.level_empresa_hint' | translate">{{ 'crm.goals.all_sedes' | translate }}</span></h3>
                  @for (m of lista(p.empresa); track m.id) { <ng-container *ngTemplateOutlet="meta; context: { $implicit: m }" /> }
                  @if (lista(p.empresa).length < p.empresa.length) { <a class="mas small" routerLink="/m/crm/metas">{{ 'crm.goals.and_more' | translate: { n: p.empresa.length - lista(p.empresa).length } }}</a> }
                </div>
              }
              @if (p.sede.length) {
                <div class="nivel" id="nivel-sede">
                  <h3><mat-icon>store</mat-icon>{{ 'crm.goals.level_sede' | translate }}<span class="muted small">{{ session.sedeNombre() }}</span></h3>
                  @for (m of lista(p.sede); track m.id) { <ng-container *ngTemplateOutlet="meta; context: { $implicit: m }" /> }
                  @if (lista(p.sede).length < p.sede.length) { <a class="mas small" routerLink="/m/crm/metas" id="sede-mas">{{ 'crm.goals.and_more' | translate: { n: p.sede.length - lista(p.sede).length } }}</a> }
                </div>
              }
              @if (p.organizaciones.total) {
                <div class="nivel" id="nivel-orgs">
                  <h3><mat-icon>business</mat-icon>{{ 'crm.tipo.organizaciones' | translate }}
                    <span class="muted small">{{ 'crm.goals.orgs_with_goal' | translate: { n: p.organizaciones.con_meta, total: p.organizaciones.activas } }}</span></h3>
                  @for (g of grupos(p.organizaciones.grupos); track g.id_metrica + g.fecha_inicio + g.fecha_fin) {
                    <div class="grupo">
                      <div class="g-top"><strong>{{ g.metrica_nombre }}</strong><span class="muted small">{{ periodoTexto(g) }} · {{ 'crm.goals.n_goals' | translate: { n: g.n } }}</span></div>
                      <app-meta-bar [porcentaje]="g.porcentaje" [tiempoPct]="g.tiempo_pct" [estado]="estadoGrupo(g)" [etiqueta]="g.metrica_nombre" />
                      <div class="g-num small"><span>{{ fmt(g, g.real) }} {{ 'crm.goals.of' | translate }} {{ fmt(g, g.meta) }} · <b>{{ pct(g.porcentaje) }}</b></span>
                        <span class="cuentas">@for (e of estadosDe(g); track e.estado) { <span class="cuenta" [attr.data-estado]="e.estado" [matTooltip]="'crm.goals.st_' + e.estado | translate"><mat-icon>{{ icono(e.estado) }}</mat-icon>{{ e.n }}</span> }</span></div>
                    </div>
                  }
                  @if (grupos(p.organizaciones.grupos).length < p.organizaciones.grupos.length) { <a class="mas small" routerLink="/m/crm/metas">{{ 'crm.goals.and_more' | translate: { n: p.organizaciones.grupos.length - grupos(p.organizaciones.grupos).length } }}</a> }
                  @if (p.organizaciones.atencion.length) {
                    <div class="atencion" id="metas-atencion">
                      <span class="label">{{ 'crm.goals.attention' | translate }}@if (p.organizaciones.atencion_total > p.organizaciones.atencion.length) { <span class="muted"> ({{ p.organizaciones.atencion_total }})</span> }</span>
                      @for (m of atencion(p.organizaciones.atencion); track m.id) {
                        <a class="at-row" [routerLink]="['/m/crm/contactos', m.id_contacto]">
                          <span class="at-name">{{ m.contacto_nombre }}<span class="muted small"> · {{ m.metrica_nombre }}</span></span>
                          <span class="at-pct small">{{ pct(m.porcentaje) }}</span><app-meta-estado [estado]="m.estado" />
                        </a>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </section>
      } @else if (!compacto()) {
        <div class="empty-state" id="metas-vacio"><mat-icon>flag</mat-icon><strong>{{ 'crm.goals.empty_month' | translate }}</strong>
          @if (editable()) { <span class="muted">{{ 'crm.goals.empty_hint' | translate }}</span> }</div>
      } @else if (editable()) {
        <a class="hint-card" routerLink="/m/crm/metas" id="metas-sugerencia"><mat-icon>flag</mat-icon><span>{{ 'crm.goals.suggest' | translate }}</span><mat-icon>chevron_right</mat-icon></a>
      }
    }

    <ng-template #meta let-m>
      <article class="meta" [attr.data-estado]="m.estado">
        <div class="m-top">
          <div class="m-t"><strong>{{ m.metrica_nombre }}</strong><span class="muted small">{{ periodoTexto(m) }}@if (m.filtro) { · {{ m.filtro }} }</span></div>
          <app-meta-estado [estado]="m.estado" />
          @if (editable()) { <button mat-icon-button class="edit" (click)="editar(m)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button> }
        </div>
        <div class="m-num"><span class="real">{{ fmt(m, m.real) }}</span><span class="muted"> {{ 'crm.goals.of' | translate }} {{ fmt(m, m.valor_meta) }}</span><span class="pct">{{ pct(m.porcentaje) }}</span></div>
        <app-meta-bar [porcentaje]="m.porcentaje" [tiempoPct]="m.tiempo_pct" [estado]="m.estado" [etiqueta]="m.metrica_nombre" />
        @if (!compacto()) {
          <div class="m-foot muted small">
            @if (m.estado !== 'futura' && m.estado !== 'cumplida' && m.estado !== 'no_cumplida') { <span>{{ 'crm.goals.expected_today' | translate }}: {{ fmt(m, m.esperado) }}</span> }
            @if (m.proyeccion !== null && m.estado !== 'cumplida' && m.estado !== 'no_cumplida') { <span>{{ 'crm.goals.projection' | translate }}: {{ fmt(m, m.proyeccion) }}</span> }
            @if (m.faltante > 0 && m.dias_total > m.dias_transcurridos) { <span>{{ 'crm.goals.missing_days' | translate: { v: fmt(m, m.faltante), d: m.dias_total - m.dias_transcurridos } }}</span> }
          </div>
          @if (m.cobertura?.n) {
            @let c = m.cobertura!;
            <div class="m-cob small" [class.baja]="c.suma < m.valor_meta">
              {{ (m.ambito === 'empresa' ? 'crm.goals.coverage_empresa' : 'crm.goals.coverage_sede') | translate: { n: c.n, v: fmt(m, c.suma), p: pct(m.valor_meta ? c.suma / m.valor_meta * 100 : 0) } }}
            </div>
          }
        }
      </article>
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    .panel { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .panel.compacto { padding: 8px 12px 12px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .p-head { display: flex; align-items: center; gap: 8px; }
    .toggle { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; padding: 6px 4px; border: none; background: none; color: inherit; font: var(--mat-sys-title-small); cursor: pointer; text-align: left;
      .resumen { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .chev { margin-left: auto; } }
    .niveles { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; align-items: start; }
    .nivel { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .panel:not(.compacto) .nivel { padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0; font: var(--mat-sys-title-small); mat-icon { font-size: 20px; width: 20px; height: 20px; } }
    .meta { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant); }
    .m-top { display: flex; align-items: flex-start; gap: 8px; } .m-t { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .edit { margin: -8px -8px 0 0; }
    .m-num { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; .real { font: var(--mat-sys-title-large); } .pct { margin-left: auto; font: var(--mat-sys-title-medium); } }
    .compacto .m-num .real { font: var(--mat-sys-title-medium); }
    .m-foot { display: flex; flex-wrap: wrap; gap: 2px 14px; }
    .m-cob { padding: 4px 8px; border-radius: 8px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
      &.baja { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .grupo { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant); }
    .g-top { display: flex; flex-direction: column; overflow-wrap: anywhere; }
    .g-num { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
    .cuentas { display: flex; flex-wrap: wrap; gap: 4px; }
    .cuenta { display: inline-flex; align-items: center; gap: 2px; padding: 0 6px; border-radius: 6px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
      &[data-estado='cumplida'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-estado='en_riesgo'] { background: transparent; color: var(--md-sys-color-error); box-shadow: inset 0 0 0 1px var(--md-sys-color-error); }
      &[data-estado='atrasada'] { background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); }
      &[data-estado='no_cumplida'], &[data-estado='futura'] { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); } }
    .atencion { display: flex; flex-direction: column; gap: 2px; }
    .label { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    .at-row { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 8px; text-decoration: none; color: inherit; &:hover { background: var(--md-sys-color-surface-container-high); } }
    .at-name { flex: 1; min-width: 0; overflow-wrap: anywhere; } .at-pct { font: var(--mat-sys-label-large); }
    .mas { align-self: flex-start; color: var(--md-sys-color-primary); }
    .hint-card { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 10px 14px; border-radius: 12px; text-decoration: none; color: inherit;
      background: var(--md-sys-color-surface-container-low); border: 1px dashed var(--md-sys-color-outline-variant); span { flex: 1; } }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export class MetasPanelComponent {
  private crm = inject(CrmService);
  private matDialog = inject(MatDialog);
  readonly session = inject(SessionService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);

  /** Día que se mira (vigentes ese día; datos hasta ese día o hasta hoy). null = hoy. */
  readonly fecha = input<string | null>(null);
  readonly compacto = input(false);
  /** L4: puede editar las metas desde el panel. */
  readonly editable = input(false);
  /** Se emite tras editar una meta desde el panel. */
  readonly cambio = output<void>();

  readonly panel = signal<PanelMetas | null>(null);
  readonly abierto = signal(this.abiertoGuardado());
  readonly hayMetas = computed(() => { const p = this.panel(); return !!p && (p.empresa.length + p.sede.length + p.organizaciones.total) > 0; });
  readonly mesTexto = computed(() => nombreMes(this.panel()?.fecha ?? this.fecha() ?? new Date().toISOString().slice(0, 10), this.i18n.lang()));
  /** Plegado: «2 cumplidas · 1 atrasada…» de todas las metas del panel. */
  readonly resumenCerrado = computed(() => {
    const p = this.panel();
    if (!p) return '';
    const c: Partial<Record<EstadoMeta, number>> = {};
    for (const m of [...p.empresa, ...p.sede]) c[m.estado] = (c[m.estado] ?? 0) + 1;
    for (const e of ESTADOS_GRUPO) c[e] = (c[e] ?? 0) + (p.organizaciones.conteo[e] ?? 0);
    return ESTADOS_GRUPO.filter(e => c[e]).map(e => `${c[e]} ${this.i18n.t('crm.goals.st_' + e).toLocaleLowerCase()}`).join(' · ');
  });
  private reqId = 0;

  constructor() {
    effect(() => {
      const f = this.fecha();
      untracked(() => void this.load(f));
    });
  }

  private abiertoGuardado(): boolean {
    try { return localStorage.getItem(ABIERTO_KEY) !== '0'; } catch { return true; }
  }

  async load(fecha = this.fecha()): Promise<void> {
    const id = ++this.reqId;
    try {
      const r = await this.crm.panelMetas(fecha ?? undefined);
      if (id === this.reqId) this.panel.set(r.action && r.data ? r.data : null);
    } catch { if (id === this.reqId) this.panel.set(null); /* sin panel: no impide usar la pantalla */ }
  }

  alternar(): void {
    this.abierto.update(v => !v);
    try { localStorage.setItem(ABIERTO_KEY, this.abierto() ? '1' : '0'); } catch { /* solo se pierde la preferencia */ }
  }

  /** El backend ya las ordena (la más corta primero y por el orden de la métrica); en modo compacto se muestran dos por nivel. */
  lista(l: Meta[]): Meta[] { return this.compacto() ? l.slice(0, 2) : l; }
  grupos(l: GrupoMetasOrg[]): GrupoMetasOrg[] { return this.compacto() ? l.slice(0, 2) : l; }
  atencion(l: Meta[]): Meta[] { return this.compacto() ? l.slice(0, 3) : l; }

  estadosDe(g: GrupoMetasOrg): { estado: EstadoMeta; n: number }[] { return ESTADOS_GRUPO.filter(e => g.estados[e]).map(e => ({ estado: e, n: g.estados[e] })); }
  /** Estado del grupo por su suma (misma regla que una meta sola). */
  estadoGrupo(g: GrupoMetasOrg): EstadoMeta {
    if (g.estados.futura === g.n) return 'futura';
    if (g.meta > 0 && g.real >= g.meta) return 'cumplida';
    if (g.tiempo_pct >= 100) return 'no_cumplida';
    if (g.real >= g.esperado) return 'en_ritmo';
    return g.real >= g.esperado * 0.9 ? 'en_riesgo' : 'atrasada';
  }
  icono(e: EstadoMeta): string { return ESTADO_ICONO[e]; }
  periodoTexto(m: Pick<Meta, 'periodo' | 'fecha_inicio' | 'fecha_fin'>): string { return periodoDe(this.i18n, m); }
  fmt(m: { formato: Meta['formato']; unidad: string | null }, n: number | null): string { return valorMetrica(this.cfg, this.i18n.lang(), m.formato, m.unidad, n); }
  pct(n: number): string { return `${n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: n < 10 ? 1 : 0 })} %`; }

  editar(m: Meta): void {
    abrirMetaDialog(this.matDialog, { meta: m }).afterClosed().subscribe(ok => { if (ok) { void this.load(); this.cambio.emit(); } });
  }
}

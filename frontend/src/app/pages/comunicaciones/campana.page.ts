import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { DateInputComponent } from '../../components/date-input.component';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { AudienciaCampana, Campana, ComunicacionesService, Destinatario, EstimacionCampana, Linea, PlantillaCom } from '../../services/comunicaciones.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { ContactoFila, CrmService, CrmTag } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { ReportService } from '../../services/reports/report.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime } from '../crm/crm-format';
import { TranslatedPaginatorIntl } from '../crm/translated-paginator-intl';
import { CampanaHandoffService } from './campana-handoff.service';
import { CAMP_EN_CURSO } from './campanas.page';
import { etiquetaOrigen } from './enviar-plantilla-dialog.component';
import { WaPreviewComponent } from './wa-preview.component';

type ModoAudiencia = 'etiquetas' | 'todos' | 'seleccion';

/**
 * Una campaña. En borrador: asistente (plantilla aprobada, audiencia por etiquetas / todos / selección traída de Contactos, variables,
 * enlace de destino, encabezado, programación), estimación de destinatarios y créditos frente al saldo, envío de prueba y «Lanzar».
 * Lanzada: reporte en vivo (avance, entregados, leídos, fallidos con motivo, respuestas, clics, créditos), pausar/reanudar/cancelar y exportar.
 */
@Component({
  selector: 'app-campana-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [FormsModule, RouterLink, MatButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatLabel, MatHint, MatPrefix, MatIcon, MatInput, MatPaginator,
    MatProgressBar, MatRadioGroup, MatRadioButton, MatSelect, MatOption, MatSlideToggle, ContactoPickerComponent, DateInputComponent, ExportMenuComponent,
    TagChipComponent, WaPreviewComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="tt">
          <a mat-icon-button routerLink="/m/comunicaciones/campanas" [attr.aria-label]="'com.back' | translate" class="back"><mat-icon>arrow_back</mat-icon></a>
          <h1>{{ c()?.nombre || ('com.camp.new' | translate) }}</h1>
          @if (c(); as x) { <span class="estado" [attr.data-estado]="x.estado">{{ 'com.camp.st.' + x.estado | translate }}</span> }
        </div>
        @if (lanzada()) {
          <div class="actions">
            <app-export-menu [alcances]="alcances()" (exportar)="exportar($event)" />
            @if (c()!.estado === 'pausada') { <button mat-flat-button id="btn-resume" (click)="accion('reanudar')"><mat-icon>play_arrow</mat-icon>{{ 'com.camp.resume' | translate }}</button> }
            @else if (enCurso()) { <button mat-stroked-button id="btn-pause" (click)="accion('pausar')"><mat-icon>pause</mat-icon>{{ 'com.camp.pause' | translate }}</button> }
            @if (enCurso()) { <button mat-stroked-button id="btn-cancel" class="danger" (click)="accion('cancelar')"><mat-icon>cancel</mat-icon>{{ 'com.camp.cancel' | translate }}</button> }
          </div>
        } @else {
          <div class="actions">
            @if (c()) { <button mat-button id="btn-delete-draft" (click)="eliminarBorrador()"><mat-icon>delete</mat-icon>{{ 'common.delete' | translate }}</button> }
            <button mat-stroked-button id="btn-save-camp" [disabled]="ocupado()" (click)="guardar()"><mat-icon>save</mat-icon>{{ 'com.camp.save_draft' | translate }}</button>
          </div>
        }
      </header>

      @if (!lanzada()) {
        <div class="layout">
          <div class="form">
            <section class="block">
              <h2><span class="num">1</span>{{ 'com.camp.s_message' | translate }}</h2>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'com.camp.name' | translate }}</mat-label>
                <input matInput id="camp-name" [ngModel]="nombre()" (ngModelChange)="nombre.set($event)" maxlength="150" />
              </mat-form-field>
              @if (lineas().length > 1) {
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'com.line' | translate }}</mat-label>
                  <mat-select id="camp-line" [ngModel]="idLinea()" (ngModelChange)="idLinea.set($event); cargarPlantillas()">
                    @for (l of lineas(); track l.id) { <mat-option [value]="l.id">{{ l.nombre }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              }
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'com.camp.template' | translate }}</mat-label>
                <mat-select id="camp-template" [ngModel]="idPlantilla()" (ngModelChange)="idPlantilla.set($event)">
                  @for (p of plantillas(); track p.id) {
                    <mat-option [value]="p.id">{{ p.nombre }} · {{ 'com.tpl.cat.' + (p.categoria || p.categoria_solicitada) | translate }} · {{ p.creditos }} {{ 'com.credits_short' | translate }}</mat-option>
                  }
                </mat-select>
                <mat-hint>@if (!plantillas().length) { {{ 'com.camp.no_templates' | translate }} <a routerLink="/m/comunicaciones/plantillas">{{ 'com.tpl.title' | translate }}</a> } @else { {{ 'com.camp.template_hint' | translate }} }</mat-hint>
              </mat-form-field>
            </section>

            <section class="block">
              <h2><span class="num">2</span>{{ 'com.camp.s_audience' | translate }}</h2>
              <mat-radio-group class="radios" [ngModel]="modo()" (ngModelChange)="modo.set($event)">
                <mat-radio-button value="etiquetas" id="aud-tags">{{ 'com.camp.aud_tags' | translate }}</mat-radio-button>
                <mat-radio-button value="todos" id="aud-all">{{ 'com.camp.aud_all' | translate }}</mat-radio-button>
                @if (seleccion()) { <mat-radio-button value="seleccion" id="aud-sel">{{ 'com.camp.aud_selection' | translate: { n: seleccion()!.n } }}</mat-radio-button> }
              </mat-radio-group>
              @if (modo() === 'etiquetas') {
                <div class="tags">
                  @for (t of tags(); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> } @empty { <span class="muted">{{ 'com.camp.no_tags' | translate }}</span> }
                  <button mat-button id="btn-pick-tags" (click)="elegirTags()"><mat-icon>label</mat-icon>{{ 'com.camp.pick_tags' | translate }}</button>
                </div>
                @if (tags().length > 1) {
                  <mat-button-toggle-group [ngModel]="tagsModo()" (ngModelChange)="tagsModo.set($event)" [hideSingleSelectionIndicator]="true">
                    <mat-button-toggle value="cualquiera">{{ 'crm.filters.tags_any' | translate }}</mat-button-toggle>
                    <mat-button-toggle value="todos">{{ 'crm.filters.tags_all' | translate }}</mat-button-toggle>
                  </mat-button-toggle-group>
                }
              }
              @if (modo() === 'seleccion' && seleccion(); as s) {
                <ul class="desc">@for (l of s.descripcion; track $index) { <li>{{ l }}</li> }</ul>
              }
              <mat-slide-toggle [ngModel]="orgs()" (ngModelChange)="orgs.set($event)">{{ 'com.camp.include_orgs' | translate }}</mat-slide-toggle>
              <p class="muted small">{{ 'com.camp.audience_hint' | translate }}</p>
            </section>

            @if (plantilla(); as p) {
              @if (manuales().length || p.encabezado?.variable?.origen === 'manual' || tieneEnlace() || (p.encabezado && p.encabezado.tipo !== 'texto')) {
                <section class="block">
                  <h2><span class="num">3</span>{{ 'com.camp.s_content' | translate }}</h2>
                  @if (p.encabezado?.variable?.origen === 'manual') {
                    <mat-form-field appearance="outline"><mat-label>{{ 'com.send_tpl.header_var' | translate }}</mat-label>
                      <input matInput [ngModel]="valores()['h1'] ?? ''" (ngModelChange)="setValor('h1', $event)" maxlength="60" [placeholder]="p.encabezado?.variable?.ejemplo ?? ''" /></mat-form-field>
                  }
                  @for (v of manuales(); track v.n) {
                    <mat-form-field appearance="outline"><mat-label>{{ 'com.send_tpl.var' | translate: { n: v.n } }}</mat-label>
                      <input matInput [id]="'camp-var-' + v.n" [ngModel]="valores()[v.n] ?? ''" (ngModelChange)="setValor(v.n, $event)" maxlength="500" [placeholder]="v.ejemplo" />
                      <mat-hint>{{ 'com.camp.same_for_all' | translate }}</mat-hint></mat-form-field>
                  }
                  @if (tieneEnlace()) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.send_tpl.link' | translate }}</mat-label>
                      <input matInput id="camp-link" type="url" [ngModel]="enlace()" (ngModelChange)="enlace.set($event)" placeholder="https://" maxlength="1000" />
                      <mat-hint>{{ 'com.camp.link_hint' | translate }}</mat-hint></mat-form-field>
                  }
                  @if (p.encabezado && p.encabezado.tipo !== 'texto') {
                    <div class="file">
                      <button mat-stroked-button type="button" (click)="mediaInput.click()"><mat-icon>upload_file</mat-icon>{{ 'com.send_tpl.file_' + p.encabezado.tipo | translate }}</button>
                      <span class="muted">{{ c()?.media_nombre || ('com.send_tpl.no_file' | translate) }}</span>
                      <input #mediaInput type="file" hidden [accept]="p.encabezado.tipo === 'imagen' ? 'image/jpeg,image/png' : p.encabezado.tipo === 'video' ? 'video/mp4' : 'application/pdf'"
                             (change)="subirMedia($event)" />
                    </div>
                  }
                </section>
              }
            }

            <section class="block">
              <h2><span class="num">4</span>{{ 'com.camp.s_when' | translate }}</h2>
              <mat-radio-group class="radios" [ngModel]="programar()" (ngModelChange)="programar.set($event)">
                <mat-radio-button [value]="false">{{ 'com.camp.now' | translate }}</mat-radio-button>
                <mat-radio-button [value]="true" id="camp-schedule">{{ 'com.camp.schedule' | translate }}</mat-radio-button>
              </mat-radio-group>
              @if (programar()) {
                <div class="form-row">
                  <app-date-input [label]="'com.camp.date' | translate" [value]="fechaProg()" (valueChange)="fechaProg.set($event)" />
                  <mat-form-field appearance="outline"><mat-label>{{ 'com.camp.time' | translate }}</mat-label>
                    <input matInput type="time" [ngModel]="horaProg()" (ngModelChange)="horaProg.set($event)" /></mat-form-field>
                </div>
              }
            </section>

            <section class="block">
              <h2><span class="num">5</span>{{ 'com.camp.s_review' | translate }}</h2>
              <button mat-stroked-button id="btn-estimate" [disabled]="ocupado() || !listo()" (click)="estimar()"><mat-icon>calculate</mat-icon>{{ 'com.camp.estimate' | translate }}</button>
              @if (est(); as e) {
                <div class="est" id="camp-estimate">
                  <div class="big"><strong>{{ num(e.destinatarios) }}</strong> {{ 'com.camp.recipients' | translate }}</div>
                  <ul class="small">
                    <li>{{ 'com.camp.selected' | translate: { n: num(e.seleccionados) } }}</li>
                    @if (e.sin_whatsapp) { <li>{{ 'com.camp.no_wa' | translate: { n: num(e.sin_whatsapp) } }}</li> }
                    @if (e.bajas) { <li>{{ 'com.camp.optouts' | translate: { n: num(e.bajas) } }}</li> }
                    @if (e.repetidos) { <li>{{ 'com.camp.dupes' | translate: { n: num(e.repetidos) } }}</li> }
                  </ul>
                  <div class="credits" [class.falta]="!e.alcanza">
                    <span>{{ 'com.camp.credits_needed' | translate: { n: num(e.creditos), each: e.creditos_por_mensaje } }}</span>
                    <span>{{ 'com.camp.balance' | translate: { n: num(e.saldo) } }}</span>
                    @if (!e.alcanza && e.destinatarios) { <strong>{{ 'com.camp.not_enough' | translate }}</strong> }
                  </div>
                  @if (e.cupo_24h !== null && e.cupo_24h < e.destinatarios) { <p class="warn small"><mat-icon>schedule</mat-icon>{{ 'com.camp.quota' | translate: { n: num(e.cupo_24h) } }}</p> }
                  @if (e.muestra?.faltan?.length) { <p class="warn small"><mat-icon>warning</mat-icon>{{ 'com.camp.missing_data' | translate }}</p> }
                  <p class="muted small">{{ 'com.camp.charge_note' | translate }}</p>
                </div>
              }
              <div class="prueba">
                <app-contacto-picker tipo="persona" [label]="'com.camp.test_to' | translate" (picked)="contactoPrueba.set($event)" />
                <button mat-stroked-button id="btn-test-camp" [disabled]="ocupado() || !contactoPrueba() || !listo()" (click)="probar()"><mat-icon>send</mat-icon>{{ 'com.camp.send_test' | translate }}</button>
              </div>
              @if (contactoPrueba(); as cp) { <p class="muted small">{{ 'com.camp.test_hint' | translate: { name: cp.nombre_completo } }}</p> }
              <button mat-flat-button id="btn-launch" class="launch" [disabled]="ocupado() || !est() || !est()!.alcanza || !est()!.destinatarios" (click)="lanzar()">
                <mat-icon>rocket_launch</mat-icon>{{ (programar() ? 'com.camp.launch_scheduled' : 'com.camp.launch') | translate }}</button>
              @if (!est()) { <p class="muted small">{{ 'com.camp.estimate_first' | translate }}</p> }
            </section>
          </div>
          <aside class="side">
            <div class="sticky">
              <h3>{{ 'com.tpl.preview' | translate }}</h3>
              @if (plantilla(); as p) {
                <app-wa-preview [encabezadoTipo]="p.encabezado?.tipo ?? 'ninguno'" [encabezadoTexto]="encPreview()" [cuerpo]="cuerpoPreview()" [pie]="p.pie" [botones]="p.botones"
                                [mediaNombre]="c()?.media_nombre ?? null" />
                @if (est()?.muestra; as m) { <p class="muted small">{{ 'com.camp.preview_for' | translate: { name: m.nombre } }}</p> }
              } @else { <p class="muted">{{ 'com.camp.pick_template' | translate }}</p> }
            </div>
          </aside>
        </div>
      } @else if (c(); as x) {
        @if (x.motivo_pausa) { <div class="banner"><mat-icon>info</mat-icon><span>{{ x.motivo_pausa }}</span></div> }
        <p class="muted">{{ x.plantilla_nombre }} · {{ x.linea_nombre }} · {{ (x.programada_para && !x.iniciada_at ? 'com.camp.scheduled_for' : 'com.camp.started_at') | translate: { d: fecha(x.iniciada_at || x.programada_para) } }}
          @if (x.completada_at) { · {{ 'com.camp.finished_at' | translate: { d: fecha(x.completada_at) } }} }</p>
        <mat-progress-bar mode="determinate" [value]="avance()" />
        <div class="kpis">
          @for (k of kpis(); track k.id) {
            @if (k.filtro === null) {
              <div class="kpi info" [attr.data-k]="k.id"><strong>{{ num(k.n) }}</strong><span>{{ 'com.camp.k.' + k.id | translate }}</span></div>
            } @else {
              <button class="kpi" [class.on]="filtroDest() === k.filtro" [attr.data-k]="k.id" (click)="filtrarDest(k.filtro ?? '')">
                <strong>{{ num(k.n) }}</strong><span>{{ 'com.camp.k.' + k.id | translate }}</span>@if (k.pct !== null) { <span class="muted small">{{ k.pct }} %</span> }
              </button>
            }
          }
        </div>
        @if (x.errores?.length) {
          <section class="errs">
            <h3>{{ 'com.camp.failures' | translate }}</h3>
            @for (e of x.errores; track $index) { <div class="erow"><span>{{ e.error || '—' }}</span><strong>{{ e.n }}</strong></div> }
          </section>
        }
        <div class="dhead">
          <h2>{{ 'com.camp.recipients_list' | translate }}</h2>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [ngModel]="qDest()" (ngModelChange)="buscarDest($event)" [placeholder]="'com.inbox.search' | translate" />
          </mat-form-field>
        </div>
        <div class="table-scroll">
          <table class="tbl" id="dest-table">
            <thead><tr><th>{{ 'com.camp.contact' | translate }}</th><th>WhatsApp</th><th>{{ 'com.camp.state' | translate }}</th><th>{{ 'com.camp.sent_at' | translate }}</th>
              <th>{{ 'com.camp.k.replies' | translate }}</th><th>{{ 'com.camp.k.clicks' | translate }}</th><th>{{ 'com.camp.detail' | translate }}</th></tr></thead>
            <tbody>
              @for (d of dests(); track d.id) {
                <tr>
                  <td>@if (d.id_contacto) { <a [routerLink]="['/m/comunicaciones/contactos', d.id_contacto]">{{ d.nombre || '—' }}</a> } @else { {{ d.nombre || '—' }} }</td>
                  <td>+{{ d.wa_id }}</td>
                  <td><span class="dest" [attr.data-estado]="d.estado">{{ 'com.camp.dst.' + d.estado | translate }}</span></td>
                  <td>{{ fecha(d.enviado_at) }}</td>
                  <td>{{ d.respondio_at ? fecha(d.respondio_at) : '' }}</td>
                  <td>{{ d.clic_at ? fecha(d.clic_at) : '' }}</td>
                  <td class="err">{{ d.error || '' }}</td>
                </tr>
              } @empty { <tr><td colspan="7" class="muted">—</td></tr> }
            </tbody>
          </table>
        </div>
        <mat-paginator [length]="totalDest()" [pageIndex]="paginaDest()" [pageSize]="50" [hidePageSize]="true" (page)="paginarDest($event)" />
      }
    </div>
  `,
  styles: `
    .tt { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; h1 { overflow-wrap: anywhere; } }
    .estado { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest);
      &[data-estado='enviando'], &[data-estado='programada'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-estado='completada'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
      &[data-estado='esperando_saldo'], &[data-estado='esperando_cupo'], &[data-estado='pausada'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); } }
    .danger { color: var(--md-sys-color-error); }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
    @media (max-width: 959px) { .layout { grid-template-columns: 1fr; } .sticky { position: static !important; } }
    .form { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .block { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 16px; background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant); h2 { margin: 0; font: var(--mat-sys-title-medium); display: flex; align-items: center; gap: 10px; } }
    .num { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: var(--mat-sys-label-large); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
    .radios { display: flex; flex-wrap: wrap; gap: 4px 24px; }
    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .desc { margin: 0; padding-left: 20px; font: var(--mat-sys-body-small); }
    .file { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .est { display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 12px; background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant);
      ul { margin: 0; padding-left: 20px; } .big { font: var(--mat-sys-title-large); } }
    .credits { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 8px 10px; border-radius: 8px; background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
      &.falta { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .warn { display: flex; gap: 6px; align-items: center; color: var(--md-sys-color-tertiary); mat-icon { width: 18px; height: 18px; font-size: 18px; } }
    .prueba { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; app-contacto-picker { flex: 1 1 240px; } }
    .launch { align-self: flex-start; }
    .sticky { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; h3 { margin: 0; font: var(--mat-sys-title-small); } }
    .banner { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-radius: 12px; margin-bottom: 12px; background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
    .kpi { display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 12px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container-low);
      color: inherit; font: inherit; text-align: left; cursor: pointer; strong { font: var(--mat-sys-headline-small); } &.on { outline: 2px solid var(--md-sys-color-primary); } &.info { cursor: default; } }
    .errs { padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container);
      h3 { margin: 0 0 6px; font: var(--mat-sys-title-small); } .erow { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; } }
    .dhead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; h2 { margin: 0; font: var(--mat-sys-title-large); } .search { flex: 0 1 280px; } }
    .tbl { width: 100%; border-collapse: collapse; th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--md-sys-color-outline-variant); white-space: nowrap; }
      th { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); } .err { color: var(--md-sys-color-error); white-space: normal; min-width: 180px; } }
    .dest { padding: 2px 8px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest);
      &[data-estado='leido'], &[data-estado='entregado'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-estado='fallido'] { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
  `,
})
export default class CampanaPage implements OnDestroy {
  readonly id = input<string>('');
  private com = inject(ComunicacionesService);
  private crm = inject(CrmService);
  private handoff = inject(CampanaHandoffService);
  private router = inject(Router);
  private matDialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private reports = inject(ReportService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  readonly i18n = inject(TranslationService);

  readonly c = signal<Campana | null>(null);
  readonly lineas = signal<Linea[]>([]);
  readonly plantillas = signal<PlantillaCom[]>([]);
  readonly nombre = signal('');
  readonly idLinea = signal<number | null>(null);
  readonly idPlantilla = signal<number | null>(null);
  readonly modo = signal<ModoAudiencia>('etiquetas');
  readonly tags = signal<CrmTag[]>([]);
  readonly tagsModo = signal<'cualquiera' | 'todos'>('cualquiera');
  readonly orgs = signal(false);
  readonly seleccion = signal<{ audiencia: AudienciaCampana; n: number; descripcion: string[] } | null>(null);
  readonly valores = signal<Record<string, string>>({});
  readonly enlace = signal('');
  readonly programar = signal(false);
  readonly fechaProg = signal<string | null>(null);
  readonly horaProg = signal('08:00');
  readonly est = signal<EstimacionCampana | null>(null);
  readonly contactoPrueba = signal<ContactoFila | null>(null);
  readonly ocupado = signal(false);
  readonly dests = signal<Destinatario[]>([]);
  readonly totalDest = signal(0);
  readonly paginaDest = signal(0);
  readonly filtroDest = signal('');
  readonly qDest = signal('');
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  private timer = setInterval(() => { if (document.visibilityState === 'visible' && this.enCurso()) void this.refrescar(); }, 5000);

  readonly lanzada = computed(() => !!this.c() && this.c()!.estado !== 'borrador');
  readonly enCurso = computed(() => !!this.c() && CAMP_EN_CURSO.includes(this.c()!.estado));
  readonly plantilla = computed(() => this.plantillas().find(p => p.id === this.idPlantilla()) ?? this.c()?.plantilla ?? null);
  readonly manuales = computed(() => (this.plantilla()?.variables ?? []).filter(v => v.origen === 'manual'));
  readonly tieneEnlace = computed(() => (this.plantilla()?.botones ?? []).some(b => b.tipo === 'enlace' && !b.externa));
  readonly listo = computed(() => !!this.nombre().trim() && !!this.idLinea() && !!this.idPlantilla() && (this.modo() !== 'etiquetas' || this.tags().length > 0));
  readonly cuerpoPreview = computed(() => {
    const p = this.plantilla();
    if (!p) return '';
    const vals = this.valores();
    return p.cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const v = p.variables.find(x => x.n === Number(n));
      return !v ? '' : v.origen === 'manual' ? (vals[n] || `[${v.ejemplo}]`) : etiquetaOrigen(k => this.i18n.t(k), v);
    });
  });
  readonly encPreview = computed(() => {
    const e = this.plantilla()?.encabezado;
    if (!e || e.tipo !== 'texto') return null;
    const v = e.variable;
    return (e.texto ?? '').replace(/\{\{\s*1\s*\}\}/, v ? (v.origen === 'manual' ? (this.valores()['h1'] || `[${v.ejemplo}]`) : etiquetaOrigen(k => this.i18n.t(k), v)) : '');
  });
  readonly avance = computed(() => { const k = this.c()?.conteos; return k?.total ? Math.round(((k.total - k.pendientes) / k.total) * 100) : 0; });
  readonly kpis = computed(() => {
    const k = this.c()?.conteos;
    if (!k) return [];
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    return [
      { id: 'total', n: k.total, pct: null, filtro: '' }, { id: 'sent', n: k.enviados, pct: pct(k.enviados, k.total), filtro: 'enviado' },
      { id: 'delivered', n: k.entregados, pct: pct(k.entregados, k.enviados), filtro: 'entregado' }, { id: 'read', n: k.leidos, pct: pct(k.leidos, k.enviados), filtro: 'leido' },
      { id: 'replies', n: k.respuestas, pct: pct(k.respuestas, k.enviados), filtro: 'respondieron' }, { id: 'clicks', n: k.clics, pct: pct(k.clics, k.enviados), filtro: 'clics' },
      { id: 'failed', n: k.fallidos, pct: pct(k.fallidos, k.total), filtro: 'fallido' }, { id: 'skipped', n: k.omitidos, pct: null, filtro: 'omitido' },
      { id: 'pending', n: k.pendientes, pct: null, filtro: 'pendiente' }, { id: 'credits', n: k.creditos, pct: null, filtro: null },
    ];
  });
  readonly alcances = computed<ExportAlcance[]>(() => [{ id: 'dest', etiqueta: this.i18n.t('com.camp.export_recipients', { n: this.totalDest() }) }]);

  constructor() {
    effect(() => { const r = this.id(); untracked(() => void this.cargar(r)); });
  }
  ngOnDestroy(): void { clearInterval(this.timer); if (this.qTimer) clearTimeout(this.qTimer); }

  @HostListener('window:beforeunload', ['$event'])
  antesDeSalir(ev: BeforeUnloadEvent): void { if (!this.lanzada() && this.nombre() && !this.c()) ev.preventDefault(); }

  private async cargar(ruta: string): Promise<void> {
    const l = await this.com.listLineasSede();
    if (l.action && l.data) { this.lineas.set(l.data.lineas); if (!this.idLinea() && l.data.lineas.length) this.idLinea.set(l.data.lineas[0].id); }
    const id = Number(ruta);
    if (id > 0) {
      await this.refrescar(true);
      const x = this.c();
      if (!x) return;
      if (x.estado === 'borrador') this.llenar(x);
      else await this.cargarDest();
    } else {
      this.nombre.set(this.i18n.t('com.camp.default_name', { d: new Date().toLocaleDateString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO') }));
      const h = this.handoff.tomar();
      if (h) { this.seleccion.set(h); this.modo.set('seleccion'); }
    }
    await this.cargarPlantillas();
  }

  private llenar(x: Campana): void {
    this.nombre.set(x.nombre); this.idLinea.set(x.id_linea); this.idPlantilla.set(x.id_plantilla);
    this.valores.set(Array.isArray(x.valores) ? {} : (x.valores ?? {})); this.enlace.set(x.enlace_destino ?? '');
    const a = x.audiencia;
    this.orgs.set(!!a?.organizaciones);
    if (a && 'filtros' in a) {
      const f = a.filtros;
      const soloTags = Object.keys(f).every(k => ['estado', 'tags', 'tags_modo'].includes(k)) && !a.excluidos.length;
      if (soloTags && f.tags?.length) { this.modo.set('etiquetas'); this.tagsModo.set(f.tags_modo ?? 'cualquiera'); void this.cargarTags(f.tags); }
      else if (soloTags) this.modo.set('todos');
      else { this.seleccion.set({ audiencia: a, n: 0, descripcion: [this.i18n.t('com.camp.aud_saved')] }); this.modo.set('seleccion'); }
    } else if (a && 'ids' in a) {
      this.seleccion.set({ audiencia: a, n: a.ids.length, descripcion: [this.i18n.t('crm.export.selection_manual', { n: a.ids.length })] }); this.modo.set('seleccion');
    }
    if (x.programada_para) { this.programar.set(true); this.fechaProg.set(x.programada_para.slice(0, 10)); this.horaProg.set(x.programada_para.slice(11, 16)); }
  }

  private async cargarTags(ids: number[]): Promise<void> {
    const r = await this.crm.listTags(false);
    if (r.action && r.data) this.tags.set(r.data.tags.filter(t => ids.includes(t.id)).map(t => ({ id: t.id, nombre: t.nombre, color: t.color })));
  }

  async cargarPlantillas(): Promise<void> {
    const r = await this.com.listPlantillas({ enviables: true, idLinea: this.idLinea() });
    if (r.action && r.data) this.plantillas.set(r.data.plantillas);
  }

  private async refrescar(conLoader = false): Promise<void> {
    const id = Number(this.id());
    if (!id) return;
    const f = () => this.com.getCampana(id);
    const r = conLoader ? await this.loading.wrap(f) : await f();
    if (!r.action || !r.data) {
      if (conLoader) { await this.dialogs.error({ title: this.i18n.t('com.camp.load_error'), message: r.mensaje }); void this.router.navigateByUrl('/m/comunicaciones/campanas'); }
      return;
    }
    const antes = this.c()?.conteos.pendientes;
    this.c.set(r.data.campana);
    if (!conLoader && this.lanzada() && antes !== r.data.campana.conteos.pendientes) void this.cargarDest();
  }

  setValor(k: string | number, v: string): void { this.valores.update(o => ({ ...o, [String(k)]: v })); }
  num(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO'); }
  fecha(s: string | null | undefined): string { return s ? formatDateTime(s) : ''; }

  elegirTags(): void {
    this.matDialog.open(TagPickerDialogComponent, { ...dialogSize('480px'), data: { seleccion: this.tags().map(t => t.id), actuales: this.tags(), tipo: null } })
      .afterClosed().subscribe((r: TagPickerResult | undefined) => { if (r) { this.tags.set(r.tags); this.est.set(null); } });
  }

  private audiencia(): AudienciaCampana {
    const base = { organizaciones: this.orgs() };
    if (this.modo() === 'seleccion' && this.seleccion()) return { ...this.seleccion()!.audiencia, ...base };
    const filtros = this.modo() === 'etiquetas' ? { estado: 'activos' as const, tags: this.tags().map(t => t.id), tags_modo: this.tagsModo() } : { estado: 'activos' as const };
    return { filtros, excluidos: [], ...base };
  }

  private payload(): Record<string, unknown> {
    const prog = this.programar() && this.fechaProg() ? `${this.fechaProg()} ${this.horaProg() || '08:00'}` : '';
    return { id: this.c()?.id ?? 0, nombre: this.nombre().trim(), id_linea: this.idLinea(), id_plantilla: this.idPlantilla(), audiencia: this.audiencia(),
      valores: this.valores(), enlace_destino: this.enlace().trim(), programada_para: prog };
  }

  /** Guarda el borrador (lo necesitan estimar, probar, subir el medio y lanzar). Devuelve el id o 0. */
  async guardar(silencioso = false): Promise<number> {
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.com.saveCampana(this.payload()));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.camp.save_error'), message: r.mensaje }); return 0; }
      const nuevo = !this.c();
      const g = await this.com.getCampana(r.data.id);
      if (g.action && g.data) this.c.set(g.data.campana);
      if (!silencioso) this.snack.open(this.i18n.t('com.camp.saved'), this.i18n.t('common.close'), { duration: 2500 });
      if (nuevo) void this.router.navigate(['/m/comunicaciones/campanas', r.data.id], { replaceUrl: true });
      return r.data.id;
    } finally { this.ocupado.set(false); }
  }

  async estimar(): Promise<void> {
    const id = await this.guardar(true);
    if (!id) return;
    const r = await this.loading.wrap(() => this.com.estimarCampana(id));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.camp.estimate_error'), message: r.mensaje }); return; }
    this.est.set(r.data);
  }

  async subirMedia(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const id = this.c()?.id || await this.guardar(true);
    if (!id) return;
    const r = await this.loading.wrap(() => this.com.subirMediaCampana(id, f));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.camp.media_error'), message: r.mensaje }); return; }
    const g = await this.com.getCampana(id);
    if (g.action && g.data) this.c.set(g.data.campana);
  }

  async probar(): Promise<void> {
    const cp = this.contactoPrueba();
    const id = await this.guardar(true);
    if (!id || !cp) return;
    const r = await this.loading.wrap(() => this.com.probarCampana(id, cp.id));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.camp.test_error'), message: r.mensaje }); return; }
    await this.dialogs.info({ title: this.i18n.t('com.camp.test_sent'), message: r.mensaje });
  }

  async lanzar(): Promise<void> {
    const e = this.est();
    if (!e) return;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('com.camp.launch_title'),
      message: this.i18n.t(this.programar() ? 'com.camp.launch_msg_scheduled' : 'com.camp.launch_msg', { n: this.num(e.destinatarios), c: this.num(e.creditos),
        d: this.programar() ? `${this.fechaProg()} ${this.horaProg()}` : '' }),
      confirmText: this.i18n.t('com.camp.launch'),
    });
    if (!ok) return;
    const id = await this.guardar(true);
    if (!id) return;
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.com.lanzarCampana(id, e.destinatarios));
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.camp.launch_error'), message: r.mensaje }); this.est.set(null); return; }
      this.snack.open(r.mensaje, this.i18n.t('common.close'), { duration: 3500 });
      await this.refrescar(true);
      await this.cargarDest();
    } finally { this.ocupado.set(false); }
  }

  async eliminarBorrador(): Promise<void> {
    const x = this.c();
    if (!x) return;
    const ok = await this.dialogs.confirm({ title: this.i18n.t('com.camp.delete_title'), message: this.i18n.t('com.camp.delete_msg'), confirmText: this.i18n.t('common.delete'), danger: true });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.com.eliminarCampana(x.id));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.camp.save_error'), message: r.mensaje }); return; }
    this.nombre.set('');
    void this.router.navigateByUrl('/m/comunicaciones/campanas');
  }

  async accion(a: 'pausar' | 'reanudar' | 'cancelar'): Promise<void> {
    const x = this.c();
    if (!x) return;
    if (a === 'cancelar') {
      const ok = await this.dialogs.confirm({ title: this.i18n.t('com.camp.cancel_title'), message: this.i18n.t('com.camp.cancel_msg', { n: x.conteos.pendientes }),
        confirmText: this.i18n.t('com.camp.cancel'), danger: true });
      if (!ok) return;
    }
    const r = await this.loading.wrap(() => this.com.estadoCampana(x.id, a));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.camp.action_error'), message: r.mensaje }); return; }
    await this.refrescar(true);
    await this.cargarDest();
  }

  // ─── Destinatarios (reporte) ───────────────────────────────────────────────────────────────────────────────────
  async cargarDest(): Promise<void> {
    const x = this.c();
    if (!x) return;
    const r = await this.com.listDestinatarios(x.id, { estado: this.filtroDest(), q: this.qDest(), pagina: this.paginaDest() + 1 });
    if (r.action && r.data) { this.dests.set(r.data.destinatarios); this.totalDest.set(r.data.total); }
  }
  filtrarDest(f: string): void { this.filtroDest.set(this.filtroDest() === f ? '' : f); this.paginaDest.set(0); void this.cargarDest(); }
  paginarDest(e: PageEvent): void { this.paginaDest.set(e.pageIndex); void this.cargarDest(); }
  buscarDest(q: string): void {
    this.qDest.set(q);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => { this.paginaDest.set(0); void this.cargarDest(); }, 300);
  }

  async exportar(e: ExportSolicitud): Promise<void> {
    const x = this.c();
    if (!x) return;
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    await ejecutarExportacion(this, async () => {
      const filas: Destinatario[] = [];
      for (let p = 1; ; p++) {
        const r = await this.com.listDestinatarios(x.id, { estado: this.filtroDest(), q: this.qDest(), pagina: p, porPagina: 1000, exportar: p === 1 });
        if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
        if (p === 1 && e.formato === 'pdf' && r.data.total > 2000) return { ok: false, mensaje: '', limitePdf: { total: r.data.total, max: 2000 } };
        filas.push(...r.data.destinatarios);
        if (filas.length >= r.data.total || !r.data.destinatarios.length) break;
      }
      const k = x.conteos;
      await this.reports.exportar({
        titulo: t('com.camp.report_title', { name: x.nombre }), subtitulo: `${x.plantilla_nombre} · ${x.linea_nombre}`, nombreArchivo: 'campana-' + x.nombre,
        filtros: [this.filtroDest() ? `${t('com.camp.state')}: ${t('com.camp.filter.' + this.filtroDest())}` : t('com.camp.all_recipients')],
        indicadores: [
          { etiqueta: t('com.camp.k.total'), valor: k.total, tipo: 'numero' }, { etiqueta: t('com.camp.k.sent'), valor: k.enviados, tipo: 'numero' },
          { etiqueta: t('com.camp.k.delivered'), valor: k.entregados, tipo: 'numero' }, { etiqueta: t('com.camp.k.read'), valor: k.leidos, tipo: 'numero' },
          { etiqueta: t('com.camp.k.replies'), valor: k.respuestas, tipo: 'numero' }, { etiqueta: t('com.camp.k.clicks'), valor: k.clics, tipo: 'numero' },
          { etiqueta: t('com.camp.k.failed'), valor: k.fallidos, tipo: 'numero' }, { etiqueta: t('com.camp.k.credits'), valor: k.creditos, tipo: 'numero' },
        ],
        detalle: [{
          columnas: [
            { clave: 'nombre', titulo: t('com.camp.contact'), ancho: 2 }, { clave: 'wa', titulo: 'WhatsApp' }, { clave: 'estado', titulo: t('com.camp.state') },
            { clave: 'enviado', titulo: t('com.camp.sent_at'), tipo: 'fechahora' }, { clave: 'leido', titulo: t('com.camp.read_at'), tipo: 'fechahora', solo: 'xlsx' },
            { clave: 'respondio', titulo: t('com.camp.k.replies'), tipo: 'fechahora' }, { clave: 'clic', titulo: t('com.camp.k.clicks'), tipo: 'fechahora' },
            { clave: 'creditos', titulo: t('com.camp.k.credits'), tipo: 'numero', solo: 'xlsx' }, { clave: 'error', titulo: t('com.camp.detail'), ancho: 2 },
          ],
          filas: filas.map(d => ({ nombre: d.nombre, wa: '+' + d.wa_id, estado: t('com.camp.dst.' + d.estado), enviado: d.enviado_at, leido: d.leido_at,
            respondio: d.respondio_at, clic: d.clic_at, creditos: d.creditos, error: d.error })),
        }],
      }, e.formato);
      return { ok: true, filas: filas.length };
    });
  }
}

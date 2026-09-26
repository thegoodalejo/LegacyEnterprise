import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTab, MatTabContent, MatTabGroup } from '@angular/material/tabs';
import { ComunicacionesService, ConfigCom } from '../../services/comunicaciones.service';
import { AplicaA } from '../../services/crm.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { CrmCamposTabComponent } from '../crm/crm-campos-tab.component';
import { CrmRolesTabComponent } from '../crm/crm-roles-tab.component';
import { CrmTagsTabComponent } from '../crm/crm-tags-tab.component';
import { CrmVocabTabComponent } from '../crm/crm-vocab-tab.component';
import { RespuestasEditorComponent } from './respuestas-editor.component';

/**
 * Ajustes de Comunicaciones de la sede (L4+): de qué bolsa salen los créditos, cómo se comporta el chatbot (palabras para pedir asesor, qué hacer
 * si ninguna palabra coincide, sesión, textos), respuestas rápidas del equipo y las pestañas compartidas con el CRM (etiquetas, campos, roles y
 * vocabulario: los mismos datos).
 */
@Component({
  selector: 'app-com-config-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatFormField, MatLabel, MatHint, MatIcon, MatInput, MatRadioGroup, MatRadioButton, MatSelect, MatOption, MatSlideToggle,
    MatTab, MatTabContent, MatTabGroup, CrmCamposTabComponent, CrmTagsTabComponent, CrmRolesTabComponent, CrmVocabTabComponent, RespuestasEditorComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header"><h1>{{ 'com.config.title' | translate }}</h1></header>
      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start">
        <mat-tab [label]="'com.config.general' | translate">
          @if (cfg(); as c) {
            <div class="tab form-grid">
              <section class="block">
                <h2>{{ 'com.config.credits' | translate }}</h2>
                <mat-radio-group class="radios" [ngModel]="c.fuente_creditos" (ngModelChange)="set('fuente_creditos', $event)">
                  <mat-radio-button value="sede" id="src-sede">{{ 'com.config.src_branch' | translate }}</mat-radio-button>
                  <mat-radio-button value="empresa" id="src-empresa">{{ 'com.config.src_company' | translate }}</mat-radio-button>
                </mat-radio-group>
                <p class="muted small">{{ 'com.config.src_hint' | translate }}</p>
              </section>

              <section class="block">
                <h2>{{ 'com.config.bot' | translate }}</h2>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'com.config.advisor_words' | translate }}</mat-label>
                  <input matInput id="cfg-advisor" [ngModel]="c.palabras_asesor" (ngModelChange)="set('palabras_asesor', $event)" maxlength="500" />
                  <mat-hint>{{ 'com.config.advisor_hint' | translate }}</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'com.config.session' | translate }}</mat-label>
                  <input matInput type="number" min="5" max="1440" id="cfg-session" [ngModel]="c.sesion_minutos" (ngModelChange)="set('sesion_minutos', +$event)" />
                  <mat-hint>{{ 'com.config.session_hint' | translate }}</mat-hint>
                </mat-form-field>
                <span class="lbl">{{ 'com.config.no_match' | translate }}</span>
                <mat-radio-group class="radios col" [ngModel]="c.sin_coincidencia" (ngModelChange)="set('sin_coincidencia', $event)">
                  <mat-radio-button value="bandeja" id="nm-bandeja">{{ 'com.config.nm_inbox' | translate }}</mat-radio-button>
                  <mat-radio-button value="mensaje" id="nm-mensaje">{{ 'com.config.nm_message' | translate }}</mat-radio-button>
                  <mat-radio-button value="flujo" id="nm-flujo" [disabled]="!flujos().length">{{ 'com.config.nm_flow' | translate }}</mat-radio-button>
                </mat-radio-group>
                @if (c.sin_coincidencia === 'mensaje') {
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'com.config.nm_text' | translate }}</mat-label>
                    <textarea matInput rows="3" id="cfg-nm-text" [ngModel]="c.texto_sin_coincidencia" (ngModelChange)="set('texto_sin_coincidencia', $event)" maxlength="1000"></textarea>
                    <mat-hint>{{ 'com.config.nm_text_hint' | translate }}</mat-hint>
                  </mat-form-field>
                }
                @if (c.sin_coincidencia === 'flujo') {
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'com.config.nm_flow_pick' | translate }}</mat-label>
                    <mat-select id="cfg-nm-flow" [ngModel]="c.id_flujo_respaldo" (ngModelChange)="set('id_flujo_respaldo', $event)">
                      @for (f of flujos(); track f.id) { <mat-option [value]="f.id">{{ f.nombre }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                }
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'com.config.transfer_text' | translate }}</mat-label>
                  <textarea matInput rows="2" id="cfg-transfer" [ngModel]="c.texto_transferencia" (ngModelChange)="set('texto_transferencia', $event)" maxlength="1000"></textarea>
                  <mat-hint>{{ 'com.config.transfer_hint' | translate }}</mat-hint>
                </mat-form-field>
              </section>

              <section class="block">
                <h2>{{ 'com.config.closing' | translate }}</h2>
                <mat-slide-toggle id="cfg-send-close" [ngModel]="c.enviar_texto_cierre" (ngModelChange)="set('enviar_texto_cierre', $event)">{{ 'com.config.send_close' | translate }}</mat-slide-toggle>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'com.config.close_text' | translate }}</mat-label>
                  <textarea matInput rows="2" id="cfg-close" [ngModel]="c.texto_cierre" (ngModelChange)="set('texto_cierre', $event)" maxlength="1000"></textarea>
                </mat-form-field>
              </section>

              <div class="save"><button mat-flat-button id="btn-save-config" [disabled]="guardando()" (click)="guardar()"><mat-icon>save</mat-icon>{{ 'common.save' | translate }}</button></div>
            </div>
          }
        </mat-tab>
        <mat-tab [label]="'com.config.quick' | translate"><ng-template matTabContent><div class="tab"><app-respuestas-editor [equipo]="true" /></div></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.tags' | translate"><ng-template matTabContent><app-crm-tags-tab [destinos]="destinos()" /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.fields' | translate"><ng-template matTabContent><app-crm-campos-tab [destinos]="destinos()" /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.roles' | translate"><ng-template matTabContent><app-crm-roles-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.vocab' | translate"><app-crm-vocab-tab /></mat-tab>
      </mat-tab-group>
      <p class="muted small shared">{{ 'com.config.shared_hint' | translate }}</p>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; }
    .form-grid { max-width: 760px; }
    .block { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 16px; background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant); h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .radios { display: flex; flex-wrap: wrap; gap: 8px 24px; &.col { flex-direction: column; gap: 4px; } }
    .lbl { font: var(--mat-sys-label-large); }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .save { display: flex; justify-content: flex-end; }
    .shared { margin-top: 16px; }
  `,
})
export default class ComConfigPage {
  private com = inject(ComunicacionesService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private session = inject(SessionService);
  private i18n = inject(TranslationService);
  private snack = inject(MatSnackBar);
  readonly cfg = signal<ConfigCom | null>(null);
  readonly flujos = signal<{ id: number; nombre: string }[]>([]);
  readonly guardando = signal(false);
  /** Sin CRM no hay oportunidades: las etiquetas y campos se aplican a Personas u Organizaciones. */
  readonly destinos = computed<AplicaA[]>(() => this.session.hasModule('crm') ? ['persona', 'organizacion', 'oportunidad'] : ['persona', 'organizacion']);

  constructor() { void this.cargar(); }

  private async cargar(): Promise<void> {
    const r = await this.loading.wrap(() => this.com.getConfig());
    if (r.action && r.data) { this.cfg.set(r.data.config); this.flujos.set(r.data.flujos); }
  }

  set<K extends keyof ConfigCom>(k: K, v: ConfigCom[K]): void {
    this.cfg.update(c => (c ? { ...c, [k]: v } : c));
  }

  async guardar(): Promise<void> {
    const c = this.cfg();
    if (!c) return;
    this.guardando.set(true);
    try {
      const r = await this.loading.wrap(() => this.com.saveConfig(c));
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.config.save_error'), message: r.mensaje }); return; }
      this.snack.open(this.i18n.t('com.config.saved'), this.i18n.t('common.close'), { duration: 3000 });
      await this.cargar();
    } finally { this.guardando.set(false); }
  }
}

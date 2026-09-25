import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CrmService, Plantilla, ResultadoPlantilla } from '../../services/crm.service';
import { CrmVocabService } from '../../services/crm-vocab.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

const ICONOS: Record<string, string> = { pinturas_b2b: 'format_paint', plantas_agua: 'water_drop', clinica_estetica: 'spa' };
const CATEGORIAS = ['vocabulario', 'roles', 'campos', 'grupos', 'tags'] as const;

/** Pestaña «Plantillas»: arranque por nicho. Solo agrega lo que falta; nunca cambia ni borra lo existente. */
@Component({
  selector: 'app-crm-templates-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIcon, TranslatePipe],
  template: `
    <div class="tab">
      <p class="muted">{{ 'crm.config.templates_hint' | translate }}</p>
      <div class="grid">
        @for (p of plantillas(); track p.id) {
          <article class="card" [id]="'tpl-' + p.id">
            <div class="head">
              <span class="badge"><mat-icon>{{ icono(p.id) }}</mat-icon></span>
              <div>
                <strong>{{ 'crm.tpl.' + p.id + '.name' | translate }}</strong>
                <span class="muted small">{{ 'crm.tpl.' + p.id + '.desc' | translate }}</span>
              </div>
            </div>
            <div class="adds">
              <span class="label">{{ 'crm.tpl.adds' | translate }}</span>
              <ul>
                <li><b>{{ 'crm.tpl.cat.vocabulario' | translate }}:</b> {{ vocab(p) }}</li>
                <li><b>{{ 'crm.tpl.cat.roles' | translate }}:</b> {{ p.roles.join(', ') }}</li>
                <li><b>{{ 'crm.tpl.cat.campos' | translate }}:</b> {{ campos(p) }}</li>
                <li><b>{{ 'crm.tpl.cat.grupos' | translate }}:</b> {{ grupos(p) }}</li>
              </ul>
            </div>
            <button mat-flat-button class="apply" [id]="'btn-apply-' + p.id" (click)="apply(p)">{{ 'crm.tpl.apply' | translate }}</button>
          </article>
        }
      </div>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    p { margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 20px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .head { display: flex; gap: 14px; align-items: flex-start; > div { display: flex; flex-direction: column; min-width: 0; } }
    .badge { width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; flex: none; background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .small { font: var(--mat-sys-body-small); }
    .label { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    ul { margin: 4px 0 0; padding-left: 18px; font: var(--mat-sys-body-small); display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
    .apply { align-self: flex-end; margin-top: auto; }
  `,
})
export class CrmTemplatesTabComponent {
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private voc = inject(CrmVocabService);
  private i18n = inject(TranslationService);

  /** Se aplicó una plantilla: la página recarga el resto de las pestañas. */
  readonly applied = output<void>();
  readonly plantillas = signal<Plantilla[]>([]);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listPlantillas());
    if (r.action && r.data) this.plantillas.set(r.data.plantillas);
  }

  icono(id: string): string { return ICONOS[id] ?? 'auto_awesome'; }

  vocab(p: Plantilla): string {
    return Object.values(p.vocabulario).map(v => `${v.singular}/${v.plural}`).join(' · ') || '—';
  }
  campos(p: Plantilla): string { return p.campos.map(c => c.etiqueta).join(', '); }
  grupos(p: Plantilla): string {
    const g = p.grupos.map(x => `${x.nombre} (${x.tags.join(', ')})`);
    return [...g, ...p.tags].join(' · ') || '—';
  }

  async apply(p: Plantilla): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('crm.tpl.apply_title'),
      message: `${this.i18n.t('crm.tpl.' + p.id + '.name')}\n\n${this.i18n.t('crm.tpl.apply_msg')}`,
      confirmText: this.i18n.t('crm.tpl.apply'),
    });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.applyPlantilla(p.id));
    if (!r.action || !r.data) {
      await this.dialogs.error({ title: this.i18n.t('crm.tpl.error'), message: r.mensaje });
      return;
    }
    await this.voc.load();
    this.applied.emit();
    await this.dialogs.success({ title: this.i18n.t('crm.tpl.done_title'), message: this.resumen(r.data) });
  }

  private resumen(r: ResultadoPlantilla): string {
    return CATEGORIAS.map(c => this.i18n.t('crm.tpl.result', { cat: this.i18n.t('crm.tpl.cat.' + c), agregados: r[c].agregados, existentes: r[c].existentes })).join('\n');
  }
}

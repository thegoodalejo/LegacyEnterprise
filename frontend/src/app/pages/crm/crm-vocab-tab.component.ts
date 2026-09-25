import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { ClaveVocabulario, Vocabulario } from '../../services/crm.service';
import { CrmVocabService, VOCAB_CLAVES } from '../../services/crm-vocab.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

interface Fila { singular: string; plural: string }

/** Pestaña «Vocabulario»: cómo llama la empresa a Contacto, Persona, Organización, Oportunidad e Ítem en todo el CRM. */
@Component({
  selector: 'app-crm-vocab-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatFormField, MatHint, MatLabel, MatInput, TranslatePipe],
  template: `
    <div class="tab">
      <p class="muted">{{ 'crm.config.vocab_hint' | translate }}</p>
      @for (k of claves; track k) {
        <section class="block">
          <h2>{{ 'crm.voc.label.' + k | translate }}</h2>
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.voc.singular' | translate }}</mat-label>
              <input matInput [id]="'voc-' + k + '-s'" maxlength="40" [ngModel]="filas()[k].singular" (ngModelChange)="set(k, 'singular', $event)" />
              <mat-hint>{{ 'crm.voc.default' | translate: { name: voc.defecto(k, false) } }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.voc.plural' | translate }}</mat-label>
              <input matInput [id]="'voc-' + k + '-p'" maxlength="40" [ngModel]="filas()[k].plural" (ngModelChange)="set(k, 'plural', $event)" />
              <mat-hint>{{ 'crm.voc.default' | translate: { name: voc.defecto(k, true) } }}</mat-hint>
            </mat-form-field>
          </div>
        </section>
      }
      <div class="actions">
        <button mat-flat-button id="btn-save-vocab" (click)="save()" [disabled]="saving()">{{ (saving() ? 'common.saving' : 'crm.voc.save') | translate }}</button>
      </div>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
    p { margin: 0; }
    .block { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    h2 { margin: 0; font: var(--mat-sys-title-medium); }
    .actions { display: flex; justify-content: flex-end; }
  `,
})
export class CrmVocabTabComponent {
  readonly voc = inject(CrmVocabService);
  private dialogs = inject(DialogService);
  private loading = inject(LoadingService);
  private i18n = inject(TranslationService);

  readonly claves = VOCAB_CLAVES;
  readonly saving = signal(false);
  readonly filas = signal<Record<ClaveVocabulario, Fila>>(this.vacias());

  constructor() {
    // Lo guardado (personalizado) llena el formulario; vacío = usa el nombre por defecto.
    effect(() => {
      const o = this.voc.overrides();
      untracked(() => this.filas.set(Object.fromEntries(this.claves.map(k => [k, { singular: o[k]?.singular ?? '', plural: o[k]?.plural ?? '' }])) as Record<ClaveVocabulario, Fila>));
    });
  }

  private vacias(): Record<ClaveVocabulario, Fila> {
    return Object.fromEntries(VOCAB_CLAVES.map(k => [k, { singular: '', plural: '' }])) as Record<ClaveVocabulario, Fila>;
  }

  set(k: ClaveVocabulario, campo: keyof Fila, v: string): void {
    this.filas.update(f => ({ ...f, [k]: { ...f[k], [campo]: v } }));
  }

  async save(): Promise<void> {
    const f = this.filas();
    const out: Vocabulario = {};
    for (const k of this.claves) {
      const s = f[k].singular.trim(), p = f[k].plural.trim();
      if ((s === '') !== (p === '')) {
        await this.dialogs.error({ title: this.i18n.t('crm.voc.save_error'), message: this.i18n.t('crm.voc.pair_required') });
        return;
      }
      out[k] = { singular: s, plural: p };   // ambos vacíos = volver al nombre por defecto
    }
    this.saving.set(true);
    try {
      const err = await this.loading.wrap(() => this.voc.save(out));
      if (err) await this.dialogs.error({ title: this.i18n.t('crm.voc.save_error'), message: err });
      else await this.dialogs.success({ title: this.i18n.t('crm.voc.saved'), message: '' });
    } finally {
      this.saving.set(false);
    }
  }
}

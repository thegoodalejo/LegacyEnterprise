import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { CrmService, NotaContacto } from '../services/crm.service';
import { DialogService } from '../services/dialog.service';
import { TranslatePipe, TranslationService } from '../services/translation.service';
import { formatDateTime } from '../pages/crm/crm-format';

/**
 * Notas de un contacto (bitácora interna, no se envía al cliente). Las mismas en el perfil del CRM, en el de Comunicaciones y en el panel
 * de la bandeja. `conversacion`: si se escribe desde una conversación, la nota queda asociada a ella.
 */
@Component({
  selector: 'app-contacto-notas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIconButton, MatFormField, MatLabel, MatIcon, MatInput, MatTooltip, TranslatePipe],
  template: `
    <div class="notas">
      <div class="nueva">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'notes.new' | translate }}</mat-label>
          <textarea matInput id="note-new" rows="2" maxlength="5000" [(ngModel)]="texto"></textarea>
        </mat-form-field>
        <button mat-flat-button id="btn-note-add" [disabled]="!texto.trim() || guardando()" (click)="agregar()"><mat-icon>note_add</mat-icon>{{ 'notes.add' | translate }}</button>
      </div>
      @for (n of notas(); track n.id) {
        <div class="nota">
          @if (editando() === n.id) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <textarea matInput rows="3" maxlength="5000" [(ngModel)]="textoEdicion"></textarea>
            </mat-form-field>
            <div class="acciones">
              <button mat-button (click)="editando.set(null)">{{ 'common.cancel' | translate }}</button>
              <button mat-flat-button [disabled]="!textoEdicion.trim() || guardando()" (click)="guardarEdicion(n)">{{ 'common.save' | translate }}</button>
            </div>
          } @else {
            <p class="texto">{{ n.nota }}</p>
            <div class="meta muted">
              <span>{{ n.autor || '—' }} · {{ fecha(n.created_at) }}@if (n.origen === 'comunicaciones') { · <mat-icon class="mini" [matTooltip]="'notes.from_chat' | translate">forum</mat-icon> }</span>
              @if (n.puede_editar) {
                <span class="btns">
                  <button mat-icon-button (click)="editar(n)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button (click)="eliminar(n)" [attr.aria-label]="'common.delete' | translate"><mat-icon>delete</mat-icon></button>
                </span>
              }
            </div>
          }
        </div>
      } @empty {
        <p class="muted vacio">{{ 'notes.empty' | translate }}</p>
      }
      @if (total() > notas().length) { <button mat-button (click)="mas()">{{ 'notes.more' | translate: { n: total() - notas().length } }}</button> }
    </div>
  `,
  styles: `
    .notas { display: flex; flex-direction: column; gap: 8px; }
    .nueva { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; mat-form-field { width: 100%; } }
    .nota { padding: 8px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-of-type { border: none; } }
    .texto { margin: 0 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: var(--mat-sys-body-small); }
    .btns { display: flex; margin: -8px 0; }
    .mini { width: 14px; height: 14px; font-size: 14px; vertical-align: middle; }
    .acciones { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .vacio { margin: 4px 0; }
  `,
})
export class ContactoNotasComponent {
  readonly idContacto = input.required<number>();
  readonly conversacion = input<number | null>(null);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly notas = signal<NotaContacto[]>([]);
  readonly total = signal(0);
  readonly guardando = signal(false);
  readonly editando = signal<number | null>(null);
  texto = '';
  textoEdicion = '';
  private pagina = 1;

  constructor() {
    effect(() => { const id = this.idContacto(); untracked(() => void this.cargar(id, true)); });
  }

  private async cargar(id: number, reset: boolean): Promise<void> {
    if (reset) this.pagina = 1;
    const r = await this.crm.listNotasContacto(id, this.pagina);
    if (r.action && r.data) {
      this.notas.update(l => (reset ? r.data!.notas : [...l, ...r.data!.notas]));
      this.total.set(r.data.total);
    }
  }

  mas(): void { this.pagina++; void this.cargar(this.idContacto(), false); }
  fecha(s: string): string { return formatDateTime(s); }

  async agregar(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.crm.saveNotaContacto({ id_contacto: this.idContacto(), nota: this.texto.trim(), id_conversacion: this.conversacion() });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('notes.error'), message: r.mensaje }); return; }
      this.texto = '';
      await this.cargar(this.idContacto(), true);
    } finally { this.guardando.set(false); }
  }

  editar(n: NotaContacto): void { this.textoEdicion = n.nota; this.editando.set(n.id); }

  async guardarEdicion(n: NotaContacto): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.crm.saveNotaContacto({ id: n.id, nota: this.textoEdicion.trim() });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('notes.error'), message: r.mensaje }); return; }
      this.editando.set(null);
      await this.cargar(this.idContacto(), true);
    } finally { this.guardando.set(false); }
  }

  async eliminar(n: NotaContacto): Promise<void> {
    const ok = await this.dialogs.confirm({ title: this.i18n.t('notes.delete_title'), message: this.i18n.t('notes.delete_msg'), confirmText: this.i18n.t('common.delete'), danger: true });
    if (!ok) return;
    const r = await this.crm.saveNotaContacto({ id: n.id, activo: 0 });
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('notes.error'), message: r.mensaje }); return; }
    await this.cargar(this.idContacto(), true);
  }
}

import { ChangeDetectionStrategy, Component, effect, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { dmyToIso, isoToDmy, maskDmy } from '../pages/crm/crm-format';
import { TranslatePipe } from '../services/translation.service';

/**
 * Campo de fecha dd-mm-aaaa (guiones automáticos al escribir). El valor que entra y sale es AAAA-MM-DD (o null si
 * está vacío o incompleto/ inválido), que es lo que espera el backend.
 *   <app-date-input [label]="'…'" [(value)]="fecha" />
 */
@Component({
  selector: 'app-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormField, MatLabel, MatHint, MatInput, TranslatePipe],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <input matInput inputmode="numeric" autocomplete="off" maxlength="10" placeholder="dd-mm-aaaa"
             [ngModel]="text()" (ngModelChange)="onType($event)" (blur)="touched.set(true)"
             [attr.aria-invalid]="invalid()" />
      @if (invalid()) { <mat-hint class="err">{{ 'common.invalid_date' | translate }}</mat-hint> }
    </mat-form-field>
  `,
  styles: `.err { color: var(--md-sys-color-error); }`,
})
export class DateInputComponent {
  readonly label = input('');
  /** AAAA-MM-DD o null. */
  readonly value = model<string | null>(null);
  readonly text = signal('');
  readonly touched = signal(false);

  constructor() {
    // Valor puesto desde fuera (cargar un contacto, limpiar filtros): se refleja en el texto sin pisar lo que se escribe.
    effect(() => {
      const v = this.value();
      if (v !== dmyToIso(this.text())) this.text.set(isoToDmy(v));
    });
  }

  invalid(): boolean {
    const t = this.text();
    return t.length === 10 ? dmyToIso(t) === null : this.touched() && t.length > 0;
  }

  onType(raw: string): void {
    const t = maskDmy(raw);
    this.text.set(t);
    this.value.set(dmyToIso(t));
  }
}

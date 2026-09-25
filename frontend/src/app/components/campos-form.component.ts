import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TipoDato } from '../services/crm.service';
import { TranslatePipe } from '../services/translation.service';
import { DateInputComponent } from './date-input.component';

export interface CampoForm { id: number; etiqueta: string; tipo_dato: TipoDato; obligatorio: boolean }

/**
 * Campos personalizados de un registro (oportunidad…): un control por campo según su tipo. Los valores van como texto por id de campo
 * (booleano «true»/«false», fecha AAAA-MM-DD); el backend valida y convierte.
 *   <app-campos-form [campos]="defs" [(valores)]="vals" />
 */
@Component({
  selector: 'app-campos-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormField, MatLabel, MatInput, MatSelect, MatOption, DateInputComponent, TranslatePipe],
  template: `
    <div class="wrap">
      @for (c of campos(); track c.id) {
        @switch (c.tipo_dato) {
          @case ('fecha') {
            <app-date-input [label]="c.etiqueta + (c.obligatorio ? ' *' : '')" [value]="valores()[c.id] || null" (valueChange)="set(c.id, $event ?? '')" />
          }
          @case ('booleano') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ c.etiqueta }}{{ c.obligatorio ? ' *' : '' }}</mat-label>
              <mat-select [ngModel]="valores()[c.id] ?? ''" (ngModelChange)="set(c.id, $event)" [id]="'campo-' + c.id">
                <mat-option value="">—</mat-option>
                <mat-option value="true">{{ 'common.yes' | translate }}</mat-option>
                <mat-option value="false">{{ 'common.no' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
          }
          @default {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ c.etiqueta }}{{ c.obligatorio ? ' *' : '' }}</mat-label>
              <input matInput [id]="'campo-' + c.id" [attr.inputmode]="c.tipo_dato === 'texto' ? 'text' : (c.tipo_dato === 'entero' ? 'numeric' : 'decimal')"
                     maxlength="255" [ngModel]="valores()[c.id] ?? ''" (ngModelChange)="set(c.id, $event)" />
            </mat-form-field>
          }
        }
      }
    </div>
  `,
  styles: `
    .wrap { display: flex; flex-wrap: wrap; gap: 12px; }
    .wrap > * { flex: 1 1 220px; min-width: 0; }
  `,
})
export class CamposFormComponent {
  readonly campos = input.required<CampoForm[]>();
  readonly valores = model<Record<number, string>>({});

  set(id: number, v: string): void {
    this.valores.update(m => ({ ...m, [id]: v }));
  }
}

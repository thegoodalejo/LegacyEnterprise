import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { DateInputComponent } from '../../components/date-input.component';
import { CrmService, Etapa, MotivoCierre } from '../../services/crm.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe } from '../../services/translation.service';

export interface CierreDialogData { etapa: Etapa; titulo: string }
export interface CierreDialogResult { idMotivo: number | null; fechaCierre: string | null; nota: string }

/** Hoy como AAAA-MM-DD en la zona horaria del navegador. */
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Al mover una oportunidad a una etapa ganada o perdida: motivo (si la empresa los configuró), fecha de cierre y una nota opcional. */
@Component({
  selector: 'app-oportunidad-cierre-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSelect, MatOption, DateInputComponent, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ ('crm.opp.close_title_' + d.etapa.tipo) | translate }}</h2>
    <mat-dialog-content>
      <p class="sub"><strong>{{ d.titulo }}</strong> → {{ d.etapa.nombre }}</p>
      <div class="form-grid">
        @if (motivos().length) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.opp.close_reason' | translate }} *</mat-label>
            <mat-select id="cierre-motivo" [ngModel]="idMotivo()" (ngModelChange)="idMotivo.set($event)">
              @for (m of motivos(); track m.id) { <mat-option [value]="m.id">{{ m.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
        <app-date-input [label]="'crm.opp.close_date' | translate" [value]="fecha()" (valueChange)="fecha.set($event)" />
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.opp.close_note' | translate }}</mat-label>
          <textarea matInput id="cierre-nota" rows="3" maxlength="5000" [(ngModel)]="nota"></textarea>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-confirm-cierre" (click)="confirm()" [disabled]="!listo()">{{ 'crm.opp.close_confirm' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `.sub { margin: 0 0 12px; overflow-wrap: anywhere; }`,
})
export class OportunidadCierreDialogComponent {
  readonly d = inject<CierreDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<OportunidadCierreDialogComponent, CierreDialogResult>);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);

  readonly motivos = signal<MotivoCierre[]>([]);
  readonly cargado = signal(false);
  readonly idMotivo = signal<number | null>(null);
  readonly fecha = signal<string | null>(hoyIso());
  nota = '';

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const tipo = this.d.etapa.tipo === 'ganada' ? 'ganada' : 'perdida';
    const r = await this.loading.wrap(() => this.crm.listMotivos(true, tipo));
    if (r.action && r.data) this.motivos.set(r.data.motivos);
    this.cargado.set(true);
  }

  /** Con motivos configurados, elegir uno es obligatorio (lo exige también el servidor). */
  listo(): boolean {
    return this.cargado() && (!this.motivos().length || this.idMotivo() !== null);
  }

  confirm(): void {
    if (this.listo()) this.ref.close({ idMotivo: this.idMotivo(), fechaCierre: this.fecha(), nota: this.nota.trim() });
  }
}

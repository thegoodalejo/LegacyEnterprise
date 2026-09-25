import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { ContactoFila, CrmService, TipoContacto } from '../services/crm.service';

/**
 * Buscador con autocompletado de contactos activos de un tipo (Personas u Organizaciones). Emite el elegido y se vacía.
 *   <app-contacto-picker tipo="organizacion" [label]="'…'" [excluir]="[id]" (picked)="usar($event)" />
 */
@Component({
  selector: 'app-contacto-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatAutocompleteModule, MatFormField, MatLabel, MatPrefix, MatIcon, MatInput],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input matInput autocomplete="off" [id]="inputId()" [ngModel]="query()" (ngModelChange)="onQuery($event)" [matAutocomplete]="auto" />
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="noDisplay" (optionSelected)="pick($event.option.value)">
        @for (c of results(); track c.id) {
          <mat-option [value]="c">{{ c.nombre_completo }} <span class="muted small">{{ c.documento_numero || c.telefono }}</span></mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `.small { font: var(--mat-sys-body-small); }`,
})
export class ContactoPickerComponent {
  private crm = inject(CrmService);

  readonly tipo = input.required<TipoContacto>();
  readonly label = input('');
  readonly inputId = input('');
  /** Ids que no se ofrecen (los ya elegidos, el propio contacto…). */
  readonly excluir = input<number[]>([]);
  readonly picked = output<ContactoFila>();

  readonly query = signal('');
  readonly results = signal<ContactoFila[]>([]);
  readonly noDisplay = (): string => '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** El input con matAutocomplete emite también el objeto elegido: eso lo maneja pick(). */
  onQuery(q: string | ContactoFila): void {
    if (typeof q !== 'string') return;
    this.query.set(q);
    if (this.timer) clearTimeout(this.timer);
    if (q.trim().length < 2) { this.results.set([]); return; }
    this.timer = setTimeout(async () => {
      // Sin buscar en relacionados: aquí se elige por el nombre/documento propio del contacto.
      const r = await this.crm.listContactos({ q: q.trim(), tipo: this.tipo(), estado: 'activos', relacionados: false }, 1, 8, 'nombre', 'asc');
      if (r.action && r.data) {
        const fuera = new Set(this.excluir());
        this.results.set(r.data.contactos.filter(c => !fuera.has(c.id)));
      }
    }, 250);
  }

  pick(c: ContactoFila): void {
    this.query.set('');
    this.results.set([]);
    this.picked.emit(c);
  }
}

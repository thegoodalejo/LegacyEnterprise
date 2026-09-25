import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { CrmConfigService } from '../services/crm-config.service';
import { CrmService, ItemCatalogo } from '../services/crm.service';

/**
 * Buscador con autocompletado de ítems activos del catálogo (por nombre o código). Emite el elegido y se vacía.
 *   <app-item-picker [label]="'…'" (picked)="agregar($event)" />
 */
@Component({
  selector: 'app-item-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatAutocompleteModule, MatFormField, MatLabel, MatPrefix, MatIcon, MatInput],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input matInput autocomplete="off" [id]="inputId()" [ngModel]="query()" (ngModelChange)="onQuery($event)" [matAutocomplete]="auto" />
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="noDisplay" (optionSelected)="pick($event.option.value)">
        @for (i of results(); track i.id) {
          <mat-option [value]="i">
            {{ i.nombre }}
            <span class="muted small">{{ i.codigo }}{{ i.codigo && i.precio_ref !== null ? ' · ' : '' }}{{ i.precio_ref !== null ? cfg.money(i.precio_ref) : '' }}{{ i.unidad ? ' / ' + i.unidad : '' }}</span>
          </mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `.small { font: var(--mat-sys-body-small); }`,
})
export class ItemPickerComponent {
  private crm = inject(CrmService);
  readonly cfg = inject(CrmConfigService);

  readonly label = input('');
  readonly inputId = input('');
  readonly picked = output<ItemCatalogo>();

  readonly query = signal('');
  readonly results = signal<ItemCatalogo[]>([]);
  readonly noDisplay = (): string => '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  /** El input con matAutocomplete emite también el objeto elegido: eso lo maneja pick(). */
  onQuery(q: string | ItemCatalogo): void {
    if (typeof q !== 'string') return;
    this.query.set(q);
    const id = ++this.seq;
    if (this.timer) clearTimeout(this.timer);
    if (q.trim().length < 1) { this.results.set([]); return; }
    this.timer = setTimeout(async () => {
      const r = await this.crm.listItems({ q: q.trim(), soloActivos: true, porPagina: 8 });
      if (id !== this.seq) return;   // una búsqueda más nueva ya está en camino
      if (r.action && r.data) this.results.set(r.data.items);
    }, 250);
  }

  pick(i: ItemCatalogo): void {
    this.query.set('');
    this.results.set([]);
    this.picked.emit(i);
  }
}

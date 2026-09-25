import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { normalizeText } from '../pages/crm/crm-format';
import { CatalogoTags, CrmService, CrmTag, TagDef, TipoContacto } from '../services/crm.service';
import { LoadingService } from '../services/loading.service';
import { TranslatePipe } from '../services/translation.service';
import { TagChipComponent } from './tag-chip.component';

export interface TagPickerData {
  /** Ids ya seleccionados. */
  seleccion?: number[];
  /** Etiquetas que el contacto ya tiene (pueden estar desactivadas y no venir en el catálogo activo): se conservan si siguen marcadas. */
  actuales?: CrmTag[];
  /** Si viene, solo se ofrecen las etiquetas que aplican a ese tipo de contacto. Sin tipo (lote): todas, con aviso. */
  tipo?: TipoContacto | null;
  title?: string;
  confirmText?: string;
}

export interface TagPickerResult { ids: number[]; tags: CrmTag[] }

interface GrupoVista { id: number | null; nombre: string; tags: TagDef[] }

/**
 * Selector de etiquetas de selección múltiple, agrupado por grupo ("Sin grupo" al final) y con buscador que ignora
 * tildes y mayúsculas (misma idea que el selector de tags de Kingdom). Devuelve los ids elegidos.
 */
@Component({
  selector: 'app-tag-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatCheckbox, MatFormField, MatLabel, MatPrefix, MatIcon, MatInput, TagChipComponent, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ d.title || ('crm.tags.pick_title' | translate) }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
        <mat-label>{{ 'crm.tags.search' | translate }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="term()" (ngModelChange)="term.set($event)" autocomplete="off" />
      </mat-form-field>

      @for (g of grupos(); track g.id) {
        <section class="group">
          <h3>{{ g.nombre || ('crm.tags.no_group' | translate) }}</h3>
          <div class="tags">
            @for (t of g.tags; track t.id) {
              <div class="tag-row">
                <mat-checkbox [checked]="selected().has(t.id)" (change)="toggle(t.id)"><app-tag-chip [nombre]="t.nombre" [color]="t.color" /></mat-checkbox>
                @if (!d.tipo && t.aplica_a) {
                  <span class="muted only">{{ (t.aplica_a === 'persona' ? 'crm.tags.only_persona' : 'crm.tags.only_organizacion') | translate }}</span>
                }
              </div>
            }
          </div>
        </section>
      } @empty {
        <div class="empty-state"><mat-icon>label_off</mat-icon><span>{{ 'crm.tags.none_available' | translate }}</span></div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-tags-apply" [mat-dialog-close]="resultado()" [disabled]="!d.seleccion && !selected().size">
        {{ d.confirmText || ('crm.tags.apply' | translate) }} ({{ selected().size }})
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .search { margin-top: 4px; }
    .group { margin-top: 16px; }
    h3 { margin: 0 0 4px; font: var(--mat-sys-title-small); color: var(--md-sys-color-on-surface-variant); }
    .tags { display: flex; flex-direction: column; }
    .tag-row { display: flex; align-items: center; gap: 8px; min-height: 40px; }
    .only { font: var(--mat-sys-body-small); }
  `,
})
export class TagPickerDialogComponent {
  readonly d = inject<TagPickerData>(MAT_DIALOG_DATA);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);

  readonly term = signal('');
  readonly selected = signal<Set<number>>(new Set(this.d.seleccion ?? []));
  private readonly catalogo = signal<CatalogoTags>({ grupos: [], tags: [] });

  readonly resultado = computed<TagPickerResult>(() => {
    const ids = [...this.selected()];
    const conocidas = new Map<number, CrmTag>([...(this.d.actuales ?? []), ...this.catalogo().tags].map(t => [t.id, t]));
    return { ids, tags: ids.flatMap(id => conocidas.get(id) ?? []) };
  });
  readonly grupos = computed<GrupoVista[]>(() => {
    const q = normalizeText(this.term());
    const { grupos, tags } = this.catalogo();
    const visibles = tags.filter(t =>
      (!this.d.tipo || !t.aplica_a || t.aplica_a === this.d.tipo) && (!q || normalizeText(t.nombre).includes(q)));
    const out: GrupoVista[] = grupos
      .map(g => ({ id: g.id as number | null, nombre: g.nombre, tags: visibles.filter(t => t.id_grupo === g.id) }))
      .filter(g => g.tags.length);
    const sinGrupo = visibles.filter(t => t.id_grupo === null || !grupos.some(g => g.id === t.id_grupo));
    if (sinGrupo.length) out.push({ id: null, nombre: '', tags: sinGrupo });
    return out;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listTags(true));
    if (r.action && r.data) this.catalogo.set(r.data);
  }

  toggle(id: number): void {
    this.selected.update(s => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }
}

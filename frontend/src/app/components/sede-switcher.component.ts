import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { ApiService } from '../services/api.service';
import { DialogService, dialogSize } from '../services/dialog.service';
import { LoadingService } from '../services/loading.service';
import { SessionService } from '../services/session.service';
import { TranslatePipe } from '../services/translation.service';

interface SedeItem { id: number; nombre: string; logo_url: string | null; activo: boolean; rol: string; usuarios?: number; empresa_nombre?: string }

async function fetchSedes(api: ApiService, q = ''): Promise<SedeItem[]> {
  const r = await api.post<{ sedes: SedeItem[] }>('sedes/get_mis_sedes.php', { q, limit: 50 });
  return r.action && r.data ? r.data.sedes : [];
}

/**
 * Selector de sede en la barra superior. Siempre muestra en qué sede se está.
 * - 1 sede: solo el nombre.  - Varias: menú con sus sedes.
 * - L5 (plataforma): distintivo "Soporte" + diálogo con buscador sobre TODAS las sedes y recientes.
 */
@Component({
  selector: 'app-sede-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe],
  template: `
    @if (session.isPlatformAdmin()) {
      <button mat-stroked-button class="chip support" (click)="openPicker()">
        <mat-icon>support_agent</mat-icon>
        <span class="name">{{ session.sedeNombre() || ('sede.none' | translate) }}</span>
        <mat-icon iconPositionEnd>unfold_more</mat-icon>
      </button>
    } @else if (sedes().length > 1) {
      <button mat-stroked-button class="chip" [matMenuTriggerFor]="menu">
        <mat-icon>storefront</mat-icon>
        <span class="name">{{ session.sedeNombre() }}</span>
        <mat-icon iconPositionEnd>expand_more</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        @for (s of sedes(); track s.id) {
          <button mat-menu-item [disabled]="s.id === session.sedeId()" (click)="switchTo(s.id)">
            <mat-icon>{{ s.id === session.sedeId() ? 'check' : 'storefront' }}</mat-icon>
            <span>{{ s.nombre }}</span>
          </button>
        }
      </mat-menu>
    } @else if (session.sedeNombre()) {
      <span class="chip static"><mat-icon>storefront</mat-icon><span class="name">{{ session.sedeNombre() }}</span></span>
    }
  `,
  styles: `
    :host { display: inline-flex; min-width: 0; }
    .chip { display: inline-flex; align-items: center; gap: 6px; max-width: 260px; min-width: 0; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .static { padding: 0 8px; color: var(--md-sys-color-on-surface-variant); font: var(--mat-sys-label-large); }
    .static mat-icon { font-size: 20px; width: 20px; height: 20px; flex: none; }
    .support { border-color: var(--md-sys-color-tertiary); color: var(--md-sys-color-tertiary); }
    @media (max-width: 599px) { .chip { max-width: 150px; } }
  `,
})
export class SedeSwitcherComponent {
  session = inject(SessionService);
  private api = inject(ApiService);
  private loading = inject(LoadingService);
  private dialog = inject(MatDialog);
  private dialogs = inject(DialogService);

  sedes = signal<SedeItem[]>([]);

  constructor() {
    // Usuarios normales: cargar sus sedes (al tener sesión) para decidir si hay menú. L5 las busca en el diálogo.
    effect(() => {
      const u = this.session.user();
      if (u && !u.is_platform_admin) untracked(() => void fetchSedes(this.api).then(s => this.sedes.set(s)));
    });
  }

  async switchTo(id: number): Promise<void> {
    const err = await this.loading.wrap(() => this.session.switchSede(id));
    if (err) await this.dialogs.error({ title: 'No se pudo cambiar de sede', message: err });
  }

  openPicker(): void {
    this.dialog.open(SedePickerDialogComponent, { ...dialogSize('560px'), autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(id => { if (id) void this.switchTo(id); });
  }
}

/** Diálogo de L5: buscador sobre todas las sedes + recientes. */
@Component({
  selector: 'app-sede-picker-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatListModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'sede.switch_title' | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
        <mat-label>{{ 'sede.search' | translate }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="q()" (ngModelChange)="onSearch($event)" autocomplete="off" />
      </mat-form-field>
      <mat-action-list>
        @for (s of ordered(); track s.id) {
          <button mat-list-item (click)="ref.close(s.id)" [class.current]="s.id === session.sedeId()" [class.inactive]="!s.activo">
            <mat-icon matListItemIcon>{{ recent().includes(s.id) ? 'history' : 'storefront' }}</mat-icon>
            <span matListItemTitle>{{ s.nombre }}</span>
            <span matListItemLine>{{ s.empresa_nombre }} · #{{ s.id }} · {{ s.usuarios ?? 0 }} {{ 'sede.users' | translate }}{{ s.activo ? '' : ' · ' + ('sede.inactive' | translate) }}</span>
          </button>
        } @empty {
          <p class="empty">{{ 'sede.no_results' | translate }}</p>
        }
      </mat-action-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .full { width: 100%; margin-bottom: 8px; }
    .current { background: var(--md-sys-color-secondary-container); }
    .inactive { opacity: 0.6; }
    .empty { color: var(--md-sys-color-on-surface-variant); text-align: center; padding: 16px 0; }
  `,
})
export class SedePickerDialogComponent {
  ref = inject(MatDialogRef<SedePickerDialogComponent, number>);
  session = inject(SessionService);
  private api = inject(ApiService);

  q = signal('');
  sedes = signal<SedeItem[]>([]);
  recent = signal<number[]>(this.session.recentSedes());
  ordered = computed(() => {
    const rec = this.recent();
    return [...this.sedes()].sort((a, b) => {
      const ra = rec.indexOf(a.id), rb = rec.indexOf(b.id);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    });
  });
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.search('');
  }

  onSearch(v: string): void {
    this.q.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.search(v.trim()), 250);
  }

  private async search(q: string): Promise<void> {
    this.sedes.set(await fetchSedes(this.api, q));
  }
}

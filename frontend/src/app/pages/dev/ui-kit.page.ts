import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { BrandSeeds, DEFAULT_BRAND, isValidSeeds } from '../../theme/brand-scheme';
import { BrandingService } from '../../services/branding.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe } from '../../services/translation.service';

/**
 * Solo en desarrollo (/dev/ui): muestrario de la base visual para verificar la Fase 1
 * (formulario con hints, diálogos, loader, tabla) y probar la marca blanca con colores arbitrarios.
 */
@Component({
  selector: 'app-ui-kit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatFormField, MatLabel, MatHint, MatInput, MatIcon, MatTableModule, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>UI kit</h1>
        <div class="actions">
          <button mat-stroked-button id="btn-confirm" (click)="confirm()"><mat-icon>help</mat-icon>Confirm</button>
          <button mat-stroked-button id="btn-loader" (click)="loader()"><mat-icon>hourglass_top</mat-icon>Loader 1.5s</button>
        </div>
      </header>

      <section class="block">
        <h2>{{ 'dev.brand_title' | translate }}</h2>
        <div class="form-grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'dev.brand_name' | translate }}</mat-label>
            <input matInput id="brand-name" [(ngModel)]="nombre" />
            <mat-hint>{{ 'dev.brand_name_hint' | translate }}</mat-hint>
          </mat-form-field>
          <div class="form-row">
            @for (k of keys; track k) {
              <mat-form-field appearance="outline">
                <mat-label>{{ k }}</mat-label>
                <input matInput [id]="'seed-' + k" [(ngModel)]="seeds[k]" maxlength="7" />
                <span matTextSuffix class="swatch" [style.background]="seeds[k]"></span>
                <mat-hint>Hex #RRGGBB</mat-hint>
              </mat-form-field>
            }
          </div>
          <div class="actions">
            <button mat-flat-button id="btn-brand" (click)="applyBrand()">{{ 'dev.brand_apply' | translate }}</button>
            <button mat-button id="btn-brand-reset" (click)="resetBrand()">{{ 'dev.brand_reset' | translate }}</button>
          </div>
        </div>
      </section>

      <section class="block">
        <h2>{{ 'dev.table_title' | translate }}</h2>
        <div class="table-scroll">
          <table mat-table [dataSource]="rows">
            @for (c of columns; track c) {
              <ng-container [matColumnDef]="c">
                <th mat-header-cell *matHeaderCellDef>{{ c }}</th>
                <td mat-cell *matCellDef="let r">{{ r[c] }}</td>
              </ng-container>
            }
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let r; columns: columns"></tr>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: `
    .block { margin-bottom: 32px; max-width: 880px; }
    h2 { font: var(--mat-sys-title-large); margin: 0 0 16px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .swatch { display: inline-block; width: 20px; height: 20px; margin-right: 8px; border-radius: 6px; border: 1px solid var(--md-sys-color-outline-variant); }
  `,
})
export default class UiKitPage {
  private dialog = inject(DialogService);
  private loading = inject(LoadingService);
  private brand = inject(BrandingService);

  readonly keys = ['primary', 'secondary', 'tertiary'] as const;
  nombre = 'Acme S.A.S.';
  seeds: BrandSeeds = { primary: '#C2185B', secondary: '#6D4C41', tertiary: '#F9A825' };
  readonly columns = ['sede', 'ciudad', 'modulos', 'usuarios', 'estado', 'creada'];
  readonly rows = Array.from({ length: 4 }, (_, i) => ({
    sede: `Sede ${i + 1}`, ciudad: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla'][i],
    modulos: 'CRM, Agenda, Pedidos', usuarios: 12 + i * 7, estado: 'Activa', creada: '2026-09-24',
  }));
  readonly lastConfirm = signal<boolean | null>(null);

  async confirm(): Promise<void> {
    this.lastConfirm.set(await this.dialog.confirm({
      title: 'Eliminar sede', message: '¿Seguro? Se eliminarán todos sus datos.', confirmText: 'Eliminar', danger: true,
    }));
  }

  async loader(): Promise<void> {
    await this.loading.wrap(() => new Promise(r => setTimeout(r, 1500)), { message: 'Listo' });
  }

  applyBrand(): void {
    if (!isValidSeeds(this.seeds)) {
      void this.dialog.error({ title: 'Colores inválidos', message: 'Usa el formato #RRGGBB en los tres colores.' });
      return;
    }
    this.brand.apply({ nombre: this.nombre || null, logoUrl: null, seeds: { ...this.seeds } });
  }

  resetBrand(): void {
    this.seeds = { ...DEFAULT_BRAND };
    this.brand.reset();
  }
}

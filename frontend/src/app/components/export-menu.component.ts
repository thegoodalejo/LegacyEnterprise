import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { FormatoReporte } from '../services/reports/report-spec';
import { TranslatePipe } from '../services/translation.service';

export interface ExportAlcance {
  /** Identificador estable (también sirve de id en el DOM): 'seleccion', 'filtro', 'todos'… */
  id: string;
  etiqueta: string;
  deshabilitado?: boolean;
}
export interface ExportSolicitud { alcance: string; formato: FormatoReporte }

/**
 * Botón «Exportar» reutilizable: un menú con cada alcance posible (selección, resultados del filtro, todo) y, en cada uno,
 * Excel o PDF. No exporta nada por sí solo: emite lo pedido y la pantalla arma el ReportSpec.
 */
@Component({
  selector: 'app-export-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatDivider, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, TranslatePipe],
  template: `
    <button mat-stroked-button id="btn-export" [matMenuTriggerFor]="menu" [disabled]="disabled()">
      <mat-icon>download</mat-icon>{{ 'report.export' | translate }}
    </button>
    <mat-menu #menu="matMenu">
      @for (a of alcances(); track a.id; let last = $last) {
        <div class="titulo" role="presentation">{{ a.etiqueta }}</div>
        <button mat-menu-item [id]="'export-' + a.id + '-xlsx'" [disabled]="a.deshabilitado" (click)="exportar.emit({ alcance: a.id, formato: 'xlsx' })">
          <mat-icon>table_chart</mat-icon>{{ 'report.format_xlsx' | translate }}
        </button>
        <button mat-menu-item [id]="'export-' + a.id + '-pdf'" [disabled]="a.deshabilitado" (click)="exportar.emit({ alcance: a.id, formato: 'pdf' })">
          <mat-icon>picture_as_pdf</mat-icon>{{ 'report.format_pdf' | translate }}
        </button>
        @if (!last) { <mat-divider /> }
      }
    </mat-menu>
  `,
  styles: `
    .titulo { padding: 10px 16px 4px; font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
  `,
})
export class ExportMenuComponent {
  readonly alcances = input.required<ExportAlcance[]>();
  readonly disabled = input(false);
  readonly exportar = output<ExportSolicitud>();
}

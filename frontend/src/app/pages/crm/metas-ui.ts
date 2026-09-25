// Piezas de pantalla de las metas que se repiten en el panel, la página de metas, el perfil y los diálogos.
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { DateInputComponent } from '../../components/date-input.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { EstadoMeta, FormatoMetrica, Meta, PeriodoMeta } from '../../services/crm.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { PERIODOS_META, etiquetaPeriodo, indicePeriodo, rangoMeta } from './metas-periodo';

export const ESTADO_ICONO: Record<EstadoMeta, string> = {
  cumplida: 'check_circle', en_ritmo: 'trending_up', en_riesgo: 'warning', atrasada: 'trending_down', no_cumplida: 'cancel', futura: 'schedule',
};

/** Valor de una métrica en pantalla: dinero con la moneda de la empresa; número con su unidad («1.250 galones»). */
export function valorMetrica(cfg: CrmConfigService, lang: string, formato: FormatoMetrica, unidad: string | null, n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (formato === 'moneda') return cfg.money(n);
  const s = n.toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 });
  return unidad ? `${s} ${unidad}` : s;
}

/** Etiqueta del período de una meta, con las traducciones cargadas. */
export function periodoDe(i18n: TranslationService, m: Pick<Meta, 'periodo' | 'fecha_inicio' | 'fecha_fin'>): string {
  return etiquetaPeriodo(m.periodo, m.fecha_inicio, m.fecha_fin, (k, p) => i18n.t(k, p), i18n.lang());
}

/** Barra de avance: relleno = porcentaje (hasta 100 %), color según el estado y una marca donde debería ir hoy (ritmo lineal). */
@Component({
  selector: 'app-meta-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" role="progressbar" [attr.aria-valuenow]="relleno()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="etiqueta()">
      <span class="fill" [attr.data-estado]="estado()" [style.width.%]="relleno()"></span>
      @if (marca() !== null) { <span class="mark" [style.left.%]="marca()"></span> }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 60px; }
    .track { position: relative; height: 10px; border-radius: 5px; background: var(--md-sys-color-surface-container-highest); overflow: visible; }
    :host(.slim) .track { height: 6px; border-radius: 3px; }
    .fill { display: block; height: 100%; border-radius: inherit; min-width: 2px; background: var(--md-sys-color-tertiary);
      &[data-estado='cumplida'] { background: var(--md-sys-color-primary); }
      &[data-estado='en_riesgo'] { background: color-mix(in srgb, var(--md-sys-color-error) 55%, var(--md-sys-color-surface)); }
      &[data-estado='atrasada'], &[data-estado='no_cumplida'] { background: var(--md-sys-color-error); }
      &[data-estado='futura'] { background: var(--md-sys-color-outline); } }
    .mark { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--md-sys-color-on-surface); opacity: 0.7; }
  `,
})
export class MetaBarComponent {
  readonly porcentaje = input(0);
  /** % del período transcurrido (posición esperada). null = sin marca. */
  readonly tiempoPct = input<number | null>(null);
  readonly estado = input<EstadoMeta>('en_ritmo');
  readonly etiqueta = input('');
  readonly relleno = computed(() => Math.max(0, Math.min(100, this.porcentaje())));
  readonly marca = computed(() => {
    const t = this.tiempoPct();
    return t === null || this.estado() === 'futura' || t <= 0 || t >= 100 ? null : t;
  });
}

/** Estado de una meta como chip (ícono + texto: no depende solo del color). */
@Component({
  selector: 'app-meta-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, TranslatePipe],
  template: `<span class="chip" [attr.data-estado]="estado()"><mat-icon>{{ icono() }}</mat-icon>{{ 'crm.goals.st_' + estado() | translate }}</span>`,
  styles: `
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px 2px 6px; border-radius: 8px; font: var(--mat-sys-label-medium); white-space: nowrap;
      background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
      &[data-estado='cumplida'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      /* en riesgo: contorno (aviso leve); atrasada: relleno (grave). Igual en claro y oscuro, donde error-container es más oscuro que error. */
      &[data-estado='en_riesgo'] { background: transparent; color: var(--md-sys-color-error); box-shadow: inset 0 0 0 1px var(--md-sys-color-error); }
      &[data-estado='atrasada'] { background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); }
      &[data-estado='no_cumplida'] { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-error); }
      &[data-estado='futura'] { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); } }
  `,
})
export class MetaEstadoComponent {
  readonly estado = input.required<EstadoMeta>();
  readonly icono = computed(() => ESTADO_ICONO[this.estado()]);
}

/** Período elegido en un formulario: `fecha` = cualquier día del período (en personalizado, el inicio). */
export interface PeriodoSel { periodo: PeriodoMeta; fecha: string; fechaFin: string | null }

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Selector de período: tipo + mes/trimestre/semestre + año, o dos fechas; muestra el rango resultante. */
@Component({
  selector: 'app-periodo-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormField, MatLabel, MatInput, MatSelect, MatOption, DateInputComponent, TranslatePipe],
  template: `
    <div class="form-row">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'crm.goals.period' | translate }}</mat-label>
        <mat-select [id]="prefijo() + '-periodo'" [ngModel]="value().periodo" (ngModelChange)="setPeriodo($event)">
          @for (p of periodos; track p) { <mat-option [value]="p">{{ 'crm.goals.p_' + p | translate }}</mat-option> }
        </mat-select>
      </mat-form-field>
      @switch (value().periodo) {
        @case ('mes') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.month' | translate }}</mat-label>
            <mat-select [id]="prefijo() + '-mes'" [ngModel]="mes()" (ngModelChange)="setMes($event)">
              @for (m of meses; track m) { <mat-option [value]="m">{{ nombreMes(m) }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
        @case ('trimestre') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.p_trimestre' | translate }}</mat-label>
            <mat-select [id]="prefijo() + '-trimestre'" [ngModel]="indice()" (ngModelChange)="setMes(($event - 1) * 3 + 1)">
              @for (q of [1, 2, 3, 4]; track q) { <mat-option [value]="q">{{ q }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
        @case ('semestre') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.p_semestre' | translate }}</mat-label>
            <mat-select [id]="prefijo() + '-semestre'" [ngModel]="indice()" (ngModelChange)="setMes($event === 1 ? 1 : 7)">
              <mat-option [value]="1">1</mat-option><mat-option [value]="2">2</mat-option>
            </mat-select>
          </mat-form-field>
        }
      }
      @if (value().periodo === 'personalizado') {
        <app-date-input [label]="'crm.goals.from' | translate" [value]="value().fecha" (valueChange)="value.set({ periodo: 'personalizado', fecha: $event ?? '', fechaFin: value().fechaFin })" />
        <app-date-input [label]="'crm.goals.to' | translate" [value]="value().fechaFin" (valueChange)="value.set({ periodo: 'personalizado', fecha: value().fecha, fechaFin: $event })" />
      } @else {
        <mat-form-field appearance="outline" class="year">
          <mat-label>{{ 'crm.goals.year' | translate }}</mat-label>
          <input matInput type="number" min="2000" max="2100" [id]="prefijo() + '-anio'" [ngModel]="anio()" (ngModelChange)="setAnio($event)" />
        </mat-form-field>
      }
    </div>
    <span class="range muted small" [id]="prefijo() + '-rango'">{{ rangoTexto() }}</span>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 2px; }
    .form-row > * { flex: 1 1 150px; min-width: 0; }
    .year { flex: 0 1 120px; }
    .range { margin: -12px 0 4px 4px; }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export class PeriodoPickerComponent {
  private i18n = inject(TranslationService);
  readonly value = model.required<PeriodoSel>();
  readonly prefijo = input('meta');
  readonly periodos = PERIODOS_META;
  readonly meses = MESES;

  readonly anio = computed(() => Number(this.value().fecha.slice(0, 4)) || new Date().getFullYear());
  readonly mes = computed(() => Number(this.value().fecha.slice(5, 7)) || 1);
  readonly indice = computed(() => {
    const v = this.value();
    return v.periodo === 'trimestre' || v.periodo === 'semestre' ? indicePeriodo(v.periodo, v.fecha) : 1;
  });
  readonly rango = computed(() => rangoMeta(this.value().periodo, this.value().fecha, this.value().fechaFin));
  readonly rangoTexto = computed(() => {
    const r = this.rango();
    if (!r) return this.i18n.t('crm.goals.range_invalid');
    const f = (s: string) => s.split('-').reverse().join('-');
    return `${etiquetaPeriodo(this.value().periodo, r.inicio, r.fin, (k, p) => this.i18n.t(k, p), this.i18n.lang())} · ${f(r.inicio)} – ${f(r.fin)}`;
  });

  nombreMes(m: number): string {
    const s = new Intl.DateTimeFormat(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1)));
    return s.charAt(0).toLocaleUpperCase() + s.slice(1);
  }

  setPeriodo(p: PeriodoMeta): void {
    const v = this.value();
    if (p === 'personalizado') { const r = rangoMeta(v.periodo, v.fecha, v.fechaFin); this.value.set({ periodo: p, fecha: r?.inicio ?? v.fecha, fechaFin: r?.fin ?? null }); return; }
    this.value.set({ periodo: p, fecha: rangoMeta(p, v.fecha)?.inicio ?? v.fecha, fechaFin: null });
  }
  setMes(m: number): void {
    this.value.set({ ...this.value(), fecha: `${this.anio()}-${String(m).padStart(2, '0')}-01` });
  }
  setAnio(y: number | string): void {
    const n = Number(y);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) return;
    const v = this.value();
    this.value.set({ ...v, fecha: `${n}-${v.fecha.slice(5, 7) || '01'}-01` });
  }
}

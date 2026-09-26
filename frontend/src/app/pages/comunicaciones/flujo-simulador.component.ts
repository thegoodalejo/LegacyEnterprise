import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { ComunicacionesService, Disparador, EstadoSimulacion, Grafo, OpcionMsg, ResultadoSimulacion, SalidaBot } from '../../services/comunicaciones.service';
import { ContactoFila } from '../../services/crm.service';
import { DialogService } from '../../services/dialog.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { waHtml } from './wa-format';

interface Burbuja { yo: boolean; salida?: SalidaBot; texto?: string; nota?: string }

/**
 * «Probar» del editor: una conversación simulada con el flujo tal como está en el editor (aunque no se haya guardado). No envía nada por
 * WhatsApp ni guarda datos. Se puede iniciar el flujo directo o escribir una palabra para ver qué flujo se activa.
 */
@Component({
  selector: 'app-flujo-simulador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIconButton, MatIcon, MatTooltip, ContactoPickerComponent, TranslatePipe],
  template: `
    <header class="sh">
      <h2>{{ 'com.sim.title' | translate }}</h2>
      <button mat-icon-button (click)="reiniciar()" [matTooltip]="'com.sim.restart' | translate" [attr.aria-label]="'com.sim.restart' | translate"><mat-icon>restart_alt</mat-icon></button>
      <button mat-icon-button (click)="cerrar.emit()" [attr.aria-label]="'common.close' | translate"><mat-icon>close</mat-icon></button>
    </header>
    <div class="contacto">
      @if (contacto(); as c) { <span class="muted small">{{ 'com.sim.as' | translate: { name: c.nombre_completo } }}</span><button mat-button (click)="contacto.set(null)">{{ 'com.sim.change' | translate }}</button> }
      @else { <app-contacto-picker tipo="persona" [label]="'com.sim.contact' | translate" (picked)="contacto.set($event)" /> }
    </div>
    <div class="chat" #chat>
      @for (b of burbujas(); track $index) {
        @if (b.nota) { <div class="nota">{{ b.nota }}</div> }
        @else if (b.yo) { <div class="yo">{{ b.texto }}</div> }
        @else if (b.salida; as s) {
          <div class="bot">
            <div [innerHTML]="html(s.texto)"></div>
            @if (s.tipo === 'botones') {
              <div class="ops">@for (o of s.botones; track o.id) { <button class="op" [disabled]="!ultima(b)" (click)="elegir(o)">{{ o.titulo }}</button> }</div>
            }
            @if (s.tipo === 'lista') {
              <div class="ops col"><span class="muted small"><mat-icon class="mini">list</mat-icon>{{ s.boton }}</span>
                @for (o of s.filas; track o.id) { <button class="op" [disabled]="!ultima(b)" (click)="elegir(o)">{{ o.titulo }}@if (o.descripcion) { <span class="muted small"> · {{ o.descripcion }}</span> }</button> }</div>
            }
          </div>
        }
      } @empty { <p class="muted small vacio">{{ 'com.sim.empty' | translate }}</p> }
    </div>
    <div class="acciones">
      <button mat-stroked-button id="btn-sim-start" (click)="iniciar()"><mat-icon>play_arrow</mat-icon>{{ 'com.sim.start' | translate }}</button>
    </div>
    <div class="input">
      <input id="sim-input" [(ngModel)]="texto" (keydown.enter)="escribir()" [placeholder]="'com.sim.write' | translate" maxlength="500" />
      <button mat-icon-button (click)="escribir()" [disabled]="!texto.trim() || ocupado()" [attr.aria-label]="'com.inbox.send' | translate"><mat-icon>send</mat-icon></button>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--md-sys-color-surface); }
    .sh { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--md-sys-color-outline-variant); h2 { flex: 1; margin: 0; font: var(--mat-sys-title-medium); } }
    .contacto { padding: 8px 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; app-contacto-picker { flex: 1; } }
    .chat { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; background: var(--md-sys-color-surface-container-low); }
    .yo, .bot { max-width: 85%; padding: 6px 10px; border-radius: 12px; overflow-wrap: anywhere; font: var(--mat-sys-body-medium); }
    .yo { align-self: flex-end; background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
    .bot { align-self: flex-start; background: var(--md-sys-color-surface-container-lowest); }
    .nota { align-self: center; font: var(--mat-sys-body-small); color: var(--md-sys-color-on-surface-variant); text-align: center; padding: 2px 8px; }
    .ops { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; &.col { flex-direction: column; } }
    .op { padding: 6px 10px; border-radius: 10px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); color: var(--md-sys-color-primary);
      font: var(--mat-sys-label-large); cursor: pointer; text-align: left; &:disabled { cursor: default; opacity: .6; } }
    .mini { width: 14px; height: 14px; font-size: 14px; vertical-align: middle; }
    .small { font: var(--mat-sys-body-small); }
    .vacio { text-align: center; margin: 24px 8px; }
    .acciones { display: flex; gap: 8px; padding: 8px 12px 0; }
    .input { display: flex; gap: 4px; padding: 8px; input { flex: 1; padding: 10px 14px; border-radius: 20px; border: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface); font: inherit; } }
  `,
})
export class FlujoSimuladorComponent {
  readonly grafo = input.required<Grafo>();
  readonly idFlujo = input(0);
  readonly nombre = input('');
  readonly disparadores = input<Disparador[]>([]);
  readonly cerrar = output<void>();
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  private chat = viewChild<ElementRef<HTMLElement>>('chat');

  readonly burbujas = signal<Burbuja[]>([]);
  readonly contacto = signal<ContactoFila | null>(null);
  readonly ocupado = signal(false);
  private estado: EstadoSimulacion | null = null;
  texto = '';

  html(t: string): string { return waHtml(t); }
  ultima(b: Burbuja): boolean { return this.burbujas().at(-1) === b && this.estado?.nodo != null; }

  reiniciar(): void { this.estado = null; this.burbujas.set([]); }
  iniciar(): void { this.reiniciar(); void this.llamar({ iniciar: true }); }

  escribir(): void {
    const t = this.texto.trim();
    if (!t) return;
    this.texto = '';
    this.burbujas.update(l => [...l, { yo: true, texto: t }]);
    void this.llamar({ texto: t });
  }

  elegir(o: OpcionMsg): void {
    this.burbujas.update(l => [...l, { yo: true, texto: o.titulo }]);
    void this.llamar({ texto: o.titulo, respuestaId: o.id });
  }

  private async llamar(o: { iniciar?: boolean; texto?: string; respuestaId?: string }): Promise<void> {
    this.ocupado.set(true);
    try {
      const r = await this.com.probarFlujo({ grafo: this.grafo(), idFlujo: this.idFlujo(), nombre: this.nombre() || this.i18n.t('com.flow.this_flow'),
        disparadores: this.disparadores(), estado: this.estado, texto: o.texto, respuestaId: o.respuestaId, iniciar: o.iniciar, idContacto: this.contacto()?.id ?? null });
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.sim.error'), message: r.mensaje }); return; }
      this.aplicar(r.data);
    } finally { this.ocupado.set(false); }
  }

  private aplicar(r: ResultadoSimulacion): void {
    const nuevas: Burbuja[] = r.salidas.map(s => ({ yo: false, salida: s }));
    const t = (k: string, p?: Record<string, string>) => this.i18n.t(k, p);
    if (r.flujo && !this.estado?.id_flujo && r.resultado !== 'sin_coincidencia') nuevas.unshift({ yo: false, nota: t('com.sim.started', { name: r.flujo }) });
    if (r.resultado === 'fin') nuevas.push({ yo: false, nota: t('com.sim.end') });
    if (r.resultado === 'asesor') nuevas.push({ yo: false, nota: t('com.sim.advisor') });
    if (r.resultado === 'sin_coincidencia') nuevas.push({ yo: false, nota: t('com.sim.no_match_' + r.sin_coincidencia) });
    if (r.resultado === 'error') nuevas.push({ yo: false, nota: t('com.sim.error_note', { msg: r.nota ?? '' }) });
    this.estado = r.resultado === 'esperando' ? r.estado : null;
    this.burbujas.update(l => [...l, ...nuevas]);
    setTimeout(() => { const el = this.chat()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ComunicacionesService, RespuestaRapida } from '../../services/comunicaciones.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

interface RespuestaData { equipo: boolean; respuesta?: RespuestaRapida }

/** Crear o editar una respuesta rápida (personal o de equipo). */
@Component({
  selector: 'app-respuesta-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatFormField, MatLabel, MatHint, MatPrefix, MatInput,
    MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data.respuesta ? 'com.qr.edit' : 'com.qr.new') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'com.qr.shortcut' | translate }}</mat-label>
            <span matTextPrefix>/</span>
            <input matInput id="qr-shortcut" [(ngModel)]="atajo" maxlength="30" />
            <mat-hint>{{ 'com.qr.shortcut_hint' | translate }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'com.qr.title' | translate }}</mat-label>
            <input matInput id="qr-title" [(ngModel)]="titulo" maxlength="100" />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'com.qr.text' | translate }}</mat-label>
          <textarea matInput id="qr-text" rows="5" [(ngModel)]="texto" maxlength="4096"></textarea>
        </mat-form-field>
        @if (data.respuesta) { <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle> }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-qr-save" [disabled]="guardando() || !atajo.trim() || !titulo.trim() || !texto.trim()" (click)="guardar()">{{ 'common.save' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class RespuestaDialogComponent {
  readonly data = inject<RespuestaData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RespuestaDialogComponent, boolean>);
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  atajo = this.data.respuesta?.atajo ?? '';
  titulo = this.data.respuesta?.titulo ?? '';
  texto = this.data.respuesta?.texto ?? '';
  activo = this.data.respuesta?.activo ?? true;
  readonly guardando = signal(false);

  async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.com.saveRespuesta({ id: this.data.respuesta?.id ?? 0, equipo: this.data.equipo ? 1 : 0, atajo: this.atajo.trim(), titulo: this.titulo.trim(),
        texto: this.texto, activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.qr.error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally { this.guardando.set(false); }
  }
}

/**
 * Lista editable de respuestas rápidas: las de equipo (Ajustes, L2+) o las personales (desde la bandeja).
 */
@Component({
  selector: 'app-respuestas-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, TranslatePipe],
  template: `
    <div class="head">
      <p class="muted">{{ (equipo() ? 'com.qr.team_desc' : 'com.qr.personal_desc') | translate }}</p>
      <button mat-flat-button id="btn-qr-new" (click)="editar()"><mat-icon>add</mat-icon>{{ 'com.qr.new' | translate }}</button>
    </div>
    @for (r of propias(); track r.id) {
      <div class="row" [class.off]="!r.activo">
        <div class="txt"><strong>/{{ r.atajo }}</strong> · {{ r.titulo }}<span class="muted small">{{ r.texto }}</span></div>
        <button mat-icon-button (click)="editar(r)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
      </div>
    } @empty { <div class="empty-state"><mat-icon>bolt</mat-icon><span>{{ 'com.qr.empty' | translate }}</span></div> }
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; p { margin: 0; flex: 1 1 260px; } }
    .row { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: .55; } }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class RespuestasEditorComponent {
  readonly equipo = input(false);
  private com = inject(ComunicacionesService);
  private matDialog = inject(MatDialog);
  private loading = inject(LoadingService);
  readonly todas = signal<RespuestaRapida[]>([]);
  readonly propias = computed(() => this.todas().filter(r => r.equipo === this.equipo()));

  constructor() { queueMicrotask(() => void this.cargar()); }

  async cargar(): Promise<void> {
    const r = await this.loading.wrap(() => this.com.listRespuestas(true));
    if (r.action && r.data) this.todas.set(r.data.respuestas);
  }

  editar(r?: RespuestaRapida): void {
    this.matDialog.open(RespuestaDialogComponent, { ...dialogSize('560px'), data: { equipo: this.equipo(), respuesta: r } })
      .afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }
}

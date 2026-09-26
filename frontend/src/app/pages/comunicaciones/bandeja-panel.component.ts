import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ContactoNotasComponent } from '../../components/contacto-notas.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { Conversacion } from '../../services/comunicaciones.service';
import { ContactoDetalle, CrmService } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

/** Panel lateral de la bandeja: el contacto de la conversación (datos, etiquetas, lo que capturó el chatbot y notas). */
@Component({
  selector: 'app-bandeja-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIconButton, MatIcon, TagChipComponent, ContactoNotasComponent, TranslatePipe],
  template: `
    <header class="phead">
      <h2>{{ 'com.inbox.contact' | translate }}</h2>
      <button mat-icon-button (click)="cerrar.emit()" [attr.aria-label]="'common.close' | translate"><mat-icon>close</mat-icon></button>
    </header>
    @if (conv(); as c) {
      <div class="pbody">
        @if (d(); as det) {
          <section>
            <a class="nombre" [routerLink]="['/m/comunicaciones/contactos', det.contacto.id]">{{ det.contacto.nombre_completo }}</a>
            <dl>
              <div><dt>WhatsApp</dt><dd>+{{ c.wa_id }}</dd></div>
              @if (c.nombre_perfil && c.nombre_perfil !== det.contacto.nombre_completo) { <div><dt>{{ 'com.inbox.profile_name' | translate }}</dt><dd>{{ c.nombre_perfil }}</dd></div> }
              @if (det.contacto.correo) { <div><dt>{{ 'crm.form.correo' | translate }}</dt><dd>{{ det.contacto.correo }}</dd></div> }
              @if (det.contacto.documento_numero) { <div><dt>{{ 'crm.form.doc_number' | translate }}</dt><dd>{{ det.contacto.documento_numero }}</dd></div> }
              @if (det.contacto.ciudad) { <div><dt>{{ 'crm.form.ciudad' | translate }}</dt><dd>{{ det.contacto.ciudad }}</dd></div> }
            </dl>
            <a mat-button [routerLink]="['/m/comunicaciones/contactos', det.contacto.id]"><mat-icon>badge</mat-icon>{{ 'com.inbox.open_profile' | translate }}</a>
          </section>
          <section>
            <div class="shead"><h3>{{ 'crm.form.tags' | translate }}</h3>
              <button mat-button id="btn-panel-tags" (click)="etiquetas()"><mat-icon>label</mat-icon>{{ 'crm.form.edit_tags' | translate }}</button></div>
            <div class="chips">@for (t of det.tags; track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> } @empty { <span class="muted">—</span> }</div>
          </section>
        } @else if (!c.id_contacto) {
          <p class="muted">{{ 'com.inbox.no_contact' | translate }}</p>
        }
        @if (variables().length) {
          <section>
            <h3>{{ 'com.inbox.bot_data' | translate }}</h3>
            <dl>@for (v of variables(); track v[0]) { <div><dt>{{ v[0] }}</dt><dd>{{ v[1] }}</dd></div> }</dl>
          </section>
        }
        @if (c.id_contacto) {
          <section>
            <h3>{{ 'notes.title' | translate }}</h3>
            <app-contacto-notas [idContacto]="c.id_contacto" [conversacion]="c.id" />
          </section>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--md-sys-color-surface); }
    .phead { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--md-sys-color-outline-variant);
      h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .pbody { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 16px; }
    section { display: flex; flex-direction: column; gap: 8px; }
    h3 { margin: 0; font: var(--mat-sys-title-small); }
    .shead { display: flex; align-items: center; justify-content: space-between; }
    .nombre { font: var(--mat-sys-title-medium); color: var(--md-sys-color-primary); text-decoration: none; overflow-wrap: anywhere; }
    dl { margin: 0; display: flex; flex-direction: column; gap: 6px; } dl > div { display: flex; flex-direction: column; }
    dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); } dd { margin: 0; overflow-wrap: anywhere; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  `,
})
export class BandejaPanelComponent {
  readonly conv = input<Conversacion | null>(null);
  readonly cerrar = output<void>();
  private crm = inject(CrmService);
  private matDialog = inject(MatDialog);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  readonly d = signal<ContactoDetalle | null>(null);
  readonly variables = computed(() => Object.entries(this.conv()?.variables ?? {}));
  private cargadoPara = 0;

  constructor() {
    effect(() => {
      const id = this.conv()?.id_contacto ?? 0;
      untracked(() => { if (id !== this.cargadoPara) { this.cargadoPara = id; this.d.set(null); if (id) void this.cargar(id); } });
    });
  }

  private async cargar(id: number): Promise<void> {
    const r = await this.crm.getContacto(id);
    if (r.action && r.data && this.cargadoPara === id) this.d.set(r.data);
  }

  etiquetas(): void {
    const det = this.d();
    if (!det) return;
    const actuales = det.tags.map(t => ({ id: t.id, nombre: t.nombre, color: t.color }));
    this.matDialog.open(TagPickerDialogComponent, { ...dialogSize('480px'), data: { seleccion: actuales.map(t => t.id), actuales, tipo: det.contacto.tipo } })
      .afterClosed().subscribe(async (r: TagPickerResult | undefined) => {
        if (!r) return;
        const res = await this.loading.wrap(() => this.crm.setTags(det.contacto.id, r.ids));
        if (!res.action) await this.dialogs.error({ title: this.i18n.t('crm.form.save_error'), message: res.mensaje });
        await this.cargar(det.contacto.id);
      });
  }
}

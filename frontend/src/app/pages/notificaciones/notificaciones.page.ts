import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { MessagingService } from '../../services/messaging.service';
import { AppNotification, NotificationsService } from '../../services/notifications.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

interface Group { label: string; items: AppNotification[] }

/**
 * /notificaciones — centro de notificaciones.
 * Llega aquí: la campanita, el clic en un push del sistema (?n=<uuid>&sede=<id>) y el "Ver" del
 * snackbar de primer plano. Clic en un ítem → se marca leída y navega a su destino puntual (link).
 */
@Component({
  selector: 'app-notificaciones-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe],
  templateUrl: './notificaciones.page.html',
  styleUrl: './notificaciones.page.scss',
})
export class NotificacionesPage implements OnInit {
  private service = inject(NotificationsService);
  private session = inject(SessionService);
  private route = inject(ActivatedRoute);
  private loading = inject(LoadingService);
  private dialog = inject(DialogService);
  private snackBar = inject(MatSnackBar);
  readonly i18n = inject(TranslationService);
  messaging = inject(MessagingService);

  items = signal<AppNotification[]>([]);
  loaded = signal(false);
  highlight = signal<string | null>(null);
  hasMore = signal(false);

  unread = computed(() => this.items().filter(n => !n.is_read).length);
  read = computed(() => this.items().length - this.unread());
  groups = computed<Group[]>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = 86_400_000;
    const labelOf = (iso: string) => {
      const d = new Date(iso.replace(' ', 'T')); d.setHours(0, 0, 0, 0);
      const diff = Math.round((today.getTime() - d.getTime()) / day);
      if (diff <= 0) return 'notif.today';
      if (diff === 1) return 'notif.yesterday';
      if (diff <= 7) return 'notif.this_week';
      return 'notif.older';
    };
    const out: Group[] = [];
    for (const n of this.items()) {
      const label = labelOf(n.created_at);
      const g = out.find(x => x.label === label) ?? out[out.push({ label, items: [] }) - 1];
      g.items.push(n);
    }
    return out;
  });

  async ngOnInit(): Promise<void> {
    const qp = this.route.snapshot.queryParamMap;
    this.highlight.set(qp.get('n'));
    // El push puede venir de otra sede del usuario: si tiene acceso, se cambia antes de listar.
    const sede = Number(qp.get('sede') || 0);
    if (sede && sede !== this.session.sedeId()) await this.session.switchSede(sede, { navigate: false });
    await this.load();
  }

  async load(more = false): Promise<void> {
    const before = more ? (this.items().at(-1)?.id ?? 0) : 0;
    const page = await this.loading.wrap(() => this.service.list(before));
    this.items.set(more ? [...this.items(), ...page] : page);
    this.hasMore.set(page.length === 50);
    this.loaded.set(true);
    void this.service.refreshCount();
    const h = this.highlight();
    if (h) setTimeout(() => document.getElementById('n-' + h)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  async open(n: AppNotification): Promise<void> {
    this.items.update(list => list.map(x => (x.uuid === n.uuid ? { ...x, is_read: true } : x)));
    await this.service.open(n);
  }

  async markRead(n: AppNotification): Promise<void> {
    this.items.update(list => list.map(x => (x.uuid === n.uuid ? { ...x, is_read: true } : x)));
    await this.service.markRead(n.uuid);
  }

  async markAllRead(): Promise<void> {
    await this.loading.wrap(() => this.service.markAllRead());
    this.items.update(list => list.map(x => ({ ...x, is_read: true })));
  }

  async remove(n: AppNotification): Promise<void> {
    const ok = await this.service.remove(n.uuid, !n.is_read);
    if (ok) {
      this.items.update(list => list.filter(x => x.uuid !== n.uuid));
      this.snackBar.open(this.i18n.t('notif.deleted'), undefined, { duration: 2500 });
    }
  }

  async clearRead(): Promise<void> {
    const ok = await this.dialog.confirm({
      title: this.i18n.t('notif.clear_read'),
      message: this.i18n.t('notif.clear_read_confirm', { n: this.read() }),
      confirmText: this.i18n.t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await this.loading.wrap(() => this.service.clearRead());
    this.items.update(list => list.filter(x => !x.is_read));
  }

  async enablePush(): Promise<void> {
    const ok = await this.loading.wrap(() => this.messaging.enable());
    if (!ok && this.messaging.state() === 'denied') {
      await this.dialog.info({ title: this.i18n.t('notif.push_blocked_title'), message: this.i18n.t('notif.push_blocked_msg') });
    }
  }
}

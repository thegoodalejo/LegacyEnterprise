import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { SessionService } from './session.service';

export interface AppNotification {
  id: number;
  uuid: string;
  title: string;
  body: string;
  link: string | null;
  tag: string;
  icon: string | null;
  image: string | null;
  custom_data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Estado de la campanita + acciones del centro de notificaciones.
 * El contador se refresca: al tener sede, al cambiar de sede, al volver la pestaña a primer plano,
 * al llegar un push en primer plano (MessagingService) y cada 60s solo si la pestaña está visible.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private api = inject(ApiService);
  private session = inject(SessionService);
  private router = inject(Router);

  readonly unreadCount = signal(0);

  constructor() {
    effect(() => {
      if (this.session.sedeId()) void this.refreshCount();
      else this.unreadCount.set(0);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refreshCount();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshCount();
    }, 60_000);
  }

  async refreshCount(): Promise<void> {
    if (!this.session.sedeId()) return;
    try {
      const r = await this.api.post<{ count: number }>('notificaciones/unread_count.php');
      if (r.action && r.data) this.unreadCount.set(r.data.count);
    } catch { /* silencioso: es de fondo */ }
  }

  async list(before = 0): Promise<AppNotification[]> {
    const r = await this.api.post<AppNotification[]>('notificaciones/list.php', { before, limit: 50 });
    return r.action && r.data ? r.data : [];
  }

  async markRead(uuid: string): Promise<void> {
    await this.api.post('notificaciones/mark_read.php', { uuid });
    this.unreadCount.update(n => Math.max(0, n - 1));
  }

  async markAllRead(): Promise<void> {
    await this.api.post('notificaciones/mark_all_read.php');
    this.unreadCount.set(0);
  }

  async remove(uuid: string, wasUnread: boolean): Promise<boolean> {
    const r = await this.api.post('notificaciones/delete.php', { uuid });
    if (r.action && wasUnread) this.unreadCount.update(n => Math.max(0, n - 1));
    return r.action;
  }

  async clearRead(): Promise<number> {
    const r = await this.api.post<{ deleted: number }>('notificaciones/clear_read.php');
    return r.data?.deleted ?? 0;
  }

  /**
   * Clic en una notificación DENTRO de la app: se marca leída y lleva a su destino puntual.
   * (El clic en el push del sistema lleva a /notificaciones: lo resuelve el service worker.)
   */
  async open(n: AppNotification): Promise<void> {
    if (!n.is_read) {
      n.is_read = true;
      this.markRead(n.uuid).catch(() => undefined);
    }
    const link = n.link || '';
    if (/^https?:\/\//i.test(link)) window.open(link, '_blank', 'noopener');
    else if (link && link !== '/notificaciones') await this.router.navigateByUrl(link);
  }
}

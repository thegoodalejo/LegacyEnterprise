import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificationsService } from '../services/notifications.service';
import { TranslatePipe } from '../services/translation.service';

/** Campanita de la barra superior: contador de no leídas → /notificaciones. */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatBadgeModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
  template: `
    <button mat-icon-button routerLink="/notificaciones"
            [matTooltip]="'notif.title' | translate"
            [attr.aria-label]="('notif.title' | translate) + (count() ? ' (' + count() + ')' : '')">
      <mat-icon [matBadge]="badge()" [matBadgeHidden]="!count()" matBadgeColor="warn" matBadgeSize="small" aria-hidden="false">
        {{ count() ? 'notifications_active' : 'notifications' }}
      </mat-icon>
    </button>
  `,
})
export class NotificationBellComponent {
  private notifications = inject(NotificationsService);
  count = this.notifications.unreadCount;
  badge = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
}

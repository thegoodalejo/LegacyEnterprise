import { Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslationService } from './translation.service';

/**
 * Loader global con el logo de la app (LoadingOverlayComponent, en app.component.html).
 *   await this.loading.wrap(() => this.api.post('x/save.php', data), { message: 'Guardado' });
 * - Contador: varios wrap() anidados o en paralelo mantienen el overlay hasta que termina el último.
 * - Retardo de 150ms: una llamada rápida no produce parpadeo.
 * - Si la operación lanza: snackbar de error genérico y se propaga el error.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private snackBar = inject(MatSnackBar);
  private i18n = inject(TranslationService);

  private pending = signal(0);
  private shown = signal(false);
  readonly message = signal<string | null>(null);
  readonly visible = computed(() => this.shown() && this.pending() > 0);
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  async wrap<T>(operation: () => Promise<T>, opts: { message?: string; loadingText?: string } = {}): Promise<T> {
    this.start(opts.loadingText);
    try {
      const result = await operation();
      if (opts.message) this.toast(opts.message);
      return result;
    } catch (e) {
      this.toast(this.i18n.t('common.error'));
      throw e;
    } finally {
      this.stop();
    }
  }

  private start(text?: string): void {
    this.pending.update(n => n + 1);
    if (text) this.message.set(text);
    if (this.pending() === 1) {
      this.showTimer = setTimeout(() => this.shown.set(true), 150);
    }
  }

  private stop(): void {
    this.pending.update(n => Math.max(0, n - 1));
    if (this.pending() === 0) {
      if (this.showTimer) clearTimeout(this.showTimer);
      this.showTimer = null;
      this.shown.set(false);
      this.message.set(null);
    }
  }

  private toast(msg: string): void {
    this.snackBar.open(msg, this.i18n.t('common.close'), { duration: 3500 });
  }
}

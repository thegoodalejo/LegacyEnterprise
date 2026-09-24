import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AppDialogComponent, AppDialogData } from '../components/app-dialog.component';

/** Tamaño estándar de TODO diálogo: ancho relativo con tope, así Material lo reduce en móvil. */
export function dialogSize(maxWidth: '480px' | '560px' | '720px' | '960px' = '560px'): Pick<MatDialogConfig, 'width' | 'maxWidth'> {
  return { width: '92vw', maxWidth };
}

/**
 * Reemplazo de alert()/confirm() (prohibidos por ESLint no-alert).
 *   if (!(await dialog.confirm({ title, message, confirmText: 'Eliminar', danger: true }))) return;
 *   await dialog.info({ title: 'Listo', message: '…' });
 *   await dialog.error({ title: 'No se pudo guardar', message: resp.mensaje });
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private dialog = inject(MatDialog);

  confirm(opts: Omit<AppDialogData, 'variant'>): Promise<boolean> {
    return this.open({ ...opts, variant: 'confirm' }).then(r => r === true);
  }

  info(opts: Omit<AppDialogData, 'variant' | 'cancelText' | 'danger'>): Promise<void> {
    return this.open({ ...opts, variant: 'info' }).then(() => undefined);
  }

  success(opts: Omit<AppDialogData, 'variant' | 'cancelText' | 'danger'>): Promise<void> {
    return this.open({ ...opts, variant: 'success' }).then(() => undefined);
  }

  error(opts: Omit<AppDialogData, 'variant' | 'cancelText' | 'danger'>): Promise<void> {
    return this.open({ ...opts, variant: 'error' }).then(() => undefined);
  }

  private open(data: AppDialogData): Promise<boolean | undefined> {
    const ref = this.dialog.open(AppDialogComponent, {
      ...dialogSize('480px'),
      data,
      autoFocus: data.variant === 'confirm' ? 'dialog' : 'first-tabbable',
      restoreFocus: true,
    });
    return firstValueFrom(ref.afterClosed());
  }
}

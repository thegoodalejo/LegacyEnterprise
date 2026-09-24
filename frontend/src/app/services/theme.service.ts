import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const KEY = 'le_theme';

/**
 * Tema claro/oscuro: clase `dark-theme` en <html> (los tokens oscuros cuelgan de `:root.dark-theme`).
 * Preferencia por dispositivo; si nunca se eligió, sigue al sistema. El toggle vive en el menú de usuario.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.initial());

  constructor() {
    this.apply(this.mode());
  }

  toggle(): void {
    this.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    this.apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* sin storage: solo esta sesión */ }
  }

  private apply(mode: ThemeMode): void {
    document.documentElement.classList.toggle('dark-theme', mode === 'dark');
  }

  private initial(): ThemeMode {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* sin storage */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}

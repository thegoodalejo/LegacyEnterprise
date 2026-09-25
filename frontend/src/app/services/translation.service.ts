import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';

/**
 * i18n mínimo: JSON plano en public/i18n/<lang>.json ({"pagina.clave": "texto {n}"}) cargado en
 * runtime. El idioma viene de la sesión (usuarios.idioma), no de localStorage.
 * Cargar antes del bootstrap: provideAppInitializer(() => inject(TranslationService).use('es')).
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly lang = signal('es');
  private dict = signal<Record<string, string>>({});
  /** Variables disponibles en TODOS los textos como {nombre} (p. ej. el vocabulario de la empresa: {persona}, {Personas}). */
  private readonly globals = signal<Record<string, string>>({});

  setGlobals(vars: Record<string, string>): void {
    this.globals.set(vars);
  }

  async use(lang: string): Promise<void> {
    try {
      const res = await fetch(`/i18n/${lang}.json`, { cache: 'no-cache' });
      this.dict.set(await res.json());
      this.lang.set(lang);
    } catch (e) {
      console.error('[i18n] no se pudo cargar', lang, e);
    }
  }

  /** El texto sin interpolar (no lee las variables globales: lo usa quien las calcula). */
  raw(key: string): string {
    return this.dict()[key] ?? key;
  }

  t(key: string, params?: Record<string, string | number>): string {
    let s = this.dict()[key] ?? key;
    for (const [k, v] of Object.entries({ ...this.globals(), ...(params ?? {}) })) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }
}

@Pipe({ name: 'translate', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(TranslationService);
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

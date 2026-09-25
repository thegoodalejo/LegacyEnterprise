import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ClaveVocabulario, CrmService, Vocabulario } from './crm.service';
import { SessionService } from './session.service';
import { TranslationService } from './translation.service';

export const VOCAB_CLAVES: readonly ClaveVocabulario[] = ['contacto', 'persona', 'organizacion'];

const PLURAL: Record<ClaveVocabulario, string> = { contacto: 'contactos', persona: 'personas', organizacion: 'organizaciones' };
const CAPITAL: Record<ClaveVocabulario, string> = { contacto: 'Contacto', persona: 'Persona', organizacion: 'Organizacion' };

const minus = (s: string): string => s.toLocaleLowerCase();
const mayus = (s: string): string => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/**
 * Vocabulario del CRM por empresa: cómo se llama en pantalla a Contacto, Persona y Organización ("Paciente", "Planta"…).
 * Sin personalizar se usa el nombre por defecto del idioma (crm.voc.def.*). Publica las variables como globales de
 * TranslationService, así cualquier texto puede llevar {persona}, {personas}, {Persona}, {Personas}, {organizacion}…:
 * minúscula para frases, mayúscula inicial para títulos y etiquetas. Los textos se redactan sin artículos ni adjetivos
 * que dependan del género ("Crear {persona}"), para que sirva cualquier palabra que elija la empresa.
 */
@Injectable({ providedIn: 'root' })
export class CrmVocabService {
  private crm = inject(CrmService);
  private i18n = inject(TranslationService);

  /** Solo lo que la empresa personalizó. */
  readonly overrides = signal<Vocabulario>({});

  private readonly vars = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of VOCAB_CLAVES) {
      const s = this.nombre(k, false), p = this.nombre(k, true);
      out[k] = minus(s); out[PLURAL[k]] = minus(p);
      out[CAPITAL[k]] = mayus(s); out[mayus(PLURAL[k])] = mayus(p);
    }
    return out;
  });

  constructor() {
    effect(() => this.i18n.setGlobals(this.vars()));
    inject(SessionService).sedeChanged.subscribe(() => void this.load());
  }

  /** Nombre vigente (personalizado o por defecto) tal como se escribió, sin cambiar mayúsculas. */
  nombre(clave: ClaveVocabulario, plural: boolean): string {
    const o = this.overrides()[clave];
    if (o) return plural ? o.plural : o.singular;
    return this.defecto(clave, plural);
  }

  /** Nombre por defecto del idioma (el que se usa mientras la empresa no personalice). */
  defecto(clave: ClaveVocabulario, plural: boolean): string {
    return this.i18n.raw(`crm.voc.def.${clave}.${plural ? 'p' : 's'}`);
  }

  async load(): Promise<void> {
    try {
      const r = await this.crm.listVocabulario();
      if (r.action && r.data) this.overrides.set({ ...r.data.vocabulario });
    } catch { /* sin red: quedan los nombres por defecto */ }
  }

  async save(v: Vocabulario): Promise<string | null> {
    const r = await this.crm.saveVocabulario(v);
    if (!r.action || !r.data) return r.mensaje;
    this.overrides.set({ ...r.data.vocabulario });
    return null;
  }
}

/** Carga el vocabulario antes de mostrar una pantalla del CRM (evita ver un instante los nombres por defecto). */
export const crmVocabResolver: ResolveFn<boolean> = async () => {
  await inject(CrmVocabService).load();
  return true;
};

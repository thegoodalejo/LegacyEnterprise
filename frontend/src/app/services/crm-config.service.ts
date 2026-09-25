import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfigCrm, CrmService } from './crm.service';
import { SessionService } from './session.service';
import { TranslationService } from './translation.service';

/** Moneda y decimales con que la empresa muestra los montos del CRM (oportunidades, ventas, metas). Sin conversión entre monedas. */
@Injectable({ providedIn: 'root' })
export class CrmConfigService {
  private crm = inject(CrmService);
  private i18n = inject(TranslationService);

  readonly config = signal<ConfigCrm>({ moneda: 'COP', decimales: 0 });

  private readonly formatter = computed(() => {
    const c = this.config();
    try {
      return new Intl.NumberFormat(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', {
        style: 'currency', currency: c.moneda, minimumFractionDigits: c.decimales, maximumFractionDigits: c.decimales,
      });
    } catch {
      return null;   // código de moneda desconocido para Intl: se muestra «COD 1234»
    }
  });

  constructor() {
    inject(SessionService).sedeChanged.subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    try {
      const r = await this.crm.getConfig();
      if (r.action && r.data) this.config.set(r.data);
    } catch { /* sin red: quedan los valores por defecto */ }
  }

  set(c: ConfigCrm): void {
    this.config.set(c);
  }

  /** «$ 1.250.000» con la moneda de la empresa; «—» si no hay valor. */
  money(v: number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return this.formatter()?.format(v) ?? `${this.config().moneda} ${v}`;
  }
}

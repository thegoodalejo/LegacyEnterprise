import { etiquetaPeriodo, fechaReferenciaMes, indicePeriodo, nombreMes, rangoMeta, sumarMeses } from './metas-periodo';

const t = (k: string, p?: Record<string, string | number>) => `${k}:${p?.['n'] ?? ''}:${p?.['y'] ?? ''}`;

describe('metas-periodo', () => {
  describe('rangoMeta (igual que crmMetaPeriodo en el backend)', () => {
    it('mes: del 1 al último día, con febrero bisiesto', () => {
      expect(rangoMeta('mes', '2026-09-25')).toEqual({ inicio: '2026-09-01', fin: '2026-09-30' });
      expect(rangoMeta('mes', '2028-02-10')).toEqual({ inicio: '2028-02-01', fin: '2028-02-29' });
      expect(rangoMeta('mes', '2026-02-10')).toEqual({ inicio: '2026-02-01', fin: '2026-02-28' });
    });
    it('trimestre y semestre', () => {
      expect(rangoMeta('trimestre', '2026-08-15')).toEqual({ inicio: '2026-07-01', fin: '2026-09-30' });
      expect(rangoMeta('trimestre', '2026-12-31')).toEqual({ inicio: '2026-10-01', fin: '2026-12-31' });
      expect(rangoMeta('semestre', '2026-06-30')).toEqual({ inicio: '2026-01-01', fin: '2026-06-30' });
      expect(rangoMeta('semestre', '2026-07-01')).toEqual({ inicio: '2026-07-01', fin: '2026-12-31' });
    });
    it('año y personalizado', () => {
      expect(rangoMeta('anio', '2026-05-05')).toEqual({ inicio: '2026-01-01', fin: '2026-12-31' });
      expect(rangoMeta('personalizado', '2026-05-05', '2026-06-20')).toEqual({ inicio: '2026-05-05', fin: '2026-06-20' });
      expect(rangoMeta('personalizado', '2026-05-05', '2026-05-01')).toBeNull();
      expect(rangoMeta('personalizado', '2026-05-05', null)).toBeNull();
      expect(rangoMeta('mes', null)).toBeNull();
    });
  });

  it('sumarMeses cruza el año hacia adelante y hacia atrás', () => {
    expect(sumarMeses('2026-11-20', 2)).toBe('2027-01-01');
    expect(sumarMeses('2026-01-31', -1)).toBe('2025-12-01');
    expect(sumarMeses('2026-09-25', 0)).toBe('2026-09-01');
  });

  it('fechaReferenciaMes: hoy en el mes en curso, último día si pasó, primero si es futuro', () => {
    expect(fechaReferenciaMes('2026-09-01', '2026-09-25')).toBe('2026-09-25');
    expect(fechaReferenciaMes('2026-08-01', '2026-09-25')).toBe('2026-08-31');
    expect(fechaReferenciaMes('2026-10-01', '2026-09-25')).toBe('2026-10-01');
  });

  it('indicePeriodo', () => {
    expect(indicePeriodo('trimestre', '2026-09-30')).toBe(3);
    expect(indicePeriodo('semestre', '2026-09-30')).toBe(2);
  });

  it('etiquetas', () => {
    expect(nombreMes('2026-09-01', 'es')).toBe('Septiembre de 2026');
    expect(nombreMes('2026-09-01', 'en')).toBe('September 2026');
    expect(etiquetaPeriodo('trimestre', '2026-07-01', '2026-09-30', t, 'es')).toBe('crm.goals.label_trimestre:3:2026');
    expect(etiquetaPeriodo('anio', '2026-01-01', '2026-12-31', t, 'es')).toBe('crm.goals.label_anio::2026');
    expect(etiquetaPeriodo('personalizado', '2026-05-05', '2026-06-20', t, 'es')).toBe('05-05-2026 – 20-06-2026');
  });
});

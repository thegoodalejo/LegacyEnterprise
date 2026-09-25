import { parseNumero } from './crm-format';

describe('crm-format', () => {
  describe('parseNumero', () => {
    it('español: punto de miles y coma decimal', () => {
      expect(parseNumero('25.000.000')).toBe(25000000);
      expect(parseNumero('1.234,5')).toBe(1234.5);
      expect(parseNumero('$ 2.500')).toBe(2500);
      expect(parseNumero('25,5')).toBe(25.5);
      expect(parseNumero('1500000')).toBe(1500000);
    });
    it('un separador que no forma grupos de miles es decimal', () => {
      expect(parseNumero('25.5')).toBe(25.5);
      expect(parseNumero('0.75')).toBe(0.75);
    });
    it('inglés: coma de miles y punto decimal', () => {
      expect(parseNumero('25,000,000', 'en')).toBe(25000000);
      expect(parseNumero('1,234.5', 'en')).toBe(1234.5);
    });
    it('vacío → null; basura → NaN', () => {
      expect(parseNumero('  ')).toBeNull();
      expect(parseNumero(null)).toBeNull();
      expect(parseNumero('12a')).toBeNaN();
      expect(parseNumero('1.2.3,4,5')).toBeNaN();
    });
  });
});

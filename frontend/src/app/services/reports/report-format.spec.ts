import { aNumero, aclarar, contraste, crearFormateador, hexToRgb, partesFecha, pdfSeguro, rgbToHex } from './report-format';

const tx = { si: 'Sí', no: 'No' };

describe('report-format', () => {
  describe('crearFormateador (es-CO, COP)', () => {
    const fmt = crearFormateador('es-CO', 'COP', tx);

    it('formatea números con miles y decimales opcionales', () => {
      expect(fmt(1234567, 'numero')).toBe('1.234.567');
      expect(fmt('52.5', 'numero')).toBe('52,5');
      expect(fmt(3.14159, 'numero', 2)).toBe('3,14');
    });

    it('formatea moneda sin decimales por defecto', () => {
      expect(fmt(2500000, 'moneda').replace(/\s/g, ' ')).toMatch(/^\$ ?2\.500\.000$/);
    });

    it('formatea porcentajes', () => {
      expect(fmt(45.5, 'porcentaje')).toBe('45,5%');
    });

    it('formatea fechas dd-mm-aaaa sin correrlas por zona horaria', () => {
      expect(fmt('2026-09-25', 'fecha')).toBe('25-09-2026');
      expect(fmt('2026-09-25 14:03:59', 'fechahora')).toBe('25-09-2026 14:03');
      expect(fmt('2026-01-01', 'fechahora')).toBe('01-01-2026');
    });

    it('formatea booleanos con los textos traducidos y deja vacío lo que no hay', () => {
      expect(fmt(true, 'booleano')).toBe('Sí');
      expect(fmt('0', 'booleano')).toBe('No');
      expect(fmt(null, 'texto')).toBe('');
      expect(fmt(undefined, 'numero')).toBe('');
      expect(fmt('', 'fecha')).toBe('');
    });

    it('deja como texto lo que no es numérico en una columna numérica', () => {
      expect(fmt('abc', 'numero')).toBe('abc');
    });
  });

  describe('pdfSeguro', () => {
    it('conserva tildes, ñ, comillas y guiones típicos', () => {
      expect(pdfSeguro('Ñandú — «Ángela» • 50 €')).toContain('Ñandú');
      expect(pdfSeguro('Cañón – ok')).toBe('Cañón – ok');
    });

    it('reemplaza lo que las fuentes estándar de PDF no dibujan', () => {
      expect(pdfSeguro('a → b')).toBe('a -> b');
      expect(pdfSeguro('gráfico 📊')).toBe('gráfico ?');
    });

    it('normaliza tabuladores y saltos de línea a espacios', () => {
      expect(pdfSeguro('a\tb\nc')).toBe('a b c');
    });
  });

  describe('fechas y números', () => {
    it('partesFecha lee fecha y fecha con hora', () => {
      expect(partesFecha('2026-09-25')).toMatchObject({ y: 2026, mo: 9, d: 25, conHora: false });
      expect(partesFecha('2026-09-25T08:05:07')).toMatchObject({ h: 8, mi: 5, se: 7, conHora: true });
      expect(partesFecha('25-09-2026')).toBeNull();
    });

    it('aNumero acepta números y texto numérico, y rechaza el resto', () => {
      expect(aNumero(5)).toBe(5);
      expect(aNumero('52.5')).toBe(52.5);
      expect(aNumero('')).toBeNull();
      expect(aNumero('x')).toBeNull();
      expect(aNumero(NaN)).toBeNull();
      expect(aNumero(true)).toBeNull();
    });
  });

  describe('color', () => {
    it('convierte hex ↔ rgb y aclara hacia blanco', () => {
      expect(hexToRgb('#3949AB')).toEqual([57, 73, 171]);
      expect(rgbToHex([57, 73, 171])).toBe('#3949ab');
      expect(aclarar([0, 0, 0], 1)).toEqual([255, 255, 255]);
      expect(aclarar([100, 100, 100], 0)).toEqual([100, 100, 100]);
    });

    it('elige texto claro sobre fondos oscuros y oscuro sobre claros', () => {
      expect(contraste([57, 73, 171])).toEqual([255, 255, 255]);
      expect(contraste([253, 216, 53])).toEqual([17, 24, 39]);
    });
  });
});

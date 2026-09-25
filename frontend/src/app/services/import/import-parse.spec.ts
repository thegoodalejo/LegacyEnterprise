import { Celda, MapeoVentas, armarVentas, bloques, decodificar, detectarEncabezado, detectarSeparador, mapeoAutomatico, parsearCsv, parsearFecha, parsearNumero, valorCelda } from './import-parse';

describe('import-parse', () => {
  describe('CSV', () => {
    it('detecta el separador (punto y coma de Excel en español, coma, tabulador)', () => {
      expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';');
      expect(detectarSeparador('a,b,c\n1,2,3')).toBe(',');
      expect(detectarSeparador('a\tb\tc')).toBe('\t');
      expect(detectarSeparador('"x;y",b,c\n"1;2",2,3')).toBe(',');
    });

    it('respeta comillas, comillas escapadas, saltos de línea internos y CRLF', () => {
      const csv = 'Cliente;Descripción\r\n"Pinturas ""El Sol"" S.A.S.";"Línea 1\nlínea 2"\r\n\r\n900;x\r\n';
      expect(parsearCsv(csv)).toEqual([['Cliente', 'Descripción'], ['Pinturas "El Sol" S.A.S.', 'Línea 1\nlínea 2'], ['900', 'x']]);
    });

    it('decodifica UTF-8 con BOM y cae a Windows-1252 si no es UTF-8', () => {
      const utf8 = new TextEncoder().encode('\uFEFFañó');
      expect(decodificar(utf8.buffer as ArrayBuffer)).toBe('añó');
      const latin1 = new Uint8Array([0x61, 0xf1, 0xf3]);   // «añó» en Windows-1252
      expect(decodificar(latin1.buffer as ArrayBuffer)).toBe('añó');
    });
  });

  describe('celdas de ExcelJS', () => {
    it('saca el valor de fórmulas, texto enriquecido e hipervínculos', () => {
      expect(valorCelda({ formula: 'A1*2', result: 10 })).toBe(10);
      expect(valorCelda({ richText: [{ text: 'Hola ' }, { text: 'mundo' }] })).toBe('Hola mundo');
      expect(valorCelda({ text: 'enlace', hyperlink: 'http://x' })).toBe('enlace');
      expect(valorCelda({ error: '#N/A' })).toBeNull();
      expect(valorCelda(undefined)).toBeNull();
    });
  });

  describe('fechas', () => {
    it('lee dd/mm/aaaa, aaaa-mm-dd y mm/dd/aaaa según el formato', () => {
      expect(parsearFecha('25/09/2026', 'dmy')).toBe('2026-09-25');
      expect(parsearFecha('5-9-26', 'dmy')).toBe('2026-09-05');
      expect(parsearFecha('2026-09-25 14:30', 'dmy')).toBe('2026-09-25');
      expect(parsearFecha('09/25/2026', 'mdy')).toBe('2026-09-25');
      expect(parsearFecha('2026/09/25', 'ymd')).toBe('2026-09-25');
    });

    it('rechaza fechas imposibles o ilegibles', () => {
      expect(parsearFecha('31/02/2026', 'dmy')).toBeNull();
      expect(parsearFecha('mañana', 'dmy')).toBeNull();
      expect(parsearFecha(null, 'dmy')).toBeNull();
    });

    it('acepta Date (en UTC) y el número de serie de Excel', () => {
      expect(parsearFecha(new Date(Date.UTC(2026, 8, 25)), 'dmy')).toBe('2026-09-25');
      expect(parsearFecha(46290, 'dmy')).toBe('2026-09-25');
      expect(parsearFecha(12, 'dmy')).toBeNull();
    });
  });

  describe('números', () => {
    it('separador decimal coma (1.234.567,89) y punto (1,234,567.89)', () => {
      expect(parsearNumero('1.234.567,89', 'coma')).toBe(1234567.89);
      expect(parsearNumero('1,234,567.89', 'punto')).toBe(1234567.89);
      expect(parsearNumero('$ 78.000', 'coma')).toBe(78000);
      expect(parsearNumero('(1.500)', 'coma')).toBe(-1500);
      expect(parsearNumero(12.5, 'coma')).toBe(12.5);
    });

    it('vacío es null e ilegible es NaN', () => {
      expect(parsearNumero('', 'coma')).toBeNull();
      expect(parsearNumero(null, 'coma')).toBeNull();
      expect(parsearNumero('doce', 'coma')).toBeNaN();
    });
  });

  describe('mapeo y encabezado', () => {
    it('propone columnas por el nombre del encabezado, sin tildes ni mayúsculas', () => {
      const m = mapeoAutomatico(['Fecha factura', 'NIT', 'No. Factura', 'Código', 'Descripción', 'Cant', 'Vr. Unitario', 'Valor total', 'Vendedor']);
      expect(m).toEqual({ fecha: 0, cliente: 1, documento: 2, codigo: 3, descripcion: 4, cantidad: 5, precio: 6, total: 7 });
    });

    it('deja en null lo que no reconoce', () => {
      expect(mapeoAutomatico(['A', 'B']).fecha).toBeNull();
    });

    it('detecta la fila del encabezado saltando títulos de una sola celda', () => {
      expect(detectarEncabezado([['Informe de ventas'], [], ['Fecha', 'NIT', 'Total'], ['1', '2', '3']])).toBe(3);
    });
  });

  describe('armar ventas', () => {
    const m: MapeoVentas = { columnas: { fecha: 0, cliente: 1, documento: 2, codigo: 3, cantidad: 4, precio: 5, total: 6 }, fila_encabezado: 1, formato_fecha: 'dmy', decimal: 'coma' };
    const filas: Celda[][] = [
      ['Fecha', 'NIT', 'Factura', 'Código', 'Cant', 'Precio', 'Total'],
      ['10/09/2026', '900123', 'F-1', 'A', '2', '1.000', null],
      ['10/09/2026', '900123', 'F-1', 'B', '1', null, '500'],
      ['11/09/2026', '900456', 'F-2', 'A', '1', '1.000', null],
      [null, null, null, null, null, null, null],
      ['xx', '900456', 'F-3', 'A', '1', '1', null],
      ['12/09/2026', '', 'F-4', 'A', '1', '1', null],
      ['12/09/2026', '900456', 'F-5', 'A', 'dos', '1', null],
      ['12/09/2026', '900456', 'F-6', 'A', '1', null, null],
      ['13/09/2026', '900789', 'F-1', 'C', '1', '1', null],
    ];

    it('agrupa por documento y reporta los errores por fila (numeradas como en el archivo)', () => {
      const r = armarVentas(filas, m);
      expect(r.filas).toBe(8);
      expect(r.ventas.map(v => [v.documento, v.lineas.length, v.fila])).toEqual([['F-1', 2, 2], ['F-2', 1, 4]]);
      expect(r.ventas[0].lineas[1]).toEqual({ fila: 3, codigo: 'B', descripcion: null, cantidad: 1, precio: null, total: 500 });
      expect(r.errores).toEqual([
        { fila: 6, motivo: 'fecha' }, { fila: 7, motivo: 'cliente' }, { fila: 8, motivo: 'numero' }, { fila: 9, motivo: 'precio' }, { fila: 10, motivo: 'documento_mixto' },
      ]);
    });

    it('sin columna de documento agrupa por cliente y fecha', () => {
      const r = armarVentas(filas.slice(0, 4), { ...m, columnas: { ...m.columnas, documento: null } });
      expect(r.ventas.map(v => [v.cliente, v.fecha, v.lineas.length])).toEqual([['900123', '2026-09-10', 2], ['900456', '2026-09-11', 1]]);
    });

    it('parte en bloques sin pasar los topes de ventas ni de líneas', () => {
      const v = (n: number) => ({ fila: 1, fecha: '2026-01-01', cliente: 'x', documento: null, lineas: Array.from({ length: n }, () => ({ fila: 1, codigo: null, descripcion: null, cantidad: 1, precio: 1, total: null })) });
      expect(bloques([v(1), v(1), v(1)], 2, 100).map(b => b.length)).toEqual([2, 1]);
      expect(bloques([v(3), v(3), v(3)], 10, 5).map(b => b.length)).toEqual([1, 1, 1]);
    });
  });
});

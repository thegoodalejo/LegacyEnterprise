import {
  CampoPersonalizadoImport, FilaContacto, MapeoContactos, armarContactos, bloquesContactos, claveCampo, claveDocumento, claveOrganizacion, mapeoContactos,
  ordenarPorMatriz, padresPorBloque, parsearBooleano,
} from './import-contactos';
import { Celda } from './import-parse';

const CAMPOS: CampoPersonalizadoImport[] = [
  { id: 1, etiqueta: 'Peso (kg)', clave: 'peso_kg', tipo_dato: 'decimal' },
  { id: 4, etiqueta: 'Acepta marketing', clave: 'acepta_marketing', tipo_dato: 'booleano' },
  { id: 5, etiqueta: 'Última visita', clave: 'ultima_visita', tipo_dato: 'fecha' },
  { id: 7, etiqueta: 'Código de cliente', clave: 'codigo_cliente', tipo_dato: 'texto' },
];
const fila = (n: number, d: FilaContacto['d']): FilaContacto => ({ fila: n, clave: null, d, campos: {} });

describe('import-contactos', () => {
  describe('mapeo automático', () => {
    it('personas: reconoce encabezados en español con tildes y los campos personalizados por su etiqueta', () => {
      const m = mapeoContactos(['Nombres', 'Apellidos', 'Cédula', 'Correo electrónico', 'Celular', 'WhatsApp', 'Fecha de nacimiento', 'Empresa', 'Cargo', 'Peso (kg)', 'Acepta marketing'], 'persona', CAMPOS);
      expect([m['nombres'], m['apellidos'], m['documento_numero'], m['correo'], m['telefono'], m['whatsapp'], m['fecha_nacimiento'], m['organizacion'], m['rol']])
        .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(m[claveCampo(1)]).toBe(9);
      expect(m[claveCampo(4)]).toBe(10);
      expect(m[claveCampo(5)]).toBeNull();
    });

    it('organizaciones: la persona de referencia se reconoce por «Contacto …» y no se confunde con el teléfono de la empresa', () => {
      const m = mapeoContactos(['Razón social', 'NIT', 'Teléfono', 'Pertenece a', 'Contacto', 'Cargo contacto', 'Teléfono contacto', 'Correo contacto', 'codigo cliente'], 'organizacion', CAMPOS);
      expect([m['razon_social'], m['documento_numero'], m['telefono'], m['pertenece_a'], m['ref_nombres'], m['ref_rol'], m['ref_telefono'], m['ref_correo']])
        .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(m[claveCampo(7)]).toBe(8);   // por la clave del campo
    });
  });

  describe('claves de comparación', () => {
    it('documento: sin dígito de verificación, con puntos o sin ellos', () => {
      expect(claveDocumento('901.142.687-7')).toBe('901142687');
      expect(claveDocumento('901142687')).toBe('901142687');
      expect(claveDocumento('AB-12345')).toBe('12345');
      expect(claveDocumento('x-1')).toBeNull();
    });

    it('organización: por NIT o por nombre (sin tildes ni mayúsculas)', () => {
      expect(claveOrganizacion('900.123.456-7')).toBe('d:900123456');
      expect(claveOrganizacion('  Pinturas  ÁLVAREZ ')).toBe('n:pinturas alvarez');
    });

    it('sí/no en varias formas', () => {
      expect(['Sí', 'si', 'X', 'true', 1, true, 'Verdadero'].map(v => parsearBooleano(v as Celda))).toEqual(Array(7).fill('true'));
      expect(['No', 'false', 0, false, 'FALSO'].map(v => parsearBooleano(v as Celda))).toEqual(Array(5).fill('false'));
      expect(parsearBooleano('')).toBeNull();
      expect(Number.isNaN(parsearBooleano('quizás') as number)).toBe(true);
    });
  });

  describe('armar filas', () => {
    const m: MapeoContactos = {
      tipo: 'persona', fila_encabezado: 1, formato_fecha: 'dmy', decimal: 'coma',
      columnas: { nombres: 0, apellidos: 1, documento_numero: 2, fecha_nacimiento: 3, lat: 4, lng: 5, [claveCampo(1)]: 6, [claveCampo(4)]: 7, [claveCampo(5)]: 8 },
    };
    const filas: Celda[][] = [
      ['Nombres', 'Apellidos', 'Documento', 'Nacimiento', 'Lat', 'Lng', 'Peso', 'Marketing', 'Visita'],
      ['Laura', 'Gómez', '1.098.765.432', '20/05/1990', '4,6097', '-74,0817', '72,5', 'sí', new Date(Date.UTC(2026, 8, 1))],
      [null, null, null, null, null, null, null, null, null],
      ['', 'Sin nombre', '123', '', '', '', '', '', ''],
      ['Pedro', '', '52000111', '31/02/1990', '', '', '', '', ''],
      ['Ana', '', '800', '', 'norte', '', '', '', ''],
      ['Luis', '', '900', '', '', '', '', 'quizás', ''],
      ['Laura', 'Repetida', '1098765432', '', '', '', '', '', ''],
    ];

    it('interpreta textos, fechas, números y sí/no; ignora filas vacías; la clave es el documento', () => {
      const r = armarContactos(filas, m, CAMPOS, 'documento', null);
      expect(r.total).toBe(6);
      expect(r.filas[0]).toEqual({
        fila: 2, clave: '1.098.765.432',
        d: { nombres: 'Laura', apellidos: 'Gómez', documento_numero: '1.098.765.432', fecha_nacimiento: '1990-05-20', lat: 4.6097, lng: -74.0817 },
        campos: { 1: 72.5, 4: 'true', 5: '2026-09-01' },
      });
    });

    it('marca sin nombre, fecha imposible, número o sí/no ilegibles y el repetido en el archivo (con la fila original)', () => {
      const r = armarContactos(filas, m, CAMPOS, 'documento', null);
      expect(r.errores).toEqual([
        { fila: 4, motivo: 'nombre' }, { fila: 5, motivo: 'fecha' }, { fila: 6, motivo: 'numero' }, { fila: 7, motivo: 'booleano' }, { fila: 8, motivo: 'repetido:2' },
      ]);
      expect(r.filas.map(f => f.fila)).toEqual([2]);
    });

    it('reconocer por nombre: la clave es el nombre completo; sin reconocer no hay repetidos', () => {
      expect(armarContactos(filas, m, CAMPOS, 'nombre', null).filas[0].clave).toBe('Laura Gómez');
      const r = armarContactos(filas, m, CAMPOS, 'ninguno', null);
      expect(r.filas.map(f => f.fila)).toEqual([2, 8]);
      expect(r.filas[0].clave).toBeNull();
    });
  });

  describe('matrices y bloques', () => {
    const f = [
      fila(2, { razon_social: 'Tienda Sur', documento_numero: '901000003', pertenece_a: 'Tienda Centro' }),
      fila(3, { razon_social: 'Tienda Centro', documento_numero: '901000002', pertenece_a: '901000001-5' }),
      fila(4, { razon_social: 'Independiente', documento_numero: '901000009' }),
      fila(5, { razon_social: 'Grupo Pinturas', documento_numero: '901000001-5' }),
      fila(6, { razon_social: 'Hija de externa', documento_numero: '901000007', pertenece_a: 'Otra que ya existe' }),
    ];

    it('ordena la matriz antes que sus sucursales, a cualquier profundidad, sin mover las demás', () => {
      expect(ordenarPorMatriz(f).map(x => x.fila)).toEqual([4, 5, 6, 3, 2]);
    });

    it('un ciclo no se cuelga', () => {
      const c = [fila(2, { razon_social: 'A', pertenece_a: 'B' }), fila(3, { razon_social: 'B', pertenece_a: 'A' })];
      expect(ordenarPorMatriz(c).length).toBe(2);
    });

    it('bloques y claves de matrices de bloques anteriores para la simulación', () => {
      const orden = ordenarPorMatriz(f);
      const b = bloquesContactos(orden, 2);
      expect(b.map(x => x.map(y => y.fila))).toEqual([[4, 5], [6, 3], [2]]);
      expect(padresPorBloque(b)).toEqual([[], ['d:901000001'], ['d:901000001', 'n:tienda centro']]);   // solo las que alguien usa como matriz
    });
  });
});

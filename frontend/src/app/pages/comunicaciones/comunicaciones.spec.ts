import { AccionDef, Grafo, Nodo } from '../../services/comunicaciones.service';
import { curva, grafoInicial, limpiarConexiones, nuevoId, posPuerto, puertosDe, variablesDe, NODO_W } from './flujo-modelo';
import { nombreMeta } from './plantilla-editor.page';
import { escHtml, horaCorta, iconoEstado, waHtml } from './wa-format';

const ACCIONES: AccionDef[] = [{
  codigo: 'crm.crear_oportunidad', modulo: 'crm', nombre: 'Crear', descripcion: '', config: [], entradas: [], salidas: ['id_oportunidad'], puertos: ['ok', 'error'],
}];
const nodo = (id: string, tipo: Nodo['tipo'], datos: Record<string, unknown> = {}): Nodo => ({ id, tipo, x: 0, y: 0, datos });

describe('wa-format', () => {
  it('escapa el HTML antes de dar formato (sin inyección)', () => {
    expect(waHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });
  it('negrita, cursiva, tachado y saltos de línea como WhatsApp', () => {
    expect(waHtml('Hola *Ana*, tu _pedido_ ~viejo~')).toBe('Hola <strong>Ana</strong>, tu <em>pedido</em> <s>viejo</s>');
    expect(waHtml('a\nb')).toBe('a<br>b');
    expect(waHtml('2*3*4')).toBe('2*3*4');   // asteriscos dentro de una palabra no son negrita
  });
  it('enlaces con rel=noopener', () => {
    expect(waHtml('ver https://x.co/a')).toContain('<a href="https://x.co/a" target="_blank" rel="noopener noreferrer">');
  });
  it('hora corta y palomitas', () => {
    expect(horaCorta('2026-09-26 14:05:33')).toBe('14:05');
    expect(iconoEstado('leido')).toEqual({ icon: 'done_all', clase: 'st-read' });
    expect(iconoEstado('fallido').icon).toBe('error');
  });
});

describe('flujo-modelo', () => {
  it('salidas por tipo de paso', () => {
    expect(puertosDe(nodo('a', 'mensaje'), []).map(p => p.id)).toEqual(['siguiente']);
    expect(puertosDe(nodo('b', 'botones', { botones: [{ id: 'b1', titulo: 'Sí' }, { id: 'b2', titulo: 'No' }] }), []).map(p => p.id)).toEqual(['b1', 'b2', 'otro']);
    expect(puertosDe(nodo('c', 'pregunta'), []).map(p => p.id)).toEqual(['siguiente', 'invalido']);
    expect(puertosDe(nodo('d', 'condicion'), []).map(p => p.id)).toEqual(['si', 'no']);
    expect(puertosDe(nodo('e', 'accion', { accion: 'crm.crear_oportunidad' }), ACCIONES).map(p => p.id)).toEqual(['ok', 'error']);
    expect(puertosDe(nodo('f', 'fin'), [])).toEqual([]);
  });
  it('las opciones usan su título literal; los demás puertos, una clave de traducción', () => {
    const p = puertosDe(nodo('b', 'botones', { botones: [{ id: 'b1', titulo: 'Ventas' }] }), []);
    expect(p[0]).toEqual({ id: 'b1', etiqueta: 'Ventas', literal: true });
    expect(p[1].etiqueta).toBe('com.flow.port.otro');
  });
  it('quita conexiones de salidas que ya no existen (se borró un botón)', () => {
    const g: Grafo = {
      nodos: [nodo('m', 'botones', { botones: [{ id: 'b1', titulo: 'A' }] }), nodo('x', 'fin')],
      conexiones: [{ de: 'm', puerto: 'b1', a: 'x' }, { de: 'm', puerto: 'b2', a: 'x' }, { de: 'm', puerto: 'b1', a: 'zzz' }],
    };
    expect(limpiarConexiones(g, []).conexiones).toEqual([{ de: 'm', puerto: 'b1', a: 'x' }]);
  });
  it('variables del flujo: preguntas y salidas de acciones', () => {
    const g: Grafo = { nodos: [nodo('p', 'pregunta', { variable: 'ciudad' }), nodo('a', 'accion', { accion: 'crm.crear_oportunidad' })], conexiones: [] };
    expect(variablesDe(g, ACCIONES)).toEqual(['ciudad', 'id_oportunidad']);
  });
  it('ids nuevos sin repetir y geometría de las salidas', () => {
    expect(nuevoId([nodo('n1', 'fin'), nodo('n3', 'fin')])).toBe('n4');
    expect(nuevoId([nodo('n3', 'fin'), nodo('n2', 'fin')])).toBe('n4');
    const n = { ...nodo('a', 'mensaje'), x: 100, y: 50 };
    expect(posPuerto(n, 0).x).toBe(100 + NODO_W);
    expect(curva({ x: 0, y: 0 }, { x: 200, y: 100 })).toBe('M 0 0 C 100 0, 100 100, 200 100');
  });
  it('flujo inicial: inicio → bienvenida → menú de 3 botones, todos conectados', () => {
    const g = grafoInicial(k => k);
    expect(g.nodos.filter(x => x.tipo === 'inicio').length).toBe(1);
    const menu = g.nodos.find(x => x.tipo === 'botones')!;
    expect(puertosDe(menu, []).filter(p => p.id !== 'otro').every(p => g.conexiones.some(c => c.de === menu.id && c.puerto === p.id))).toBe(true);
  });
});

describe('nombreMeta', () => {
  it('minúsculas sin tildes, números y guion bajo (como el servidor)', () => {
    expect(nombreMeta('Confirmación de Pedido #2')).toBe('confirmacion_de_pedido_2');
    expect(nombreMeta('  __Hola   Mundo__ ')).toBe('hola_mundo');
    expect(nombreMeta('¡Ñandú!')).toBe('nandu');
  });
});

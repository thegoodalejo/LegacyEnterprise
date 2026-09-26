// Modelo del editor de flujos: tipos de paso, datos iniciales, salidas (puertos), resumen de cada paso y geometría del lienzo.
// Mismas reglas que el servidor (_com_bot.php: comBotPuertos / comBotValidarDatos): el servidor valida al guardar; esto solo dibuja.

import { AccionDef, Conexion, Grafo, Nodo, TipoNodo } from '../../services/comunicaciones.service';

export const NODO_W = 248;
export const CAB_H = 40;
export const RES_H = 52;
export const PUERTO_H = 28;
export const GRID = 8;

export interface TipoNodoDef { tipo: TipoNodo; icon: string; tono: 'primary' | 'secondary' | 'tertiary' | 'error' | 'neutral' }
export const TIPOS_NODO: TipoNodoDef[] = [
  { tipo: 'mensaje', icon: 'chat', tono: 'primary' },
  { tipo: 'botones', icon: 'smart_button', tono: 'secondary' },
  { tipo: 'lista', icon: 'list', tono: 'secondary' },
  { tipo: 'pregunta', icon: 'help', tono: 'tertiary' },
  { tipo: 'condicion', icon: 'call_split', tono: 'neutral' },
  { tipo: 'accion', icon: 'bolt', tono: 'tertiary' },
  { tipo: 'asesor', icon: 'support_agent', tono: 'error' },
  { tipo: 'ir_flujo', icon: 'redo', tono: 'neutral' },
  { tipo: 'fin', icon: 'flag', tono: 'neutral' },
];
export const ICONO_NODO: Record<TipoNodo, string> = { inicio: 'play_circle', ...Object.fromEntries(TIPOS_NODO.map(t => [t.tipo, t.icon])) } as Record<TipoNodo, string>;
export const TONO_NODO: Record<TipoNodo, string> = { inicio: 'primary', ...Object.fromEntries(TIPOS_NODO.map(t => [t.tipo, t.tono])) } as Record<TipoNodo, string>;

export function datosIniciales(tipo: TipoNodo, t: (k: string) => string): Record<string, unknown> {
  switch (tipo) {
    case 'mensaje': return { texto: t('com.flow.def.message') };
    case 'botones': return { texto: t('com.flow.def.buttons'), botones: [{ id: 'b1', titulo: t('com.flow.def.option') + ' 1' }, { id: 'b2', titulo: t('com.flow.def.option') + ' 2' }] };
    case 'lista': return { texto: t('com.flow.def.list'), boton: t('com.flow.def.list_button'), filas: [{ id: 'f1', titulo: t('com.flow.def.option') + ' 1' }, { id: 'f2', titulo: t('com.flow.def.option') + ' 2' }] };
    case 'pregunta': return { texto: t('com.flow.def.question'), variable: 'respuesta', validacion: 'texto', reintentos: 2 };
    case 'condicion': return { variable: '_respuesta', operador: 'contiene', valor: '' };
    case 'accion': return { accion: '', config: {} };
    case 'asesor': return {};
    case 'ir_flujo': return { id_flujo: null };
    case 'fin': return {};
    default: return {};
  }
}

export interface Puerto { id: string; etiqueta: string; literal: boolean }

/** Salidas del paso, en el orden en que se dibujan. */
export function puertosDe(n: Nodo, acciones: AccionDef[]): Puerto[] {
  const d = n.datos as Record<string, unknown>;
  const k = (id: string): Puerto => ({ id, etiqueta: 'com.flow.port.' + id, literal: false });
  switch (n.tipo) {
    case 'inicio': case 'mensaje': return [k('siguiente')];
    case 'botones': return [...((d['botones'] as { id: string; titulo: string }[]) ?? []).map(b => ({ id: b.id, etiqueta: b.titulo, literal: true })), k('otro')];
    case 'lista': return [...((d['filas'] as { id: string; titulo: string }[]) ?? []).map(b => ({ id: b.id, etiqueta: b.titulo, literal: true })), k('otro')];
    case 'pregunta': return [k('siguiente'), k('invalido')];
    case 'condicion': return [k('si'), k('no')];
    case 'accion': {
      const a = acciones.find(x => x.codigo === d['accion']);
      return (a?.puertos ?? ['ok', 'error']).map(p => k(p));
    }
    default: return [];
  }
}

export function altoNodo(n: Nodo, acciones: AccionDef[]): number {
  return CAB_H + RES_H + puertosDe(n, acciones).length * PUERTO_H + 8;
}
export function posEntrada(n: Nodo): { x: number; y: number } { return { x: n.x, y: n.y + CAB_H / 2 }; }
export function posPuerto(n: Nodo, i: number): { x: number; y: number } { return { x: n.x + NODO_W, y: n.y + CAB_H + RES_H + i * PUERTO_H + PUERTO_H / 2 }; }

/** Curva de Bézier de una salida a una entrada (horizontal en los extremos, como en LegacyChats). */
export function curva(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function nuevoId(nodos: Nodo[], prefijo = 'n'): string {
  let i = nodos.length + 1;
  const ids = new Set(nodos.map(n => n.id));
  while (ids.has(prefijo + i)) i++;
  return prefijo + i;
}

/** Variables que el flujo captura (preguntas) o que dejan sus acciones, para «Insertar variable» y las condiciones. */
export function variablesDe(g: Grafo, acciones: AccionDef[]): string[] {
  const s = new Set<string>();
  for (const n of g.nodos) {
    if (n.tipo === 'pregunta' && n.datos['variable']) s.add(String(n.datos['variable']));
    if (n.tipo === 'accion') for (const v of acciones.find(a => a.codigo === n.datos['accion'])?.salidas ?? []) s.add(v);
  }
  return [...s].sort();
}

/** Flujo nuevo: inicio → bienvenida → menú con tres botones (uno pasa a un asesor). */
export function grafoInicial(t: (k: string) => string): Grafo {
  const nodos: Nodo[] = [
    { id: 'inicio', tipo: 'inicio', x: 40, y: 120, datos: {} },
    { id: 'n1', tipo: 'mensaje', x: 360, y: 80, datos: { texto: t('com.flow.starter.welcome') } },
    { id: 'n2', tipo: 'botones', x: 680, y: 80, datos: { texto: t('com.flow.starter.menu'), botones: [
      { id: 'b1', titulo: t('com.flow.starter.info') }, { id: 'b2', titulo: t('com.flow.starter.hours') }, { id: 'b3', titulo: t('com.flow.starter.agent') }] } },
    { id: 'n3', tipo: 'fin', x: 1000, y: 40, datos: { texto: t('com.flow.starter.info_text') } },
    { id: 'n4', tipo: 'fin', x: 1000, y: 200, datos: { texto: t('com.flow.starter.hours_text') } },
    { id: 'n5', tipo: 'asesor', x: 1000, y: 360, datos: {} },
  ];
  const conexiones: Conexion[] = [
    { de: 'inicio', puerto: 'siguiente', a: 'n1' }, { de: 'n1', puerto: 'siguiente', a: 'n2' },
    { de: 'n2', puerto: 'b1', a: 'n3' }, { de: 'n2', puerto: 'b2', a: 'n4' }, { de: 'n2', puerto: 'b3', a: 'n5' },
  ];
  return { nodos, conexiones };
}

/** Quita conexiones que salen de puertos que ya no existen (p. ej. se borró un botón). */
export function limpiarConexiones(g: Grafo, acciones: AccionDef[]): Grafo {
  const ids = new Set(g.nodos.map(n => n.id));
  const puertos = new Map(g.nodos.map(n => [n.id, new Set(puertosDe(n, acciones).map(p => p.id))]));
  return { ...g, conexiones: g.conexiones.filter(c => ids.has(c.de) && ids.has(c.a) && puertos.get(c.de)?.has(c.puerto)) };
}

// Contrato de los reportes. Cada pantalla arma un ReportSpec (datos + columnas + indicadores) y ReportService lo dibuja
// como PDF o Excel con la marca del cliente. Las pantallas no saben nada de logos, colores ni formatos de archivo.

export type FormatoReporte = 'pdf' | 'xlsx';
export type ColumnaTipo = 'texto' | 'numero' | 'moneda' | 'fecha' | 'fechahora' | 'porcentaje' | 'booleano';
/** Fechas como 'AAAA-MM-DD' o 'AAAA-MM-DD HH:MM:SS' (como las manda el backend); números como number o texto numérico; porcentaje en 0–100. */
export type ReportValor = string | number | boolean | null | undefined;
export type ReportFila = Record<string, ReportValor>;

export interface ReportColumna {
  clave: string;
  titulo: string;
  tipo?: ColumnaTipo;
  /** Peso relativo del ancho en el PDF (por defecto 1). */
  ancho?: number;
  /** Solo aparece en este formato (por defecto, en ambos): el PDF lleva pocas columnas y el Excel todas. */
  solo?: FormatoReporte;
  /** Decimales fijos para numero, moneda y porcentaje. */
  decimales?: number;
}

export interface ReportTabla {
  titulo?: string;
  columnas: ReportColumna[];
  filas: ReportFila[];
  totales?: ReportFila;
}

export interface ReportIndicador {
  etiqueta: string;
  valor: ReportValor;
  tipo?: ColumnaTipo;
  decimales?: number;
}

export interface ReportSpec {
  titulo: string;
  subtitulo?: string;
  /** Sin extensión ni fecha: el servicio agrega ambas. */
  nombreArchivo: string;
  /** Texto legible de los filtros o el alcance con que se generó (una línea cada uno). */
  filtros?: string[];
  indicadores?: ReportIndicador[];
  /** Tablas resumen: van antes del detalle en el PDF y en la hoja «Resumen» del Excel. */
  resumen?: ReportTabla[];
  /** Tablas de detalle: en el PDF, una tras otra; en el Excel, una hoja cada una. */
  detalle: ReportTabla[];
  /** Código ISO para las columnas de moneda (por defecto COP). */
  moneda?: string;
  orientacion?: 'auto' | 'vertical' | 'horizontal';
}

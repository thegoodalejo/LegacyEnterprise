import { ReportLogo } from './report-format';

/** Carga una imagen (data URI o URL del mismo origen) y espera a que termine de decodificarse. */
export function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

/** Proporción ancho/alto de un SVG: primero su viewBox o width/height (los navegadores no siempre informan el tamaño natural). */
function proporcionSvg(svg: string, img: HTMLImageElement): number {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  if (vb && +vb[1] > 0 && +vb[2] > 0) return +vb[1] / +vb[2];
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  if (w && h && +w[1] > 0 && +h[1] > 0) return +w[1] / +h[1];
  return img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
}

/** Texto de un data URI SVG (base64 o url-encoded). */
function textoDeDataUri(dataUri: string): string {
  const coma = dataUri.indexOf(',');
  const cuerpo = dataUri.slice(coma + 1);
  if (/;base64$/i.test(dataUri.slice(0, coma))) {
    const bin = atob(cuerpo);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  return decodeURIComponent(cuerpo);
}

/** Rasteriza un SVG a PNG (jsPDF y ExcelJS no incrustan SVG). `alto` en píxeles: alcanza para verse nítido a ~20 mm. */
export async function svgAPng(dataUri: string, alto = 240): Promise<ReportLogo> {
  const img = await cargarImagen(dataUri);
  const ratio = proporcionSvg(textoDeDataUri(dataUri), img);
  const ancho = Math.max(1, Math.round(alto * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.drawImage(img, 0, 0, ancho, alto);
  return { dataUri: canvas.toDataURL('image/png'), ancho, alto };
}

/** Tamaño real de un PNG/JPEG. */
export async function medirRaster(dataUri: string): Promise<ReportLogo> {
  const img = await cargarImagen(dataUri);
  return { dataUri, ancho: img.naturalWidth || 1, alto: img.naturalHeight || 1 };
}

/** Escala (ancho, alto) para que quepa en la caja sin deformarse. */
export function ajustar(logo: { ancho: number; alto: number }, maxAncho: number, maxAlto: number): { w: number; h: number } {
  const escala = Math.min(maxAncho / logo.ancho, maxAlto / logo.alto);
  return { w: logo.ancho * escala, h: logo.alto * escala };
}

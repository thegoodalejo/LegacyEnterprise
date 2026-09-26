// Formato de WhatsApp (*negrita*, _cursiva_, ~tachado~, ```monoespaciado```) a HTML seguro para mostrarlo en el hilo y en las vistas previas.
// Primero se escapa todo el HTML; después solo se agregan <strong>, <em>, <s>, <code> y <br>. Los enlaces se vuelven <a> con rel=noopener.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ESC[c]);
}

export function waHtml(texto: string | null | undefined): string {
  if (!texto) return '';
  let s = escHtml(texto);
  s = s.replace(/```([\s\S]+?)```/g, '<code>$1</code>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])~([^~\n]+)~(?=[\s.,;:!?)]|$)/g, '$1<s>$2</s>');
  s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.replace(/\n/g, '<br>');
}

/** Hora corta (HH:MM) de una fecha del backend 'AAAA-MM-DD HH:MM:SS'. */
export function horaCorta(s: string | null | undefined): string {
  return s ? s.slice(11, 16) : '';
}

/** «Hoy», «Ayer», o la fecha dd/mm/aaaa; con la hora si se pide. Para la lista de la bandeja y los separadores del hilo. */
export function fechaRelativa(s: string | null | undefined, t: (k: string) => string, conHora = false): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const mismo = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hora = s.slice(11, 16);
  if (mismo(d, hoy)) return conHora ? hora : hora;
  const dia = mismo(d, ayer) ? t('com.time.yesterday') : `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return conHora ? `${dia} ${hora}` : dia;
}

/** Día del separador del hilo: «Hoy», «Ayer» o la fecha larga. */
export function diaSeparador(s: string, t: (k: string) => string, lang: string): string {
  const d = new Date(s.replace(' ', 'T'));
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const mismo = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismo(d, hoy)) return t('com.time.today');
  if (mismo(d, ayer)) return t('com.time.yesterday');
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ícono de las palomitas de un mensaje saliente. */
export function iconoEstado(estado: string): { icon: string; clase: string } {
  switch (estado) {
    case 'pendiente': return { icon: 'schedule', clase: 'st-pend' };
    case 'enviado': return { icon: 'check', clase: 'st-sent' };
    case 'entregado': return { icon: 'done_all', clase: 'st-sent' };
    case 'leido': return { icon: 'done_all', clase: 'st-read' };
    case 'fallido': return { icon: 'error', clase: 'st-fail' };
    default: return { icon: '', clase: '' };
  }
}

/** Ícono de un tipo de mensaje para la lista y el hilo. */
export function iconoTipo(tipo: string): string {
  return ({ image: 'image', video: 'videocam', audio: 'mic', document: 'description', sticker: 'emoji_emotions', location: 'location_on',
    contacts: 'contacts', template: 'article', interactive: 'touch_app', button: 'touch_app', reaction: 'add_reaction', unsupported: 'help' } as Record<string, string>)[tipo] ?? '';
}

/**
 * Catálogo de módulos de la suite (lo que muestra el app switcher).
 * Fase 1: estático. Fase 2–3: el backend devuelve los módulos habilitados para la sede activa
 * (le_sede_modulos, los administra L5 según contrato) y el switcher muestra solo esos, filtrados
 * además por el rol/privilegio del usuario.
 */
import type { AccessRule } from '../services/session.service';

export type ModuleCode = 'crm' | 'comunicaciones' | 'agenda' | 'servicios' | 'pedidos' | 'integraciones' | 'gerencia';

export interface ModuleNavItem {
  path: string;
  icon: string;
  label: string; // clave i18n
  /** Solo se muestra a quien cumpla la regla (misma que usa el guard de la ruta). */
  rule?: AccessRule;
}

export interface AppModule {
  code: ModuleCode;
  icon: string;
  label: string; // clave i18n
  /** Color del tile en el switcher: rol M3 (se recolorea con la marca de la empresa). */
  tone: 'primary' | 'secondary' | 'tertiary';
  nav: ModuleNavItem[];
}

export const APP_MODULES: readonly AppModule[] = [
  {
    code: 'crm', icon: 'handshake', label: 'modules.crm', tone: 'primary',
    nav: [
      { path: '/m/crm/contactos', icon: 'contacts', label: 'nav.crm.contactos' },
      { path: '/m/crm/oportunidades', icon: 'trending_up', label: 'nav.crm.oportunidades' },
      { path: '/m/crm/ventas', icon: 'point_of_sale', label: 'nav.crm.ventas' },
      { path: '/m/crm/metas', icon: 'flag', label: 'nav.crm.metas' },
      { path: '/m/crm/configuracion', icon: 'tune', label: 'nav.crm.configuracion', rule: { minRole: 'L4' } },
    ],
  },
  {
    // Contactos aparece también aquí: son los mismos del CRM (un cliente que solo compró Comunicaciones los necesita igual).
    code: 'comunicaciones', icon: 'forum', label: 'modules.comunicaciones', tone: 'secondary',
    nav: [
      { path: '/m/comunicaciones/bandeja', icon: 'inbox', label: 'nav.com.bandeja' },
      { path: '/m/comunicaciones/chatbot', icon: 'smart_toy', label: 'nav.com.chatbot', rule: { minRole: 'L2' } },
      { path: '/m/comunicaciones/plantillas', icon: 'article', label: 'nav.com.plantillas', rule: { minRole: 'L2' } },
      { path: '/m/comunicaciones/campanas', icon: 'campaign', label: 'nav.com.campanas', rule: { minRole: 'L2' } },
      { path: '/m/comunicaciones/contactos', icon: 'contacts', label: 'nav.com.contactos' },
      { path: '/m/comunicaciones/creditos', icon: 'toll', label: 'nav.com.creditos' },
      { path: '/m/comunicaciones/configuracion', icon: 'tune', label: 'nav.com.configuracion', rule: { minRole: 'L4' } },
    ],
  },
  {
    code: 'agenda', icon: 'calendar_month', label: 'modules.agenda', tone: 'tertiary',
    nav: [
      { path: '/m/agenda', icon: 'today', label: 'nav.agenda.hoy' },
      { path: '/m/agenda/calendario', icon: 'calendar_view_month', label: 'nav.agenda.calendario' },
    ],
  },
  {
    code: 'servicios', icon: 'home_repair_service', label: 'modules.servicios', tone: 'secondary',
    nav: [
      { path: '/m/servicios', icon: 'dashboard', label: 'nav.overview' },
      { path: '/m/servicios/catalogo', icon: 'list_alt', label: 'nav.servicios.catalogo' },
    ],
  },
  {
    code: 'pedidos', icon: 'receipt_long', label: 'modules.pedidos', tone: 'primary',
    nav: [
      { path: '/m/pedidos', icon: 'dashboard', label: 'nav.overview' },
      { path: '/m/pedidos/lista', icon: 'shopping_cart', label: 'nav.pedidos.lista' },
    ],
  },
  {
    code: 'integraciones', icon: 'hub', label: 'modules.integraciones', tone: 'tertiary',
    nav: [{ path: '/m/integraciones', icon: 'extension', label: 'nav.integraciones.conectores' }],
  },
  {
    code: 'gerencia', icon: 'insights', label: 'modules.gerencia', tone: 'secondary',
    nav: [{ path: '/m/gerencia', icon: 'monitoring', label: 'nav.gerencia.tablero' }],
  },
];

export function findModule(code: string | null | undefined): AppModule | undefined {
  return APP_MODULES.find(m => m.code === code);
}

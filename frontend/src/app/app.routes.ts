import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './services/auth.guard';
import { crmVocabResolver } from './services/crm-vocab.service';

/** Editores con guardado explícito (flujos, plantillas, campañas): confirman antes de salir con cambios sin guardar. */
const sinCambiosPendientes = (c: { puedeSalir?: () => boolean | Promise<boolean> } | null) => (c?.puedeSalir ? c.puedeSalir() : true);

// Mismas reglas que el backend: el guard solo evita pantallas inútiles; la seguridad real está en cada endpoint.
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.page'), canActivate: [guestGuard] },
  { path: 'onboarding', loadComponent: () => import('./pages/onboarding/onboarding.page'), canActivate: [authGuard] },
  {
    path: '',
    // Perezoso: el login no descarga la barra, el sidenav ni los selectores.
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: 'home', loadComponent: () => import('./pages/home/home.page') },
      { path: 'notificaciones', loadComponent: () => import('./pages/notificaciones/notificaciones.page').then(m => m.NotificacionesPage) },
      // CRM: rutas propias antes del comodín m/:code/:section (que sigue sirviendo el placeholder de los demás módulos).
      { path: 'm/crm', pathMatch: 'full', redirectTo: 'm/crm/contactos' },
      { path: 'm/crm/contactos', loadComponent: () => import('./pages/crm/contactos.page'), data: { modulo: 'crm' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/crm/contactos/:id', loadComponent: () => import('./pages/crm/contacto-perfil.page'), data: { modulo: 'crm' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/crm/oportunidades', loadComponent: () => import('./pages/crm/oportunidades.page'), data: { modulo: 'crm' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/crm/oportunidades/:id', loadComponent: () => import('./pages/crm/oportunidad-perfil.page'), data: { modulo: 'crm' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/crm/ventas', loadComponent: () => import('./pages/crm/ventas.page'), data: { modulo: 'crm' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/crm/metas', loadComponent: () => import('./pages/crm/metas.page'), data: { modulo: 'crm' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/crm/configuracion', loadComponent: () => import('./pages/crm/crm-config.page'), data: { modulo: 'crm', minRole: 'L4' }, resolve: { voc: crmVocabResolver } },
      // Comunicaciones: Contactos usa las mismas pantallas del CRM (mismos datos) con `base` para que los enlaces se queden en este módulo.
      { path: 'm/comunicaciones', pathMatch: 'full', redirectTo: 'm/comunicaciones/bandeja' },
      { path: 'm/comunicaciones/bandeja', loadComponent: () => import('./pages/comunicaciones/bandeja.page'), data: { modulo: 'comunicaciones' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/chatbot', loadComponent: () => import('./pages/comunicaciones/chatbot.page'), data: { modulo: 'comunicaciones', minRole: 'L2' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/chatbot/:id', loadComponent: () => import('./pages/comunicaciones/flujo-editor.page'), data: { modulo: 'comunicaciones', minRole: 'L2' }, resolve: { voc: crmVocabResolver }, canDeactivate: [sinCambiosPendientes] },
      { path: 'm/comunicaciones/plantillas', loadComponent: () => import('./pages/comunicaciones/plantillas.page'), data: { modulo: 'comunicaciones', minRole: 'L2' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/plantillas/:id', loadComponent: () => import('./pages/comunicaciones/plantilla-editor.page'), data: { modulo: 'comunicaciones', minRole: 'L2' }, resolve: { voc: crmVocabResolver }, canDeactivate: [sinCambiosPendientes] },
      { path: 'm/comunicaciones/campanas', loadComponent: () => import('./pages/comunicaciones/campanas.page'), data: { modulo: 'comunicaciones', minRole: 'L2' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/campanas/:id', loadComponent: () => import('./pages/comunicaciones/campana.page'), data: { modulo: 'comunicaciones', minRole: 'L2' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/contactos', loadComponent: () => import('./pages/crm/contactos.page'), data: { modulo: 'comunicaciones', base: '/m/comunicaciones/contactos' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/contactos/:id', loadComponent: () => import('./pages/crm/contacto-perfil.page'), data: { modulo: 'comunicaciones', base: '/m/comunicaciones/contactos' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/creditos', loadComponent: () => import('./pages/comunicaciones/creditos.page'), data: { modulo: 'comunicaciones' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/comunicaciones/configuracion', loadComponent: () => import('./pages/comunicaciones/com-config.page'), data: { modulo: 'comunicaciones', minRole: 'L4' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/:code', loadComponent: () => import('./pages/module/module.page'), data: { moduloFromParam: true } },
      { path: 'm/:code/:section', loadComponent: () => import('./pages/module/module.page'), data: { moduloFromParam: true } },
      {
        path: 'admin/usuarios', loadComponent: () => import('./pages/admin/usuarios.page'),
        data: { anyOf: [{ minRole: 'L4' }, { privilege: 'usuarios' }] },
      },
      { path: 'admin/empresas', loadComponent: () => import('./pages/admin/empresas.page'), data: { minRole: 'L5' } },
      { path: 'admin/sedes', loadComponent: () => import('./pages/admin/sedes.page'), data: { minRole: 'L5' } },
      { path: 'admin/comunicaciones', loadComponent: () => import('./pages/admin/comunicaciones-admin.page'), data: { minRole: 'L5' } },
      // ngDevMode (no isDevMode()): en producción es `false` en tiempo de build y el chunk ni se genera.
      ...(ngDevMode ? [{ path: 'dev/ui', loadComponent: () => import('./pages/dev/ui-kit.page') }] : []),
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];

import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './services/auth.guard';
import { crmVocabResolver } from './services/crm-vocab.service';

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
      { path: 'm/crm/configuracion', loadComponent: () => import('./pages/crm/crm-config.page'), data: { modulo: 'crm', minRole: 'L4' }, resolve: { voc: crmVocabResolver } },
      { path: 'm/:code', loadComponent: () => import('./pages/module/module.page'), data: { moduloFromParam: true } },
      { path: 'm/:code/:section', loadComponent: () => import('./pages/module/module.page'), data: { moduloFromParam: true } },
      {
        path: 'admin/usuarios', loadComponent: () => import('./pages/admin/usuarios.page'),
        data: { anyOf: [{ minRole: 'L4' }, { privilege: 'usuarios' }] },
      },
      { path: 'admin/empresas', loadComponent: () => import('./pages/admin/empresas.page'), data: { minRole: 'L5' } },
      { path: 'admin/sedes', loadComponent: () => import('./pages/admin/sedes.page'), data: { minRole: 'L5' } },
      // ngDevMode (no isDevMode()): en producción es `false` en tiempo de build y el chunk ni se genera.
      ...(ngDevMode ? [{ path: 'dev/ui', loadComponent: () => import('./pages/dev/ui-kit.page') }] : []),
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];

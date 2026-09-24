import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AccessRule, SessionService } from './session.service';

/**
 * Rutas protegidas:
 *   { path: 'admin/usuarios', component: …, canActivate: [authGuard], data: { minRole: 'L4' } }
 *   { path: 'archivos',       component: …, canActivate: [authGuard], data: { privilege: 'archivos' } }
 *   { path: 'm/:code',        component: …, canActivate: [authGuard], data: { moduloFromParam: true } }
 * Sin sesión → /login · sin sede → /onboarding · sin rol/privilegio/módulo → /home.
 */
export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);

  await auth.whenReady();
  const user = session.user();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { r: state.url } });

  const enOnboarding = state.url.startsWith('/onboarding');
  if (!user.id_sede) {
    if (enOnboarding) return true;
    // L5 sin sede activa: puede usar el panel de plataforma (rutas minRole L5) para crear/elegir sedes.
    // Se mira la ruta hoja: el guard también corre en el shell (padre), que no tiene data.
    let leaf = state.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    if (user.is_platform_admin && leaf.data?.['minRole'] === 'L5') return true;
    return router.createUrlTree(['/onboarding']);
  }
  if (enOnboarding) return router.createUrlTree(['/home']);

  // Módulos: data.modulo fijo, o data.moduloFromParam para /m/:code (contratado en la sede ∩ acceso del usuario).
  const modulo = route.data?.['modulo'] ?? (route.data?.['moduloFromParam'] ? route.paramMap.get('code') ?? '' : undefined);
  const anyOf = route.data?.['anyOf'] as AccessRule[] | undefined;   // p.ej. L4 o privilegio 'usuarios'
  const ok = session.canAccess({ minRole: route.data?.['minRole'], privilege: route.data?.['privilege'], modulo })
    && (!anyOf || anyOf.some(r => session.canAccess(r)));
  if (!ok) {
    console.warn(`[guard] acceso denegado a ${state.url}`);
    return router.createUrlTree(['/home']);
  }
  return true;
};

/** Para /login: si ya hay sesión, a la home (o a la ruta que pidió antes de loguearse). */
export const guestGuard: CanActivateFn = async route => {
  // inject() SIEMPRE antes del primer await: después ya no hay contexto de inyección (NG0203).
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);
  await auth.whenReady();
  if (!session.user()) return true;
  return router.createUrlTree([route.queryParamMap.get('r') || '/home']);
};

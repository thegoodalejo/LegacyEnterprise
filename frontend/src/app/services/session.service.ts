import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ApiService } from './api.service';
import { BrandingService } from './branding.service';
import { APP_MODULES, AppModule, ModuleCode } from '../modules/app-modules';
import { BrandSeeds } from '../theme/brand-scheme';

// Misma jerarquía y lista que auth.php (ROLE_RANK / PRIVILEGES). Cambiar en los dos lados.
export const ROLE_RANK: Record<string, number> = { Nuevo: 0, L0: 1, L1: 2, L2: 3, L3: 4, L4: 5, L5: 9 };
export const MODULE_CODES: readonly ModuleCode[] = ['crm', 'comunicaciones', 'agenda', 'servicios', 'pedidos', 'integraciones', 'gerencia'];
export const PRIVILEGES = ['usuarios', 'archivos', ...MODULE_CODES] as const;
export type Privilege = (typeof PRIVILEGES)[number];

export interface SessionEmpresa {
  id: number;
  nombre: string;
  logo_url: string | null;
  colores: BrandSeeds | null;
}

export interface SessionUser {
  id: number;
  email: string;
  nombre: string | null;
  foto_url: string | null;
  idioma: string;
  is_platform_admin: boolean;
  id_sede: number | null;
  sede_nombre: string | null;
  id_empresa: number | null;
  rol: string | null;
  privilegios: string[];
  empresa: SessionEmpresa | null;
  /** Módulos que el usuario puede abrir (contratados en la sede ∩ su acceso). Alimenta el app switcher. */
  modulos: ModuleCode[];
  /** Módulos contratados y vigentes en la sede activa. */
  modulos_sede: ModuleCode[];
}

export interface AccessRule {
  minRole?: string;
  privilege?: Privilege;
  modulo?: string;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private api = inject(ApiService);
  private router = inject(Router);
  private branding = inject(BrandingService);

  readonly user = signal<SessionUser | null>(null);
  readonly sedeId = computed(() => this.user()?.id_sede ?? null);
  readonly sedeNombre = computed(() => this.user()?.sede_nombre ?? null);
  readonly rol = computed(() => this.user()?.rol ?? null);
  readonly isPlatformAdmin = computed(() => !!this.user()?.is_platform_admin);
  readonly isNuevo = computed(() => this.rol() === 'Nuevo');
  readonly empresa = computed(() => this.user()?.empresa ?? null);

  /** Módulos del app switcher, en el orden del catálogo del frontend. */
  readonly modules = computed<readonly AppModule[]>(() => {
    const codes = new Set(this.user()?.modulos ?? []);
    return APP_MODULES.filter(m => codes.has(m.code));
  });

  /** Emite el id de la sede nueva: los servicios con caché por sede la limpian aquí. */
  readonly sedeChanged = new Subject<number>();

  set(user: SessionUser | null): void {
    const prev = this.user()?.id_sede ?? null;
    this.user.set(user);
    this.applyBrand(user);
    if (user?.id_sede && prev !== null && prev !== user.id_sede) this.sedeChanged.next(user.id_sede);
  }

  clear(): void {
    this.user.set(null);
    this.branding.reset();
  }

  async reload(): Promise<void> {
    const r = await this.api.post<SessionUser>('users/me.php');
    if (r.action && r.data) this.set(r.data);
  }

  hasMinRole(minRole: string): boolean {
    if (this.isPlatformAdmin()) return true;
    return (ROLE_RANK[this.rol() ?? ''] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
  }

  hasPrivilege(p: Privilege): boolean {
    const u = this.user();
    return !!u && (u.is_platform_admin || u.privilegios.includes(p));
  }

  hasModule(code: string): boolean {
    return (this.user()?.modulos ?? []).includes(code as ModuleCode);
  }

  /** Misma regla para el guard y para mostrar/ocultar ítems del menú. */
  canAccess(rule: AccessRule): boolean {
    // Sin sede solo se entra a lo de plataforma (L5 administra empresas/sedes aunque no esté parado en ninguna).
    if (!this.user()?.id_sede) return rule.minRole === 'L5' && !rule.privilege && !rule.modulo && this.isPlatformAdmin();
    if (rule.minRole && !this.hasMinRole(rule.minRole)) return false;
    if (rule.privilege && !this.hasPrivilege(rule.privilege)) return false;
    if (rule.modulo && !this.hasModule(rule.modulo)) return false;
    return true;
  }

  /** Cambia la sede activa. Devuelve el mensaje de error o null si salió bien. */
  async switchSede(idSede: number, opts: { navigate?: boolean } = {}): Promise<string | null> {
    const r = await this.api.post<SessionUser>('sedes/switch_sede.php', { id_sede: idSede });
    if (!r.action || !r.data) return r.mensaje || 'No se pudo cambiar de sede';
    this.set(r.data);
    this.rememberRecent(idSede);
    if (opts.navigate !== false) await this.router.navigateByUrl('/home');
    return null;
  }

  /** Últimas sedes usadas (atajo del selector de L5). Conveniencia por dispositivo. */
  recentSedes(): number[] {
    try { return JSON.parse(localStorage.getItem('recent_sedes') ?? '[]'); } catch { return []; }
  }

  private rememberRecent(id: number): void {
    try {
      const list = [id, ...this.recentSedes().filter(x => x !== id)].slice(0, 5);
      localStorage.setItem('recent_sedes', JSON.stringify(list));
    } catch { /* storage bloqueado: no pasa nada */ }
  }

  /** Marca blanca: la de la empresa de la sede activa; sin sede o sin marca propia, la de Legacy. */
  private applyBrand(user: SessionUser | null): void {
    const e = user?.empresa;
    // Sin logo ni colores propios la empresa no tiene marca blanca: se queda la identidad Legacy Enterprise.
    if (!e || (!e.logo_url && !e.colores)) { this.branding.reset(); return; }
    this.branding.apply({ nombre: e.nombre, logoUrl: e.logo_url, seeds: e.colores });
  }
}

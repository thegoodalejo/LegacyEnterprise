import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MatToolbar } from '@angular/material/toolbar';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatDivider } from '@angular/material/divider';
import { AppSwitcherComponent } from '../../components/app-switcher.component';
import { NotificationBellComponent } from '../../components/notification-bell.component';
import { SedeSwitcherComponent } from '../../components/sede-switcher.component';
import { ModuleNavItem, findModule } from '../../modules/app-modules';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';
import { AccessRule, SessionService } from '../../services/session.service';
import { ThemeService } from '../../services/theme.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

interface GuardedNavItem extends ModuleNavItem {
  rule?: AccessRule;
  /** Visible con cualquiera de estas reglas (p.ej. L4 o privilegio 'usuarios'). */
  anyOf?: AccessRule[];
}

/** Navegación de Inicio: accesos generales + administración según rol (mismas reglas que el guard). */
const HOME_NAV: GuardedNavItem[] = [
  { path: '/home', icon: 'home', label: 'nav.home' },
  { path: '/admin/usuarios', icon: 'group', label: 'nav.admin.usuarios', anyOf: [{ minRole: 'L4' }, { privilege: 'usuarios' }] },
  { path: '/admin/empresas', icon: 'domain', label: 'nav.admin.empresas', rule: { minRole: 'L5' } },
  { path: '/admin/sedes', icon: 'store', label: 'nav.admin.sedes', rule: { minRole: 'L5' } },
];

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbar, MatSidenav, MatSidenavContainer, MatSidenavContent,
    MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatDivider,
    AppSwitcherComponent, SedeSwitcherComponent, NotificationBellComponent, TranslatePipe,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private router = inject(Router);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  readonly session = inject(SessionService);
  readonly brand = inject(BrandingService);
  readonly theme = inject(ThemeService);
  readonly i18n = inject(TranslationService);

  readonly isMobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 839px)').pipe(map(r => r.matches)),
    { initialValue: false },
  );
  readonly drawerOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: this.router.url },
  );

  /** Módulo activo según la URL (/m/<code>/...). */
  readonly activeModule = computed(() => findModule(/^\/m\/([^/?#]+)/.exec(this.url())?.[1]));

  /** Módulos habilitados en la sede activa ∩ permitidos al usuario (los decide el backend). */
  readonly modules = this.session.modules;

  readonly nav = computed<ModuleNavItem[]>(() => {
    const m = this.activeModule();
    this.session.user(); // recomputar al cambiar la sesión
    if (m) return m.nav.filter(i => !i.rule || this.session.canAccess(i.rule));
    return HOME_NAV.filter(i =>
      (!i.rule || this.session.canAccess(i.rule)) && (!i.anyOf || i.anyOf.some(r => this.session.canAccess(r))));
  });

  readonly initials = computed(() => {
    const u = this.session.user();
    const base = (u?.nombre || u?.email || '?').trim();
    return base.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
  });

  toggleNav(): void {
    this.drawerOpen.update(v => !v);
  }

  onNavigate(): void {
    if (this.isMobile()) this.drawerOpen.set(false);
  }

  async setLang(lang: 'es' | 'en'): Promise<void> {
    await this.i18n.use(lang);
    try { await this.api.post('users/save_idioma.php', { idioma: lang }); } catch { /* sin red: queda solo en esta sesión */ }
  }

  logout(): void {
    void this.auth.logout();
  }
}

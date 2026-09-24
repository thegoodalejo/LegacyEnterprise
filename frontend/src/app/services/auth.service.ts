import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GoogleAuthProvider, User, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { ApiService } from './api.service';
import { FirebaseCoreService } from './firebase-core.service';
import { SessionService, SessionUser } from './session.service';

/**
 * Login con Google (Firebase) + handshake con el backend. onIdTokenChanged cubre el login y cada
 * refresco del token (Firebase lo renueva cada hora): en ambos casos se rehace el handshake, que
 * guarda el hash del token nuevo.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private fb = inject(FirebaseCoreService);
  private api = inject(ApiService);
  private session = inject(SessionService);
  private router = inject(Router);

  readonly ready = signal(false);
  private readyPromise: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.readyPromise = new Promise(r => (resolveReady = r));

    this.api.unauthorizedHandler = async () => {
      const u = this.fb.auth.currentUser;
      if (!u) return false;
      return this.handshake(u, true);
    };

    onIdTokenChanged(this.fb.auth, async user => {
      if (user) await this.handshake(user);
      else { this.api.setToken(null); this.session.clear(); }
      if (!this.ready()) { this.ready.set(true); resolveReady(); }
    });
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Devuelve true si quedó con sesión en el backend. */
  async loginWithGoogle(): Promise<boolean> {
    const cred = await signInWithPopup(this.fb.auth, new GoogleAuthProvider());
    // onIdTokenChanged también dispara; handshake() evita repetir el mismo token.
    return this.handshake(cred.user);
  }

  async logout(): Promise<void> {
    try { await this.api.post('users/save_fcm_token.php', { fcm_token: '' }); } catch { /* sin red: igual se cierra */ }
    await signOut(this.fb.auth);
    await this.router.navigateByUrl('/login');
  }

  private lastToken: string | null = null;
  private inFlight: Promise<boolean> | null = null;

  private async handshake(user: User, forceRefresh = false): Promise<boolean> {
    const token = await user.getIdToken(forceRefresh);
    if (token === this.lastToken && this.session.user()) return true;
    if (this.inFlight && token === this.lastToken) return this.inFlight;

    this.lastToken = token;
    this.api.setToken(token);
    this.inFlight = (async () => {
      try {
        const r = await this.api.post<SessionUser>('users/handshake.php', { id_token: token });
        if (r.action && r.data) { this.session.set(r.data); return true; }
      } catch (e) {
        console.error('[auth] handshake falló', e);
      }
      this.lastToken = null;
      this.session.clear();
      return false;
    })();
    try { return await this.inFlight; } finally { this.inFlight = null; }
  }
}

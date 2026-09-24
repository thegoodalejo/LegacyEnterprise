import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface ApiResponse<T = unknown> {
  action: boolean;
  mensaje: string;
  data?: T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/**
 * Única puerta al backend PHP. Envía FormData (arrays/objetos como JSON string, como espera el
 * backend) con el header X-Auth-Token. En 401 pide a AuthService un token nuevo y reintenta una vez.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private token: string | null = null;
  /** Lo registra AuthService: refresca el ID token de Firebase y rehace el handshake. */
  unauthorizedHandler?: () => Promise<boolean>;

  setToken(token: string | null): void {
    this.token = token;
  }

  async post<T = unknown>(endpoint: string, data: Record<string, unknown> = {}, files?: Record<string, File | Blob>): Promise<ApiResponse<T>> {
    const res = await this.send(endpoint, data, files);
    if (res.status === 401 && this.unauthorizedHandler && !endpoint.startsWith('users/handshake')) {
      if (await this.unauthorizedHandler()) return this.parse<T>(await this.send(endpoint, data, files));
    }
    return this.parse<T>(res);
  }

  private send(endpoint: string, data: Record<string, unknown>, files?: Record<string, File | Blob>): Promise<Response> {
    const body = new FormData();
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    for (const [k, f] of Object.entries(files ?? {})) body.append(k, f);

    return fetch(`${environment.apiUrl}/${endpoint}`, {
      method: 'POST',
      headers: this.token ? { 'X-Auth-Token': this.token } : {},
      body,
    });
  }

  private async parse<T>(res: Response): Promise<ApiResponse<T>> {
    const text = await res.text();
    try {
      return JSON.parse(text) as ApiResponse<T>;
    } catch {
      // HTML de un fatal de PHP o de un proxy: no se muestra crudo al usuario.
      console.error('[api] respuesta no JSON', res.status, text.slice(0, 300));
      throw new ApiError('Respuesta inválida del servidor', res.status);
    }
  }
}

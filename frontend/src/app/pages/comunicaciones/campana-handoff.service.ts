import { Injectable, signal } from '@angular/core';
import { AudienciaCampana } from '../../services/comunicaciones.service';

/**
 * Audiencia elegida en Contactos («Campaña de WhatsApp» en la barra de selección) que la pantalla de una campaña nueva toma al abrirse.
 * Solo en memoria: si se recarga la página, la campaña nueva empieza sin audiencia.
 */
@Injectable({ providedIn: 'root' })
export class CampanaHandoffService {
  private readonly pendiente = signal<{ audiencia: AudienciaCampana; n: number; descripcion: string[] } | null>(null);

  dejar(audiencia: AudienciaCampana, n: number, descripcion: string[]): void {
    this.pendiente.set({ audiencia, n, descripcion });
  }

  tomar(): { audiencia: AudienciaCampana; n: number; descripcion: string[] } | null {
    const p = this.pendiente();
    this.pendiente.set(null);
    return p;
  }
}

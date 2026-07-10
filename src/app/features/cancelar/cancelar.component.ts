import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * Estados visuales posibles:
 *   loading    → "Procesando cancelación..." (validación inicial del token)
 *   confirm    → "¿Confirmar cancelación del turno X a las Y?" con botón
 *   submitting → "Procesando cancelación..." (durante el POST)
 *   success    → "Tu turno fue cancelado."  (200 del POST)
 *   already    → "Esta reserva ya fue cancelada anteriormente."  (409)
 *   past       → "No es posible cancelar un turno que ya pasó."  (410)
 *   invalid    → "El link de cancelación no es válido o ya venció."  (404 / network)
 *
 * El flujo es en dos pasos:
 *   1) GET /cancel/:token valida el token (sin cancelar) y muestra los datos.
 *   2) El usuario confirma → POST /cancel/:token ejecuta la cancelación real.
 * Esto previene que los previsualizadores de WhatsApp/Gmail cancelen la
 * reserva con solo previsualizar el link (que es un GET).
 */
type CancelState =
  | 'loading'
  | 'confirm'
  | 'submitting'
  | 'success'
  | 'already'
  | 'past'
  | 'invalid';

interface SlotInfo {
  date: string;
  startTime: string;
  endTime: string;
}

@Component({
  selector: 'app-cancelar',
  imports: [RouterLink],
  templateUrl: './cancelar.component.html',
  styleUrl: './cancelar.component.css',
})
export class CancelarComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  readonly state = signal<CancelState>('loading');
  readonly slot = signal<SlotInfo | null>(null);
  private token: string | null = null;

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.state.set('invalid');
      return;
    }

    // Paso 1: validar el token (GET, sin efectos secundarios). Si el token
    // no es válido (404/409/410) mostramos el error sin pedir confirmación.
    this.http
      .get<{ valid: true; slot: SlotInfo }>(
        `${environment.apiUrl}/cancel/${encodeURIComponent(this.token)}`
      )
      .subscribe({
        next: (resp) => {
          if (resp?.valid && resp.slot) {
            this.slot.set(resp.slot);
            this.state.set('confirm');
          } else {
            this.state.set('invalid');
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err?.status === 410) {
            this.state.set('past');
          } else if (err?.status === 409) {
            this.state.set('already');
          } else {
            // 404 o cualquier otro error (red, 5xx) → invalid.
            this.state.set('invalid');
          }
        },
      });
  }

  /** Paso 2: el usuario confirma y disparamos el POST que cancela de verdad. */
  onConfirmCancel(): void {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    this.state.set('submitting');
    this.http
      .post(
        `${environment.apiUrl}/cancel/${encodeURIComponent(this.token)}`,
        {}
      )
      .subscribe({
        next: () => this.state.set('success'),
        error: (err: HttpErrorResponse) => {
          if (err?.status === 410) {
            this.state.set('past');
          } else if (err?.status === 409) {
            this.state.set('already');
          } else {
            this.state.set('invalid');
          }
        },
      });
  }
}

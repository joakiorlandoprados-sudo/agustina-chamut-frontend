import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * Estados visuales posibles:
 *   loading  → "Procesando cancelación..."
 *   success  → "Tu turno fue cancelado."  (200)
 *   already  → "Esta reserva ya fue cancelada anteriormente."  (409)
 *   past     → "No es posible cancelar un turno que ya pasó."  (410)
 *   invalid  → "El link de cancelación no es válido o ya venció."  (404 / network)
 */
type CancelState = 'loading' | 'success' | 'already' | 'past' | 'invalid';

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

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('invalid');
      return;
    }
    // Pedimos `responseType: 'text'` porque el único dato que nos importa
    // es el status code. El body no se usa en ningún estado.
    this.http
      .get(`${environment.apiUrl}/cancel/${encodeURIComponent(token)}`, {
        responseType: 'text',
      })
      .subscribe({
        next: () => this.state.set('success'),
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
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'admin_token';

interface LoginResponse {
  token: string;
  expiresIn: number;
  admin: { id: number; email: string };
}

interface JwtPayload {
  sub: number;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Decodifica el payload de un JWT sin librerías externas.
 * El payload es base64url-encoded en el segmento central del token.
 * Devuelve null si el formato no es válido.
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64 → atob
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  /** Signal reactivo: false al inicio, true tras login. Sirve para guards/UI. */
  readonly isAuthenticated = signal<boolean>(this.hasValidToken());

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/admin/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.token);
          this.isAuthenticated.set(true);
        }),
        catchError((err) => {
          // Propagamos el error tal cual; el componente decide qué mostrar.
          // El backend devuelve { error, message } con 401 en login inválido.
          this.isAuthenticated.set(false);
          return throwError(() => err);
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.isAuthenticated.set(false);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Hay token válido si:
   *  - existe en localStorage
   *  - se puede decodificar
   *  - tiene `exp` y ese `exp` es futuro (en segundos epoch)
   */
  hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 > Date.now();
  }
}
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Agrega `Authorization: Bearer <token>` a toda request hacia `/admin/*`.
 *
 * Importante: NO se aplica al login (POST /admin/login), porque si no hay
 * token todavía justamente estamos pidiendo uno. La regla "/admin/*" lo cubre
 * igual porque /admin/login también matchea, pero alli el token es null y
 * el `if (token)` lo descarta. Si quisiéramos ser más estrictos, hariamos
 * un check por path. Por ahora la simplicidad gana.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // El interceptor se aplica a TODA request, pero solo agrega header si la URL
  // contiene "/admin/" y hay token disponible.
  if (!req.url.includes('/admin/')) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.getToken();

  if (!token) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authReq);
};
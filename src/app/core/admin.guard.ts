import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * CanActivateFn que protege rutas admin:
 *  - si el token es válido, deja pasar
 *  - si no, redirige a /login (sin más preámbulos)
 *
 * Como CanActivate, se ejecuta antes de activar la ruta. Usar functional
 * guard (no clase) porque Angular 17+ lo prefiere para tree-shaking.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.hasValidToken()) {
    return true;
  }

  // Limpiamos cualquier token vencido que haya quedado en localStorage.
  if (auth.getToken()) {
    auth.logout();
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/calendario/calendario.component').then(
        (m) => m.CalendarioComponent,
      ),
  },
  // Flujo público de reserva: sin guard, accesible sin auth.
  {
    path: 'reservar',
    loadComponent: () =>
      import('./features/reservar/reservar.component').then(
        (m) => m.ReservarComponent,
      ),
  },
  // Cancelación pública: el cliente llega acá desde el link del email.
  // No tiene guard porque cualquiera con un link válido puede cancelar.
  {
    path: 'cancelar',
    loadComponent: () =>
      import('./features/cancelar/cancelar.component').then(
        (m) => m.CancelarComponent,
      ),
  },
  // Landing pública en la ruta raíz. Standalone, sin guard.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  // Cualquier URL no matcheada va al home (no a /reservar).
  { path: '**', redirectTo: '' },
];
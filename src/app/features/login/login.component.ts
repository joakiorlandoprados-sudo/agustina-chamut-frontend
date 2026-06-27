import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  submit(): void {
    if (this.loading()) return;
    this.error.set(null);
    this.loading.set(true);

    this.auth.login(this.email(), this.password()).subscribe({
      next: () => {
        this.loading.set(false);
        const returnUrl =
          this.route.snapshot.queryParamMap.get('returnUrl') ?? '/admin';
        this.router.navigateByUrl(returnUrl);
      },
      error: () => {
        this.loading.set(false);
        // Mensaje genérico: el backend ya devuelve "Credenciales inválidas"
        // sin revelar si fue el email o la password.
        this.error.set('Email o contraseña incorrectos.');
      },
    });
  }
}
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Landing pública en `/`.
 *
 * Standalone, sin guard. Vista scrolleable con 8 secciones:
 *  1. Hero (navbar fijo + grid 2 columnas con headline + foto)
 *  2. Sobre mí (foto + texto)
 *  3. ¿Qué son las constelaciones? (3 cards)
 *  4. ¿Cómo es una sesión? (4 pasos numerados)
 *  5. Preguntas frecuentes (4 accordions <details>)
 *  6. Testimonios (3 cards con comillas decorativas)
 *  7. CTA final (gradiente terra)
 *  8. Footer (logo + redes + copyright)
 *
 * Animaciones de scroll: IntersectionObserver nativo observa cualquier
 * elemento con la clase `.reveal` dentro de la landing. Cuando entra en
 * viewport (threshold 0.15) se le agrega `.visible` y se des-observa
 * (one-shot, no se repite al volver a scrollear). El CSS define los
 * tipos de animación según la clase adicional que tenga cada elemento:
 *   - `.reveal.reveal--title`  → slide desde la izquierda + fade
 *   - `.reveal.reveal--text`   → fade + translateY sutil, con delay
 *   - `.reveal.reveal--card`   → fade + translateY; nth-child hace stagger
 *   - `.reveal.reveal--image`  → slide desde la derecha + fade
 *
 * Si el usuario tiene `prefers-reduced-motion: reduce` o el navegador no
 * soporta IntersectionObserver, todos los `.reveal` se marcan visibles
 * al instante y el contenido nunca queda invisible.
 *
 * Navbar: scroll-listener aplica `.is-scrolled` para volverse opaco.
 * Sin librerías externas — todo CSS puro y Angular standalone.
 *
 * El logo está en `img/agustina-chamut-logo.png` (Angular sirve `public/`
 * como raíz estática sin tocar angular.json).
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  /**
   * Cada `<section>` que debe animarse al entrar al viewport.
   * Marcadas con `data-reveal` en el template (la animación interna se
   * delega a los `.reveal` hijos; las secciones no necesitan animar
   * ellas mismas en este rediseño).
   */
  @ViewChildren('revealSection')
  private revealSections!: QueryList<ElementRef<HTMLElement>>;

  /**
   * Todos los elementos con clase `.reveal` dentro del template.
   * Se observan individualmente para disparar animaciones por tipo
   * (título, texto, card, imagen) con stagger cuando corresponde.
   */
  @ViewChildren('reveal', { read: ElementRef })
  private revealElements!: QueryList<ElementRef<HTMLElement>>;

  @ViewChild('navbar')
  private navbar?: ElementRef<HTMLElement>;

  private observer?: IntersectionObserver;
  private readonly observerThreshold = 0.15;

  ngAfterViewInit(): void {
    // Respeta prefers-reduced-motion y fallback sin IntersectionObserver:
    // marcamos todo como visible al instante para no bloquear contenido.
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      this.markAllRevealed();
      this.syncNavbarOnScroll();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // One-shot: dejamos de observar el elemento en cuanto entra.
            this.observer?.unobserve(entry.target);
          }
        }
      },
      {
        threshold: this.observerThreshold,
        rootMargin: '0px 0px -40px 0px',
      },
    );

    this.revealElements.forEach((el) =>
      this.observer!.observe(el.nativeElement),
    );

    this.syncNavbarOnScroll();
  }

  /**
   * Marca todos los `.reveal` (y secciones) como visibles de inmediato.
   * Se usa en el modo reduced-motion y como fallback.
   */
  private markAllRevealed(): void {
    this.revealElements.forEach((el) =>
      el.nativeElement.classList.add('visible'),
    );
    this.revealSections.forEach((el) =>
      el.nativeElement.classList.add('visible'),
    );
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.syncNavbarOnScroll();
  }

  /**
   * Marca el navbar como `.is-scrolled` cuando se supera un umbral pequeño
   * (24px) para que aparezca el fondo crema con sombra apenas el usuario
   * empieza a bajar. Encima del umbral se quita para que el hero se vea
   * limpio al cargar.
   */
  private syncNavbarOnScroll(): void {
    const nav = this.navbar?.nativeElement;
    if (!nav) return;
    const scrolled = window.scrollY > 24;
    nav.classList.toggle('is-scrolled', scrolled);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

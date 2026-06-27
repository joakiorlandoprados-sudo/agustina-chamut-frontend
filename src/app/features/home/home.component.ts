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
 *  2. Sobre mí (foto placeholder + texto)
 *  3. ¿Qué son las constelaciones? (3 cards)
 *  4. ¿Cómo es una sesión? (4 pasos numerados)
 *  5. Preguntas frecuentes (4 accordions <details>)
 *  6. Testimonios (3 cards con comillas decorativas)
 *  7. CTA final (gradiente terra)
 *  8. Footer (logo + redes + copyright)
 *
 * Animación de entrada: IntersectionObserver marca cada sección con
 * la clase `.visible` para disparar el fadeInUp definido en CSS.
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
   * Marcadas con `data-reveal` en el template.
   */
  @ViewChildren('revealSection')
  private revealSections!: QueryList<ElementRef<HTMLElement>>;

  @ViewChild('navbar')
  private navbar?: ElementRef<HTMLElement>;

  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    // Respeta prefers-reduced-motion: si el usuario lo pide, marcamos
    // todas las secciones como visibles al instante y no observamos nada.
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      this.revealSections.forEach((el) =>
        el.nativeElement.classList.add('visible'),
      );
      this.syncNavbarOnScroll();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.observer?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    this.revealSections.forEach((el) =>
      this.observer!.observe(el.nativeElement),
    );

    this.syncNavbarOnScroll();
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

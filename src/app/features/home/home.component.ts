import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  HostListener,
  OnDestroy,
  QueryList,
  signal,
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
   * Marcadas con `#revealSection` en el template. Las animaciones
   * internas se delegan a los `.reveal` hijos; el hero NO usa
   * este sistema porque su entrada corre al cargar via @keyframes
   * CSS (ver bloque "HERO - Secuencia de entrada" en el CSS).
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

  /**
   * Estado del menú mobile (drawer). `true` solo cuando el usuario
   * tocó la hamburguesa y el drawer está abierto. En desktop nunca
   * llega a `true` porque los listeners de Escape / resize lo cierran
   * apenas se cruza el breakpoint de 768px.
   *
   * Manejo del scroll-lock: un `effect` sincroniza este signal con
   * `document.body.style.overflow`. Guardamos el valor original del
   * body la primera vez que abrimos para restaurarlo exactamente al
   * cerrar (puede haber sido `"hidden"` por otro componente, aunque
   * hoy no es el caso).
   */
  protected readonly isMenuOpen = signal(false);

  private originalBodyOverflow: string | null = null;

  constructor() {
    // Sincroniza scroll-lock con el estado del menú. Se ejecuta en
    // zona Angular, asi que corre dentro del ciclo de deteccion de
    // cambios (no hace falta cleanup manual del effect porque vive
    // lo que vive el component).
    effect(() => {
      const open = this.isMenuOpen();
      if (typeof document === 'undefined') return;
      if (open) {
        if (this.originalBodyOverflow === null) {
          this.originalBodyOverflow = document.body.style.overflow;
        }
        document.body.style.overflow = 'hidden';
      } else if (this.originalBodyOverflow !== null) {
        document.body.style.overflow = this.originalBodyOverflow;
        this.originalBodyOverflow = null;
      }
    });
  }

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
   * Click en el boton hamburguesa. Alterna el estado del drawer.
   * El effect() del constructor se ocupa del scroll-lock.
   */
  protected toggleMenu(): void {
    this.isMenuOpen.update((v) => !v);
  }

  /**
   * Cierra el drawer. Se invoca desde: click en backdrop, click en
   * un link del drawer, Escape, resize por encima de 768px. Es
   * idempotente (si ya esta cerrado, no hace nada visible).
   */
  protected closeMenu(): void {
    if (this.isMenuOpen()) {
      this.isMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  /**
   * Si el usuario rota el telefono o expande DevTools y el viewport
   * pasa a >= 768px con el drawer abierto, lo cerramos para que no
   * quede un menu fantasma invisible en DOM encima de la UI desktop.
   */
  @HostListener('window:resize')
  onResize(): void {
    if (this.isMenuOpen() && window.innerWidth >= 768) {
      this.closeMenu();
    }
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
    // Defensa: si el component se destruye con el drawer abierto
    // (cambio de ruta, hot reload, etc.) restauro el body para no
    // dejar la pagina bloqueada para scrollear.
    if (this.originalBodyOverflow !== null) {
      document.body.style.overflow = this.originalBodyOverflow;
      this.originalBodyOverflow = null;
    }
  }
}

import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

type SlotStatus = 'OPEN' | 'BOOKED' | 'BLOCKED';

interface Booking {
  id: number;
  slotId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  notes: string | null;
}

interface Slot {
  id: number;
  date: string; // ISO "2026-07-15T00:00:00.000Z"
  startTime: string; // "HH:mm"
  endTime: string;
  status: SlotStatus;
  booking: Booking | null;
}

interface SlotsResponse {
  slots: Slot[];
}

/** Una celda del grid mensual. */
interface CalendarCell {
  date: Date; // local midnight del día que representa
  /** YYYY-MM-DD en local (clave para agrupar slots). */
  key: string;
  /** true si pertenece al mes que estamos visualizando. */
  inMonth: boolean;
  /** true si es el día seleccionado actualmente. */
  isSelected: boolean;
  /** true si es "hoy" (en local). */
  isToday: boolean;
  /** Estado de los slots en ese día. */
  indicator: 'none' | 'open' | 'busy';
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

@Component({
  selector: 'app-calendario',
  imports: [FormsModule],
  templateUrl: './calendario.component.html',
  styleUrl: './calendario.component.css',
})
export class CalendarioComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly slots = signal<Slot[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Mes que estamos visualizando en el grid (cualquier día, usamos mes+año). */
  readonly currentMonth = signal<Date>(this.firstOfMonth(new Date()));
  /** Día seleccionado en el panel inferior. Inicializado en HOY. */
  readonly selectedDate = signal<Date>(this.atMidnight(new Date()));

  readonly weekdayLabels = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  // ────────────────────────────────────────────────────────────────────
  // Form state
  // ────────────────────────────────────────────────────────────────────

  readonly formOpen = signal<boolean>(false);
  readonly formMode = signal<'single' | 'generate'>('single');
  readonly formStart = signal<string>('');   // "HH:mm"
  readonly formEnd = signal<string>('');     // "HH:mm"
  readonly formDuration = signal<number>(50);
  readonly formError = signal<string | null>(null);
  readonly formSubmitting = signal<boolean>(false);

  // ────────────────────────────────────────────────────────────────────
  // Computeds
  // ────────────────────────────────────────────────────────────────────

  /** Slots del día seleccionado, ordenados por startTime asc. */
  readonly slotsForSelected = computed<Slot[]>(() => {
    const key = this.dateKey(this.selectedDate());
    return this.slots()
      .filter((s) => s.date.slice(0, 10) === key)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  /** Encabezado del mes: "Julio 2026". */
  readonly monthLabel = computed<string>(() => {
    const d = this.currentMonth();
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  });

  /** Slots agrupados por día (key YYYY-MM-DD) para alimentar el grid. */
  readonly slotsByDay = computed<Map<string, Slot[]>>(() => {
    const map = new Map<string, Slot[]>();
    for (const s of this.slots()) {
      const key = s.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  });

  readonly calendarCells = computed<CalendarCell[]>(() => {
    const month = this.currentMonth();
    const firstOfMonth = this.firstOfMonth(month);
    const firstWeekdayMon0 = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstWeekdayMon0);

    const selectedKey = this.dateKey(this.selectedDate());
    const todayKey = this.dateKey(new Date());
    const byDay = this.slotsByDay();

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const key = this.dateKey(d);
      const daySlots = byDay.get(key) ?? [];
      cells.push({
        date: d,
        key,
        inMonth: d.getMonth() === month.getMonth(),
        isSelected: key === selectedKey,
        isToday: key === todayKey,
        indicator: this.indicatorFor(daySlots),
      });
    }
    return cells;
  });

  // ────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<SlotsResponse>(`${environment.apiUrl}/admin/slots`).subscribe({
      next: (res) => {
        this.slots.set(res.slots);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.status === 401
            ? 'Sesión expirada. Volvé a iniciar sesión.'
            : 'No se pudieron cargar los slots.',
        );
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Acciones del grid
  // ────────────────────────────────────────────────────────────────────

  prevMonth(): void {
    const d = this.currentMonth();
    this.currentMonth.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const d = this.currentMonth();
    this.currentMonth.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  selectDay(cell: CalendarCell): void {
    this.selectedDate.set(this.atMidnight(cell.date));
    // Si el form está abierto, lo cerramos para evitar confusión con un día
    // distinto al que se está creando el slot.
    this.closeForm();
  }

  // ────────────────────────────────────────────────────────────────────
  // Acciones de slots (panel inferior)
  // ────────────────────────────────────────────────────────────────────

  block(slot: Slot): void {
    this.http
      .patch(`${environment.apiUrl}/admin/slots/${slot.id}`, { status: 'BLOCKED' })
      .subscribe({ next: () => this.refresh(), error: () => this.error.set('No se pudo bloquear el slot.') });
  }

  unblock(slot: Slot): void {
    this.http
      .patch(`${environment.apiUrl}/admin/slots/${slot.id}`, { status: 'OPEN' })
      .subscribe({ next: () => this.refresh(), error: () => this.error.set('No se pudo reabrir el slot.') });
  }

  cancelBooking(slot: Slot): void {
    if (!slot.booking) return;
    if (!confirm(`¿Cancelar la reserva de ${slot.booking.clientName}?`)) return;
    this.http
      .delete(`${environment.apiUrl}/admin/bookings/${slot.booking.id}`)
      .subscribe({ next: () => this.refresh(), error: () => this.error.set('No se pudo cancelar la reserva.') });
  }

  // ────────────────────────────────────────────────────────────────────
  // Form: alta de slots
  // ────────────────────────────────────────────────────────────────────

  openForm(): void {
    this.formOpen.set(true);
    this.formMode.set('single');
    this.formStart.set('');
    this.formEnd.set('');
    this.formDuration.set(50);
    this.formError.set(null);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
    this.formSubmitting.set(false);
  }

  /** Toggle del checkbox "Generar varios turnos". */
  onToggleGenerate(checked: boolean): void {
    this.formMode.set(checked ? 'generate' : 'single');
    this.formError.set(null);
  }

  submitForm(): void {
    if (this.formSubmitting()) return;

    // Validación cliente mínima.
    if (!this.formStart() || !this.formEnd()) {
      this.formError.set('Indicá hora de inicio y hora de fin.');
      return;
    }
    if (this.toMinutes(this.formEnd()) <= this.toMinutes(this.formStart())) {
      this.formError.set('La hora de fin tiene que ser posterior a la de inicio.');
      return;
    }
    if (this.formMode() === 'generate' && (!Number.isInteger(this.formDuration()) || this.formDuration() <= 0)) {
      this.formError.set('La duración por turno tiene que ser un entero positivo.');
      return;
    }

    // TZ-safe: la fecha sale de dateKey(selectedDate()) que usa getters LOCALES
    // (getFullYear/getMonth/getDate). NO usamos toISOString() ni nada UTC.
    const date = this.dateKey(this.selectedDate());

    this.formSubmitting.set(true);
    this.formError.set(null);

    const url = this.formMode() === 'generate'
      ? `${environment.apiUrl}/admin/slots/generate`
      : `${environment.apiUrl}/admin/slots`;

    const body = this.formMode() === 'generate'
      ? {
          date,
          rangeStart: this.formStart(),
          rangeEnd: this.formEnd(),
          durationMinutes: this.formDuration(),
        }
      : {
          date,
          startTime: this.formStart(),
          endTime: this.formEnd(),
        };

    this.http.post(url, body).subscribe({
      next: () => {
        this.formSubmitting.set(false);
        this.closeForm();
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.formSubmitting.set(false);
        // Mensaje del backend si está disponible (incluye 409 de overlap
        // y 400 de validación). Fallback genérico.
        const msg = err?.error?.message;
        this.formError.set(typeof msg === 'string' && msg ? msg : 'No se pudo crear el/los turno(s).');
      },
    });
  }

  logout(): void {
    this.auth.logout();
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  /** Etiqueta humana del día seleccionado: "Miércoles 22 de junio". */
  selectedDateLabel(): string {
    const d = this.selectedDate();
    const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return `${weekdays[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
  }

  /**
   * Construye "YYYY-MM-DD" desde un Date usando getters LOCALES.
   * Punto único de verdad para serializar fechas hacia el backend,
   * garantizando que se mande el día que el usuario ve seleccionado
   * y no un día menos por drift de UTC.
   */
  private dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private atMidnight(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private firstOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private indicatorFor(slots: Slot[]): 'none' | 'open' | 'busy' {
    if (slots.length === 0) return 'none';
    return slots.some((s) => s.status === 'OPEN') ? 'open' : 'busy';
  }
}
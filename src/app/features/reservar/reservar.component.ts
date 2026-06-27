import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

type SlotStatus = 'OPEN' | 'BOOKED' | 'BLOCKED';
type Step = 'pick-day' | 'form' | 'done';

interface Slot {
  id: number;
  date: string; // ISO "2026-07-15T00:00:00.000Z"
  startTime: string;
  endTime: string;
  status: SlotStatus;
}

interface SlotsResponse {
  slots: Slot[];
}

interface BookingResponse {
  booking: {
    id: number;
    slotId: number;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    notes: string | null;
  };
}

interface CalendarCell {
  date: Date;
  key: string;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  /** true si la fecha es anterior a hoy (local). Aunque el backend ya filtra
   *  los slots pasados, dejamos al cliente marcar el día como no-clickeable
   *  por si hay slots de "ayer" que llegaron en el margen de medianoche. */
  isPast: boolean;
  /** true si tiene al menos un slot OPEN. */
  hasOpen: boolean;
}

interface ConfirmedBooking {
  slot: Slot;
  clientName: string;
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

@Component({
  selector: 'app-reservar',
  imports: [FormsModule],
  templateUrl: './reservar.component.html',
  styleUrl: './reservar.component.css',
})
export class ReservarComponent implements OnInit {
  private http = inject(HttpClient);

  /** Paso actual del wizard. */
  readonly step = signal<Step>('pick-day');
  readonly businessName = environment.businessName;

  // ─── Datos del backend ────────────────────────────────────────────────
  readonly slots = signal<Slot[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // ─── Calendario ───────────────────────────────────────────────────────
  readonly currentMonth = signal<Date>(this.firstOfMonth(new Date()));
  readonly selectedDate = signal<Date>(this.atMidnight(new Date()));
  readonly weekdayLabels = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  /** Solo los slots OPEN — fuente única para todo lo que ve el cliente. */
  readonly openSlots = computed<Slot[]>(() =>
    this.slots().filter((s) => s.status === 'OPEN'),
  );

  /** OPENs agrupados por día (key YYYY-MM-DD). */
  readonly openSlotsByDay = computed<Map<string, Slot[]>>(() => {
    const map = new Map<string, Slot[]>();
    for (const s of this.openSlots()) {
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
    // Medianoche local de hoy para comparar sin importar la hora del día.
    const todayMidnight = this.atMidnight(new Date());
    const byDay = this.openSlotsByDay();

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const key = this.dateKey(d);
      const dayOpens = byDay.get(key) ?? [];
      const dayMidnight = this.atMidnight(d);
      cells.push({
        date: d,
        key,
        inMonth: d.getMonth() === month.getMonth(),
        isSelected: key === selectedKey,
        isToday: key === todayKey,
        // Comparamos por día local (YYYY-MM-DD) para evitar problemas de TZ.
        // Los días anteriores a hoy se renderizan pero no son clickeables.
        isPast: dayMidnight.getTime() < todayMidnight.getTime(),
        hasOpen: dayOpens.length > 0,
      });
    }
    return cells;
  });

  readonly monthLabel = computed<string>(() => {
    const d = this.currentMonth();
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  });

  /** Slots OPEN del día seleccionado, ordenados por hora. */
  readonly openSlotsForSelected = computed<Slot[]>(() => {
    const key = this.dateKey(this.selectedDate());
    return this.openSlots()
      .filter((s) => s.date.slice(0, 10) === key)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  // ─── Slot elegido (paso 1 → paso 2) ───────────────────────────────────
  readonly selectedSlot = signal<Slot | null>(null);

  // ─── Form del cliente ─────────────────────────────────────────────────
  readonly clientName = signal('');
  readonly clientPhone = signal('');
  readonly clientEmail = signal('');
  readonly notes = signal('');
  readonly formError = signal<string | null>(null);
  readonly formSubmitting = signal(false);

  // ─── Confirmación ─────────────────────────────────────────────────────
  readonly confirmed = signal<ConfirmedBooking | null>(null);

  // ────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<SlotsResponse>(`${environment.apiUrl}/slots`).subscribe({
      next: (res) => {
        this.slots.set(res.slots);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los turnos disponibles.');
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
    if (!cell.hasOpen) return;
    // Defensa adicional: aunque el backend filtra los slots pasados, si llega
    // un día anterior al cargar la grilla no dejamos seleccionarlo.
    if (cell.isPast) return;
    this.selectedDate.set(this.atMidnight(cell.date));
  }

  pickSlot(slot: Slot): void {
    this.selectedSlot.set(slot);
    this.formError.set(null);
    this.step.set('form');
  }

  // ────────────────────────────────────────────────────────────────────
  // Form de reserva
  // ────────────────────────────────────────────────────────────────────

  backToPicker(): void {
    // Mantiene el día seleccionado; solo limpia el slot y el form.
    this.selectedSlot.set(null);
    this.formError.set(null);
    this.formSubmitting.set(false);
    this.step.set('pick-day');
  }

  submitBooking(): void {
    if (this.formSubmitting()) return;

    const slot = this.selectedSlot();
    if (!slot) {
      this.formError.set('No hay un turno seleccionado.');
      return;
    }

    const name = this.clientName().trim();
    const phone = this.clientPhone().trim();
    const email = this.clientEmail().trim();
    const notesVal = this.notes().trim();

    if (!name) {
      this.formError.set('Ingresá tu nombre completo.');
      return;
    }
    if (!phone) {
      this.formError.set('Ingresá tu teléfono.');
      return;
    }
    if (!email) {
      this.formError.set('Ingresá tu email.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.formError.set('El email no parece válido.');
      return;
    }

    this.formSubmitting.set(true);
    this.formError.set(null);

    this.http
      .post<BookingResponse>(`${environment.apiUrl}/bookings`, {
        slotId: slot.id,
        clientName: name,
        clientPhone: phone,
        clientEmail: email,
        notes: notesVal || undefined,
      })
      .subscribe({
        next: () => {
          this.formSubmitting.set(false);
          this.confirmed.set({ slot, clientName: name });
          this.step.set('done');
          // Limpiamos el form por si el usuario quiere reservar otro turno.
          this.clientName.set('');
          this.clientPhone.set('');
          this.clientEmail.set('');
          this.notes.set('');
          this.selectedSlot.set(null);
        },
        error: (err: HttpErrorResponse) => {
          this.formSubmitting.set(false);
          if (err?.status === 409) {
            this.formError.set(
              'Este turno ya fue reservado. Por favor elegí otro.',
            );
            // Vuelve al Paso 1 para que pueda elegir otro.
            this.selectedSlot.set(null);
            this.step.set('pick-day');
            // Refresca la grilla para reflejar el estado real.
            this.refresh();
          } else if (err?.status === 404) {
            this.formError.set('Este turno ya no existe. Elegí otro.');
            this.selectedSlot.set(null);
            this.step.set('pick-day');
            this.refresh();
          } else {
            const msg = err?.error?.message;
            this.formError.set(
              typeof msg === 'string' && msg
                ? msg
                : 'No se pudo confirmar la reserva. Intentá de nuevo.',
            );
          }
        },
      });
  }

  startOver(): void {
    this.confirmed.set(null);
    this.formError.set(null);
    this.step.set('pick-day');
    this.refresh();
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  selectedDateLabel(): string {
    const d = this.selectedDate();
    const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return `${weekdays[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
  }

  /** Etiqueta larga del slot confirmado: "Miércoles 22 de junio, 10:00–10:50 (hora de España - Madrid)". */
  confirmedSlotLabel(): string {
    const c = this.confirmed();
    if (!c) return '';
    // El backend persiste `date` como DATE puro y lo devuelve como
    // "YYYY-MM-DDT00:00:00.000Z". Para no depender de esa convención implícita,
    // derivamos día/mes del string YYYY-MM-DD directamente y construimos un
    // Date en local midnight (consistente con dateKey / slotsForSelected).
    const [y, m, day] = c.slot.date.slice(0, 10).split('-').map(Number);
    const local = new Date(y, m - 1, day);
    const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dateStr = `${weekdays[local.getDay()]} ${local.getDate()} de ${MONTH_NAMES[local.getMonth()]}`;
    return `${dateStr}, ${c.slot.startTime}–${c.slot.endTime} (hora de España - Madrid)`;
  }

  /** URL wa.me prellenada con el texto del cliente. */
  whatsappUrl(): string {
    const c = this.confirmed();
    if (!c) return '#';
    const [y, m, day] = c.slot.date.slice(0, 10).split('-').map(Number);
    const local = new Date(y, m - 1, day);
    const dayNum = local.getDate();
    const monthName = MONTH_NAMES[local.getMonth()];
    const time = c.slot.startTime;
    const text = `Hola ${this.businessName}, reservé el turno del ${dayNum} de ${monthName} a las ${time} (hora de España - Madrid).`;
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }

  /** YYYY-MM-DD en local. */
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
}
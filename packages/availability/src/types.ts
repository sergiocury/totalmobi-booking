import type {
  ScheduleException,
  TimeInterval,
  TimeOff,
  WeeklyHours,
} from '@totalmobi/shared';

/**
 * O que o motor precisa de saber, e nada mais.
 *
 * Nenhum destes tipos menciona Supabase, tabelas ou colunas. Quem carrega os
 * dados é que os traduz — é o que permite testar o motor com milhares de casos
 * gerados sem tocar numa base de dados, e é o que permite mudar o modelo de
 * dados sem reescrever a lógica.
 */

/** O serviço a marcar, já com os overrides do profissional aplicados. */
export interface ServiceSpec {
  readonly durationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  /** Quantas marcações em simultâneo o mesmo profissional aceita. Quase sempre 1. */
  readonly capacity: number;
}

/** As políticas do tenant que afetam a disponibilidade. */
export interface AvailabilityPolicy {
  /** De quanto em quanto tempo se oferece um início. Não é a duração. */
  readonly slotGranularityMinutes: number;
  /** Antecedência mínima. Impede marcar para daqui a dois minutos. */
  readonly minAdvanceMinutes: number;
  /** Até quando se pode marcar. Impede marcar para daqui a três anos. */
  readonly maxAdvanceDays: number;
}

/**
 * Um período já ocupado.
 *
 * `range` é o **blocked_range** da marcação — já com os buffers dela dentro,
 * tal como a base de dados o guarda. O motor não recalcula buffers alheios: usa
 * o mesmo intervalo que a constraint de exclusão usa, senão a disponibilidade
 * mostrada e o que a base de dados aceita divergiriam.
 */
export interface BusyInterval {
  readonly range: TimeInterval;
}

export interface StaffInput {
  readonly staffId: string;
  readonly workingHours: readonly WeeklyHours[];
  readonly timeOff: readonly TimeOff[];
  /** Exceções do próprio profissional, já filtradas para este dia. */
  readonly exceptions?: readonly ScheduleException[];
  readonly busy: readonly BusyInterval[];
}

export interface AvailabilityInput {
  /** `YYYY-MM-DD`, no fuso da unidade. */
  readonly date: string;
  /** IANA, da unidade. */
  readonly timezone: string;
  /** O agora. Explícito de propósito: uma função pura não lê o relógio. */
  readonly now: Date;
  readonly service: ServiceSpec;
  readonly policy: AvailabilityPolicy;
  readonly locationHours: readonly WeeklyHours[];
  /** Exceções da unidade e do tenant, já filtradas para este dia. */
  readonly exceptions: readonly ScheduleException[];
  readonly staff: readonly StaffInput[];
}

export interface Slot {
  /** Início do serviço — o que o cliente vê e o que vai para `start_at`. */
  readonly start: Date;
  /** Fim do serviço, **sem** o buffer de depois. Vai para `end_at`. */
  readonly end: Date;
  /** Quem pode atender. Nunca vazio. */
  readonly staffIds: readonly string[];
}

export type UnavailableReason =
  /**
   * A **unidade** não abre neste dia: horário semanal, feriado ou exceção.
   *
   * Não confundir com `staff_off`. Dizer "fechado" quando a casa está aberta e
   * é a profissional que folga manda o cliente embora por uma razão falsa — e
   * ele podia marcar outro serviço no mesmo dia.
   */
  | 'closed'
  /** A unidade abre, mas ninguém que faça este serviço trabalha neste dia. */
  | 'staff_off'
  /** Há horário, mas está tudo ocupado. */
  | 'fully_booked'
  /** O dia é hoje e já passou a hora, ou está fora da janela de antecedência. */
  | 'outside_advance_window'
  /** O serviço não cabe no horário — 3 h de tratamento num dia que abre 2 h. */
  | 'service_does_not_fit'
  /** Não foi indicado nenhum profissional que preste este serviço. */
  | 'no_staff';

export interface AvailabilityResult {
  readonly slots: readonly Slot[];
  /** Porque é que não há nada, quando não há. `null` quando há slots. */
  readonly reason: UnavailableReason | null;
}

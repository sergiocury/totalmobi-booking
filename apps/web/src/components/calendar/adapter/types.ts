/**
 * O contrato do calendário.
 *
 * Existe para que a escolha da biblioteca seja reversível. Nenhum componente de
 * produto conhece o que está do outro lado — há uma regra de ESLint que faz
 * falhar qualquer `import` de `@fullcalendar/*` fora desta pasta.
 *
 * PORQUE É QUE ISTO NÃO É ABSTRAÇÃO GRATUITA
 *
 * A vista que o balcão usa todos os dias — **uma coluna por profissional** — é
 * `resourceTimeGrid` no FullCalendar, e essa é uma vista **Premium**: 480 USD
 * por lugar de programador, por ano (verificado em fullcalendar.io/pricing a
 * 2026-08-19; o Standard é MIT e não a inclui).
 *
 * Ou seja: a funcionalidade central do calendário estava atrás de uma licença
 * paga desde o primeiro dia. Ter o contrato antes da biblioteca é o que
 * permitiu decidir isso com calma — ver a decisão em `ARCHITECTURE.md`.
 */

export interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  /** Coluna a que pertence. `null` = sem profissional atribuído. */
  resourceId: string | null;
  color?: string | null;
  subtitle?: string | null;
  status: string;
  /** `false` desenha o bloco esbatido: cancelada, não compareceu, remarcada. */
  active: boolean;
}

export interface CalendarResource {
  id: string;
  title: string;
  color?: string | null;
}

export interface CalendarRange {
  /** Minuto do dia em que a grelha começa (ex.: 8 × 60). */
  startMinute: number;
  endMinute: number;
  /** Altura de uma linha, em minutos. */
  stepMinutes: number;
}

/**
 * Dia ou semana.
 *
 * São vistas diferentes, não a mesma com outro zoom: no dia as colunas são
 * profissionais, na semana são dias. Uma semana com uma coluna por profissional
 * por dia seriam trinta e cinco colunas num ecrã — ilegível em qualquer
 * tamanho. Por isso a semana é **de uma profissional de cada vez**.
 */
export type CalendarView = 'dia' | 'semana';

export interface CalendarProps {
  /** No dia, o dia mostrado. Na semana, a segunda-feira. */
  date: string;
  timezone: string;
  events: CalendarEvent[];
  resources: CalendarResource[];
  range: CalendarRange;

  /** `'dia'` por omissão. */
  view?: CalendarView;

  /**
   * As colunas da vista de semana, em `AAAA-MM-DD`.
   *
   * Não são sempre sete. Uma casa que fecha ao domingo não precisa de uma
   * coluna vazia a ocupar um sétimo do ecrã — quem decide é a página, que sabe
   * os dias em que a unidade abre.
   */
  days?: string[];

  /** Clique no espaço vazio: criar. */
  onEmptyClick?: (inicio: Date, resourceId: string | null) => void;
  /** Clique num bloco: abrir. */
  onEventClick?: (id: string) => void;
  /**
   * Arrastar. Devolve `false` para o calendário repor o bloco onde estava —
   * é o que acontece quando a base de dados recusa o destino.
   */
  onEventMove?: (id: string, novoInicio: Date, resourceId: string | null) => Promise<boolean>;
}

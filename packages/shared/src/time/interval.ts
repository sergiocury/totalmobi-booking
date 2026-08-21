/**
 * Aritmética de intervalos de tempo.
 *
 * É a base do motor de disponibilidade (Milestone 7): calcular slots livres é,
 * no fundo, subtrair intervalos ocupados de intervalos possíveis.
 *
 * **Todos os intervalos são semiabertos, `[start, end)`.** Uma marcação das
 * 10:00 às 10:30 e outra das 10:30 às 11:00 não se sobrepõem. É a mesma
 * convenção do `tstzrange(..., '[)')` usado nas constraints da base de dados —
 * e o motivo pelo qual são a mesma: se divergissem, metade da agenda ficaria
 * por preencher ou permitiria conflitos.
 */

export interface TimeInterval {
  readonly start: Date;
  readonly end: Date;
}

export function interval(start: Date, end: Date): TimeInterval {
  return { start, end };
}

export function isValidInterval(i: TimeInterval): boolean {
  return i.end.getTime() > i.start.getTime();
}

export function durationMinutes(i: TimeInterval): number {
  return (i.end.getTime() - i.start.getTime()) / 60_000;
}

/** `[)`: tocar-se nas pontas não é sobrepor-se. */
export function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function contains(outer: TimeInterval, inner: TimeInterval): boolean {
  return (
    outer.start.getTime() <= inner.start.getTime() && outer.end.getTime() >= inner.end.getTime()
  );
}

export function intersect(a: TimeInterval, b: TimeInterval): TimeInterval | null {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end > start ? { start: new Date(start), end: new Date(end) } : null;
}

/** Ordena por início e funde os que se sobrepõem ou se tocam. */
export function mergeIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals]
    .filter(isValidInterval)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (sorted.length === 0) return [];

  const merged: TimeInterval[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    if (current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) {
        merged[merged.length - 1] = { start: last.start, end: current.end };
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Subtrai `blockers` de `base`, devolvendo o que sobra.
 *
 * É a operação central do motor: `base` são as janelas em que se poderia
 * trabalhar; `blockers` são marcações, pausas, férias e bloqueios.
 */
export function subtractIntervals(
  base: readonly TimeInterval[],
  blockers: readonly TimeInterval[],
): TimeInterval[] {
  const merged = mergeIntervals(blockers);

  // As janelas de partida também são fundidas.
  //
  // Se `base` vier com sobreposições — dois turnos que se cruzam, o horário da
  // unidade somado ao do profissional — o resultado teria intervalos livres
  // sobrepostos entre si, e a fatiagem em slots ofereceria a mesma hora duas
  // vezes. Foi um teste de propriedade que apanhou isto; nenhum dos exemplos
  // escritos à mão tinha janelas de partida sobrepostas.
  let remaining = mergeIntervals(base);

  for (const blocker of merged) {
    const next: TimeInterval[] = [];

    for (const window of remaining) {
      if (!overlaps(window, blocker)) {
        next.push(window);
        continue;
      }

      // Sobra à esquerda do bloqueio.
      if (window.start.getTime() < blocker.start.getTime()) {
        next.push({ start: window.start, end: blocker.start });
      }
      // Sobra à direita do bloqueio.
      if (window.end.getTime() > blocker.end.getTime()) {
        next.push({ start: blocker.end, end: window.end });
      }
    }

    remaining = next;
  }

  return remaining.filter(isValidInterval);
}

/**
 * Fatia uma janela em slots de início possíveis.
 *
 * `durationMinutes` é o tempo total que o slot ocupa (serviço + buffers);
 * `stepMinutes` é de quanto em quanto tempo se oferece um início. São coisas
 * diferentes: um serviço de 45 minutos pode ser oferecido de 15 em 15.
 */
export function sliceIntoSlots(
  window: TimeInterval,
  durationMinutes: number,
  stepMinutes: number,
  alignTo?: Date,
): Date[] {
  if (durationMinutes <= 0 || stepMinutes <= 0) return [];

  const stepMs = stepMinutes * 60_000;
  const durationMs = durationMinutes * 60_000;
  const windowEnd = window.end.getTime();

  let cursor = window.start.getTime();

  // Alinhar a uma grelha (ex.: horas certas e meias horas) em vez de começar
  // exatamente no fim da marcação anterior, que daria horas como 10:37.
  if (alignTo) {
    const anchor = alignTo.getTime();
    const offset = (((cursor - anchor) % stepMs) + stepMs) % stepMs;
    if (offset !== 0) cursor += stepMs - offset;
  }

  const starts: Date[] = [];
  while (cursor + durationMs <= windowEnd) {
    starts.push(new Date(cursor));
    cursor += stepMs;
  }

  return starts;
}

/** Filtra instantes fora do intervalo de antecedência permitido. */
export function withinAdvanceWindow(
  starts: readonly Date[],
  now: Date,
  minAdvanceMinutes: number,
  maxAdvanceDays: number,
): Date[] {
  const earliest = now.getTime() + minAdvanceMinutes * 60_000;
  const latest = now.getTime() + maxAdvanceDays * 86_400_000;
  return starts.filter((s) => s.getTime() >= earliest && s.getTime() <= latest);
}

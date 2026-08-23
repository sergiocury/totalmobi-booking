import { DateTime } from 'luxon';

import { instantToWallClock, wallClockToInstantLenient } from './zone';

/**
 * As contas que uma grelha de calendário precisa.
 *
 * PORQUE É QUE ISTO VIVE AQUI E NÃO NA APP
 *
 * Nasceu em `apps/web/src/components/calendar/adapter/tempo.ts`, com a
 * aritmética de fusos feita à mão: `Intl.DateTimeFormat` e duas passagens de
 * correção do desvio. Funcionava — e era uma segunda implementação da mesma
 * coisa que o `zone.ts` já fazia com o Luxon, ao lado.
 *
 * Duas implementações da mesma correção de horário de verão divergem, e a que
 * se estraga primeiro só dá sinal duas vezes por ano. Por isso estas funções
 * passaram a ser uma casca fina sobre `wallClockToInstantLenient` e
 * `instantToWallClock`, que já estão testados.
 *
 * Há uma segunda razão, prática: um ficheiro de teste dentro de `apps/web`
 * quebra a publicação. O Next verifica os tipos de todos os `.ts` da app, e a
 * Vercel instala de **dentro** de `apps/web` — onde o `vitest` não existe,
 * porque só está declarado na raiz. O `next build` morria com
 * `Cannot find module 'vitest'`. Aqui, no `packages`, o problema não se põe.
 *
 * TUDO TRABALHA EM MINUTOS LOCAIS
 *
 * Um bloco desenha-se onde a parede diz, não onde o UTC diz. Às 10:00 de
 * Lisboa a marcação está no sítio das 10:00, quer o desvio do fuso seja +0 ou
 * +1 nesse dia.
 */

/** Minutos desde a meia-noite **local do fuso da unidade**. */
export function minutosDoDia(instant: Date, timezone: string): number {
  const { time } = instantToWallClock(instant, timezone);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * O dia local, em `AAAA-MM-DD`.
 *
 * É isto que decide em que coluna da semana um bloco cai. Comparar
 * `toISOString().slice(0,10)` daria o dia em UTC — e uma marcação às 00:30 de
 * Lisboa em agosto apareceria na coluna do dia anterior.
 */
export function diaLocal(instant: Date, timezone: string): string {
  return instantToWallClock(instant, timezone).date;
}

/** `540` → `"09:00"`. */
export function etiquetaHora(minuto: number): string {
  const hh = String(Math.floor(minuto / 60)).padStart(2, '0');
  const mm = String(minuto % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * O instante correspondente a um minuto local de um dia.
 *
 * A madrugada em que o relógio salta trata-se como em todo o resto do sistema:
 * na hora ambígua escolhe-se a primeira, na hora que não existe o instante
 * válido seguinte. Uma agenda coerente vale mais do que um erro.
 */
export function instanteDe(date: string, minuto: number, timezone: string): Date {
  return wallClockToInstantLenient({ date, time: etiquetaHora(minuto) }, timezone);
}

/**
 * A segunda-feira da semana a que um dia pertence.
 *
 * Segunda e não domingo: em Portugal a semana de trabalho começa à segunda, e
 * uma agenda que corta o fim de semana ao meio separa o sábado do domingo em
 * duas vistas diferentes. É também o que a norma ISO diz, e é por isso que o
 * `startOf('week')` do Luxon faz exatamente isto sem configuração.
 */
export function segundaFeiraDe(date: string): string {
  return DateTime.fromISO(date, { zone: 'utc' }).startOf('week').toFormat('yyyy-MM-dd');
}

/** Os `n` dias a partir de `inicio`, em `AAAA-MM-DD`. */
export function diasDesde(inicio: string, n: number): string[] {
  const base = DateTime.fromISO(inicio, { zone: 'utc' });
  return Array.from({ length: n }, (_, i) => base.plus({ days: i }).toFormat('yyyy-MM-dd'));
}

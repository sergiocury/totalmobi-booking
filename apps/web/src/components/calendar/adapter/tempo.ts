/**
 * A matemática do calendário.
 *
 * Vive à parte porque a grelha do dia e a da semana precisam exatamente das
 * mesmas contas. Duplicá-las seria pedir que divergissem — e a que se estraga
 * primeiro é sempre a do horário de verão, que só se nota duas vezes por ano.
 *
 * TUDO AQUI TRABALHA EM MINUTOS LOCAIS
 *
 * Um bloco desenha-se onde a parede diz, não onde o UTC diz. Às 10:00 de
 * Lisboa a marcação está no sítio das 10:00, quer o desvio do fuso seja +0 ou
 * +1 nesse dia. É por isso que nada aqui usa `getHours()`: esse devolve a hora
 * do computador de quem está a olhar, que pode estar noutro continente.
 */

/** Altura de um minuto, em píxeis. */
export const PX_POR_MINUTO = 1.4;

/** Minutos desde a meia-noite **local do fuso da unidade**. */
export function minutosDoDia(d: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/**
 * O dia local, em `AAAA-MM-DD`.
 *
 * É isto que decide em que coluna da semana um bloco cai. Comparar
 * `toISOString().slice(0,10)` daria o dia em UTC — e uma marcação às 00:30 de
 * Lisboa em agosto apareceria na coluna do dia anterior.
 */
export function diaLocal(d: Date, timezone: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

export function etiquetaHora(minuto: number): string {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
}

/**
 * O instante correspondente a um minuto local de um dia.
 *
 * Duas passagens de correção em vez de uma biblioteca de fusos: parte-se de um
 * palpite lido como UTC e desconta-se o desvio que o fuso mostra. A segunda
 * passagem existe para o dia em que o relógio salta — aí a primeira correção
 * pode aterrar do outro lado do salto.
 */
export function instanteDe(date: string, minuto: number, timezone: string): Date {
  const hh = String(Math.floor(minuto / 60)).padStart(2, '0');
  const mm = String(minuto % 60).padStart(2, '0');

  let palpite = new Date(`${date}T${hh}:${mm}:00Z`);
  for (let i = 0; i < 2; i += 1) {
    const desvio = minutosDoDia(palpite, timezone) - minuto;
    if (desvio === 0) break;
    palpite = new Date(palpite.getTime() - desvio * 60_000);
  }
  return palpite;
}

/**
 * A segunda-feira da semana a que um dia pertence.
 *
 * Segunda e não domingo: em Portugal a semana de trabalho começa à segunda, e
 * uma agenda que corta o fim de semana ao meio separa o sábado do domingo em
 * duas vistas diferentes.
 *
 * As contas fazem-se ao meio-dia UTC de propósito — à meia-noite, um dia com
 * mudança de hora pode recuar para o dia anterior.
 */
export function segundaFeiraDe(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const diaDaSemana = d.getUTCDay(); // 0 = domingo
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

/** Os `n` dias a partir de `inicio`, em `AAAA-MM-DD`. */
export function diasDesde(inicio: string, n: number): string[] {
  const dias: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(`${inicio}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

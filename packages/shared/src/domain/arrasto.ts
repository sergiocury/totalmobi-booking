/**
 * Um clique não é um arrasto.
 *
 * O DEFEITO QUE ISTO CORRIGE
 *
 * As grelhas da agenda marcavam o arrasto no `pointerdown` e largavam no
 * `pointerup`. Sem limiar de movimento, **um clique parado era um arrasto de
 * zero pixéis**: carregar numa marcação para a abrir movia-a para o minuto onde
 * o rato estivesse, e a coluna do `pointerup` decidia o dia.
 *
 * Aconteceu três vezes em produção a 30 de agosto de 2026, sempre com quem
 * julgava estar apenas a clicar:
 *
 *   13:19:48  movida  08:30 → 08:45
 *   13:19:55  movida  08:45 → 09:00
 *   13:21:28  movida  domingo 16:45 → segunda 17:00
 *
 * Uma marcação movida sem ninguém dar por isso é o pior erro que uma agenda
 * pode ter: não há mensagem, não há aviso, e quem aparece à hora certa é o
 * cliente.
 *
 * A regra vive aqui, e não no hook, porque em `apps/web` os testes deste
 * repositório não chegam — e um limiar sem teste volta a desaparecer na
 * próxima vez que alguém mexer no arrasto.
 */

/**
 * Seis pixéis.
 *
 * É a distância abaixo da qual o movimento é tremor da mão, não intenção. Os
 * gestores de arrasto dos sistemas operativos usam valores desta ordem, e num
 * ecrã tátil o dedo raramente fica dentro de seis pixéis sem ser um toque.
 *
 * Mais baixo volta a apanhar cliques; muito mais alto obriga a puxar antes de o
 * bloco reagir, e o arrasto parece partido.
 */
export const LIMIAR_ARRASTO_PX = 6;

export interface Ponto {
  readonly clientX: number;
  readonly clientY: number;
}

export function ultrapassouLimiar(origem: Ponto, atual: Ponto): boolean {
  const dx = atual.clientX - origem.clientX;
  const dy = atual.clientY - origem.clientY;

  return Math.hypot(dx, dy) >= LIMIAR_ARRASTO_PX;
}

import {
  descreverPreferencia,
  filtrarPorPreferencia,
  type HoraOferecida,
  type Preferencia,
} from './preferencia-horaria';

/**
 * Procurar para além do dia pedido.
 *
 * O DEFEITO QUE ISTO CORRIGE
 *
 * Os três adaptadores pediam `from: data, to: data` — **um único dia**. Quando
 * esse dia não tinha nada, a resposta era "Não tenho horas disponíveis nesse
 * dia. Quer tentar outro?", e não havia forma nenhuma de responder à pergunta
 * seguinte, que é sempre a mesma: *"então quando tem?"*.
 *
 * Pior: a conversa entrava em ciclo. Sem data nova na mensagem, o contexto
 * mantinha o mesmo dia, a procura repetia-se igual, e a mesma frase saía outra
 * vez — três, quatro vezes seguidas. Quem está do outro lado conclui, com
 * razão, que ninguém está a ouvir.
 *
 * Nenhum modelo de linguagem resolveria isto. A informação não estava a ser
 * mal interpretada: **nunca tinha sido pedida à base de dados.**
 *
 * PORQUE É QUE SÃO DUAS PASSAGENS E NÃO UMA
 *
 * Quem pede "terça à tarde" e não tem nada terça à tarde prefere quinta à
 * tarde a terça de manhã. Uma única passagem que aceitasse o primeiro dia com
 * qualquer hora daria sempre a manhã do dia seguinte — cumpria a letra do
 * pedido e falhava a intenção.
 *
 * Por isso procura-se primeiro um dia que **cumpra** a preferência, e só se não
 * houver nenhum se aceita relaxá-la. O `relaxado` viaja na resposta para que
 * quem escreve a frase possa dizer que não conseguiu — ver `descreverPreferencia`.
 */

export interface DiaComHoras {
  /** `YYYY-MM-DD`. */
  readonly data: string;
  readonly horas: readonly HoraOferecida[];
}

export interface HorasEncontradas {
  /** O dia escolhido, ou `null` se nenhum tinha horas. */
  readonly data: string | null;
  readonly horas: HoraOferecida[];
  /** O dia devolvido não é o que a pessoa pediu. */
  readonly procurouAdiante: boolean;
  /** Havia horas, mas nenhuma no período pedido. */
  readonly relaxado: boolean;
}

const VAZIO: HorasEncontradas = {
  data: null,
  horas: [],
  procurouAdiante: false,
  relaxado: false,
};

export function primeiroDiaComHoras(
  dias: readonly DiaComHoras[],
  preferencia: Preferencia,
): HorasEncontradas {
  const pedido = dias[0]?.data;
  if (pedido === undefined) return VAZIO;

  // Primeira passagem: um dia que cumpra mesmo o que foi pedido.
  for (const dia of dias) {
    if (dia.horas.length === 0) continue;

    const filtrado = filtrarPorPreferencia(dia.horas, preferencia);
    if (filtrado.relaxado) continue;

    return {
      data: dia.data,
      horas: filtrado.horas,
      procurouAdiante: dia.data !== pedido,
      relaxado: false,
    };
  }

  // Segunda: já não há como cumprir, mas há horas — e dizer isso é melhor do
  // que dizer que não há nada.
  for (const dia of dias) {
    if (dia.horas.length === 0) continue;

    return {
      data: dia.data,
      horas: [...dia.horas],
      procurouAdiante: dia.data !== pedido,
      relaxado: true,
    };
  }

  return VAZIO;
}

/**
 * Os dias de um intervalo, inclusive nas duas pontas.
 *
 * Aritmética em UTC de propósito. Estas datas são etiquetas de calendário
 * — "2026-09-04" —, não instantes: somar 24 horas a uma data local no dia da
 * mudança da hora dá o mesmo dia outra vez, ou salta um.
 */
export function diasDoIntervalo(inicio: string, quantidade: number): string[] {
  const base = new Date(`${inicio}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime()) || quantidade < 1) return [];

  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/**
 * O dia em português corrente, para entrar numa frase.
 *
 * "quinta-feira, 4 de setembro" — sem ano, porque o horizonte da procura é de
 * poucos dias e o ano só acrescenta ruído. Quem lê quer saber se é esta semana.
 */
export function nomeDoDia(data: string, hoje: string): string {
  if (data === hoje) return 'hoje';

  const d = new Date(`${data}T00:00:00.000Z`);
  const amanha = new Date(`${hoje}T00:00:00.000Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);

  if (data === amanha.toISOString().slice(0, 10)) return 'amanhã';

  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

/** Quantas horas se oferecem de uma vez. Mais do que isto ninguém lê. */
const HORAS_POR_RESPOSTA = 5;

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * A resposta em palavras — uma só vez, para os três canais.
 *
 * O texto **nunca** contém horas que não venham do motor: recebe-as como
 * argumento, e por isso não há como inventar disponibilidade aqui dentro. É a
 * mesma regra do `frasearSlots`, que isto substitui quando a procura passa a
 * ser de vários dias.
 *
 * As quatro frases são quatro situações diferentes, e vale a pena distingui-las:
 * dizer "não tenho nesse dia" quando se encontrou noutro é uma meia-verdade que
 * obriga a pessoa a perguntar outra vez — que foi exatamente o ciclo que se viu
 * em produção.
 */
export function frasearProcura(
  encontrado: HorasEncontradas,
  servico: string,
  preferencia: Preferencia,
  hoje: string,
): { texto: string; opcoes: string[] } {
  if (encontrado.data === null || encontrado.horas.length === 0) {
    return {
      texto: 'Não encontrei horas livres nos próximos dias. Quer que alguém da equipa lhe ligue?',
      opcoes: ['Falar com alguém'],
    };
  }

  const primeiros = encontrado.horas.slice(0, HORAS_POR_RESPOSTA);
  const lista = primeiros.map((s) => s.hora).join(', ');
  const opcoes = primeiros.map((s) => s.hora);
  const quando = comMaiuscula(nomeDoDia(encontrado.data, hoje));
  const pedido = encontrado.relaxado ? descreverPreferencia(preferencia) : null;

  /*
   * O dia vem sempre, e vem primeiro.
   *
   * Dizia-se o dia só quando a procura tinha avançado. No dia pedido a frase
   * era "Para implante, tenho: 09:00, 09:15…" — e quem tinha escolhido "amanhã"
   * três mensagens antes lia aquilo como sendo hoje. Aconteceu em produção a 30
   * de agosto de 2026: a marcação ficou certa, e a pessoa saiu convencida de
   * que era noutro dia.
   *
   * Num assistente de marcações, a hora sem o dia é meia informação — e a
   * metade que falta é a que faz alguém aparecer no dia errado.
   */
  const prefixo = pedido
    ? `Não tenho nada ${pedido} ${encontrado.procurouAdiante ? 'nos próximos dias' : 'nesse dia'}. `
    : encontrado.procurouAdiante
      ? 'Nesse dia não tenho. '
      : '';

  return {
    texto: `${prefixo}${quando}, para ${servico} tenho: ${lista}. Qual prefere?`,
    opcoes,
  };
}

import type { Periodo } from "./intent";

/**
 * Filtrar as horas pelo que a pessoa pediu.
 *
 * O DEFEITO QUE ISTO CORRIGE
 *
 * O extrator já percebia "à tarde" e "depois das 15" — punha-os no contexto,
 * corretamente, desde sempre. E depois **ninguém os usava**: os três
 * adaptadores (página pública, WhatsApp, simulador) pegavam nas horas todas e
 * mostravam as cinco primeiras, que num horário que abre às nove são sempre as
 * da manhã.
 *
 * Alguém que escrevia "segunda 31 à tarde" recebia 09:00, 09:15, 09:30. O
 * assistente ouviu, guardou, e respondeu como se não tivesse ouvido — que é
 * pior do que não perceber, porque parece desatenção em vez de limitação.
 *
 * QUANDO NÃO HÁ NADA NO PERÍODO PEDIDO, NÃO SE FINGE QUE NÃO SE OUVIU
 *
 * A tentação é devolver lista vazia e dizer "não tenho nada nesse dia" — o que
 * é mentira, há de manhã — ou devolver tudo, que é o defeito de origem.
 *
 * Devolve-se tudo **e diz-se que se relaxou**. O adaptador usa isso para
 * escrever "não tenho de tarde, mas de manhã tenho", que é o que uma pessoa ao
 * balcão diria. A informação de que o pedido não pôde ser cumprido não se
 * perde: viaja no `relaxado`.
 */

export interface Preferencia {
  /**
   * Texto solto, e nao o tipo `Periodo`, de proposito.
   *
   * O contexto da conversa vem de uma coluna `jsonb` e pode conter o que la
   * tiver sido gravado — incluindo um valor de uma versao anterior do extrator.
   * Validar aqui dentro e melhor do que obrigar cada chamador a converter, que
   * e a forma de acabar com tres conversoes ligeiramente diferentes.
   *
   * Um periodo desconhecido e ignorado, nao rejeitado: mais vale mostrar as
   * horas todas do que nao mostrar nenhumas.
   */
  periodo?: string | null | undefined;
  /** `HH:MM`. "depois das 15" → `15:00`. */
  horaMinima?: string | null | undefined;
  /** `HH:MM`. "antes das 12" → `12:00`. */
  horaMaxima?: string | null | undefined;
}

export interface HoraOferecida {
  iso: string;
  /** `HH:MM` no fuso da unidade — é por aqui que se compara. */
  hora: string;
}

/**
 * As fronteiras dos períodos, em horas.
 *
 * Meio-dia e as seis da tarde são convenções, não verdades — mas têm de estar
 * escritas num sítio só. "Tarde" a começar às 12h inclui o almoço, que é o que
 * as pessoas querem dizer quando pedem "depois de almoço".
 */
const JANELAS: Record<Periodo, { de: number; ate: number }> = {
  manha: { de: 0, ate: 12 },
  tarde: { de: 12, ate: 18 },
  noite: { de: 18, ate: 24 },
};

function ehPeriodo(v: string | null | undefined): v is Periodo {
  return v === "manha" || v === "tarde" || v === "noite";
}

function horaEmMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

export function filtrarPorPreferencia<T extends HoraOferecida>(
  horas: readonly T[],
  preferencia: Preferencia,
): { horas: T[]; relaxado: boolean } {
  const janela = ehPeriodo(preferencia.periodo)
    ? JANELAS[preferencia.periodo]
    : null;
  const minimo = preferencia.horaMinima
    ? horaEmMinutos(preferencia.horaMinima)
    : null;
  const maximo = preferencia.horaMaxima
    ? horaEmMinutos(preferencia.horaMaxima)
    : null;

  if (!janela && minimo === null && maximo === null) {
    return { horas: [...horas], relaxado: false };
  }

  /*
   * "às 15" não é um intervalo.
   *
   * O `extrairLimitesDeHora` codifica uma hora exata como mínimo e máximo
   * iguais. Tratada como intervalo com máximo exclusivo, essa preferência não
   * deixaria passar hora nenhuma — nem sequer as 15:00 — e a resposta a um
   * pedido exato seria a lista toda, marcada como relaxada. O pior dos
   * resultados: parece que não se ouviu, outra vez.
   */
  const horaExata = minimo !== null && minimo === maximo;

  const filtradas = horas.filter((h) => {
    const minutos = horaEmMinutos(h.hora);

    if (horaExata) return minutos === minimo;

    if (janela && (minutos < janela.de * 60 || minutos >= janela.ate * 60))
      return false;
    if (minimo !== null && minutos < minimo) return false;
    // Exclusivo: quem pede "antes das 12" não quer começar ao meio-dia.
    if (maximo !== null && minutos >= maximo) return false;

    return true;
  });

  // Nada no que foi pedido: devolve-se tudo, assinalado. Ver a nota no topo.
  return filtradas.length > 0
    ? { horas: filtradas, relaxado: false }
    : { horas: [...horas], relaxado: horas.length > 0 };
}

/**
 * Como se chama o período em português corrente, para entrar numa frase.
 *
 * Devolve `null` para o que não reconhece — quem chama usa isso para não
 * escrever uma frase sobre um período que não sabe nomear.
 */
export function nomeDoPeriodo(
  periodo: string | null | undefined,
): string | null {
  if (!ehPeriodo(periodo)) return null;
  return periodo === "manha"
    ? "de manhã"
    : periodo === "tarde"
      ? "de tarde"
      : "à noite";
}

/**
 * O pedido inteiro em palavras, para entrar em "Não tenho nada ___ nesse dia".
 *
 * PORQUE É QUE O `nomeDoPeriodo` NÃO CHEGAVA
 *
 * Os adaptadores explicavam o relaxamento só quando havia **período**. Quem
 * escrevia "depois das 15" e não tinha nada depois das 15 recebia as horas da
 * manhã sem uma palavra de explicação — o mesmo silêncio que o `relaxado` foi
 * criado para acabar, escondido num caminho que ninguém tinha testado.
 *
 * Devolve `null` quando não houve pedido nenhum. Aí não há nada a explicar, e
 * quem chama não escreve a frase.
 */
export function descreverPreferencia(preferencia: Preferencia): string | null {
  const periodo = nomeDoPeriodo(preferencia.periodo);
  const minima = preferencia.horaMinima;
  const maxima = preferencia.horaMaxima;

  // Hora exata — a mesma convenção do filtro. Ver a nota lá.
  if (minima && minima === maxima) return `às ${minima}`;

  const limites =
    minima && maxima
      ? `entre as ${minima} e as ${maxima}`
      : minima
        ? `depois das ${minima}`
        : maxima
          ? `antes das ${maxima}`
          : null;

  if (periodo && limites) return `${periodo} ${limites}`;
  return periodo ?? limites;
}

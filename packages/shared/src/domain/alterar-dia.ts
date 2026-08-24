/**
 * Exprimir "neste dia é assim" sem mexer na precedência do motor.
 *
 * O PROBLEMA
 *
 * Uma clínica que marca com muita antecedência precisa de dizer "a Ana faz o
 * horário normal, mas na quinta-feira 11 sai às 16h". Não há um tipo de exceção
 * que **substitua** o horário de um dia: só há `closed`, que remove, e `open`,
 * que acrescenta.
 *
 * A tentação era fazer o `closed` de dia inteiro deixar de ganhar a tudo, para
 * poder escrever "fecha o dia + abre das 9 às 16". Não se fez, e a razão está
 * documentada em `DATABASE.md`: **`closed` ganha sempre**, para que uma
 * abertura especial esquecida não abra a clínica num feriado. É uma regra de
 * segurança e não se troca por conveniência de escrita.
 *
 * A SOLUÇÃO
 *
 * Escreve-se a **diferença**. Quem edita vê horas; o que se grava são os fechos
 * e as aberturas que transformam o horário base no horário desejado:
 *
 *     desejado = base − fechos + aberturas
 *
 * Base 08:00–20:00, desejado 09:00–16:00
 *   → fechos 08:00–09:00 e 16:00–20:00
 *
 * Base 09:00–18:00, desejado 08:00–20:00
 *   → aberturas 08:00–09:00 e 18:00–20:00
 *
 * Desejado vazio
 *   → um `closed` de dia inteiro, que é uma linha só e diz exatamente isso
 *
 * A RESSALVA, DITA EM VOZ ALTA
 *
 * Os fechos são calculados contra o horário base **do momento em que se
 * edita**. Se o padrão semanal mudar depois, os fechos continuam a dizer o que
 * diziam — "das 8 às 9 não trabalha" — e podem deixar de fazer sentido. É o
 * preço de não ter um tipo `replace` na base de dados, e é o motivo pelo qual a
 * interface deve mostrar o que vai gravar antes de gravar.
 *
 * As horas são `HH:mm` e comparam-se como texto. Não é preguiça: é a mesma
 * escolha do resto do módulo, e é o que faz a aritmética continuar certa nos
 * dois dias do ano em que o relógio salta.
 */

export interface PeriodoLocal {
  /** `HH:mm` na hora local da unidade. */
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface AlteracaoDoDia {
  /** Um `closed` sem horas: o dia inteiro. Quando isto é `true`, o resto é vazio. */
  readonly fecharDiaInteiro: boolean;
  /** Exceções `closed` com horas. */
  readonly fechar: PeriodoLocal[];
  /** Exceções `open`. */
  readonly abrir: PeriodoLocal[];
}

/** Junta períodos que se tocam ou sobrepõem, e ordena-os. */
export function juntarPeriodos(periodos: readonly PeriodoLocal[]): PeriodoLocal[] {
  const validos = periodos.filter((p) => p.startsAt < p.endsAt);
  if (validos.length === 0) return [];

  const ordenados = [...validos].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const saida: PeriodoLocal[] = [{ ...ordenados[0]! }];

  for (const p of ordenados.slice(1)) {
    const ultimo = saida[saida.length - 1]!;
    if (p.startsAt <= ultimo.endsAt) {
      // Tocam-se ou sobrepõem-se: estende-se o último em vez de criar outro.
      if (p.endsAt > ultimo.endsAt) saida[saida.length - 1] = { ...ultimo, endsAt: p.endsAt };
    } else {
      saida.push({ ...p });
    }
  }

  return saida;
}

/** `a` menos `b`, em hora local. */
export function subtrairPeriodos(
  a: readonly PeriodoLocal[],
  b: readonly PeriodoLocal[],
): PeriodoLocal[] {
  const buracos = juntarPeriodos(b);
  let restante = juntarPeriodos(a);

  for (const buraco of buracos) {
    const proximo: PeriodoLocal[] = [];

    for (const p of restante) {
      // Sem interseção: passa intacto.
      if (buraco.endsAt <= p.startsAt || buraco.startsAt >= p.endsAt) {
        proximo.push(p);
        continue;
      }
      // O que sobra à esquerda e à direita do buraco. Qualquer um pode ser
      // vazio — é o caso de o buraco apanhar uma das pontas.
      if (p.startsAt < buraco.startsAt) {
        proximo.push({ startsAt: p.startsAt, endsAt: buraco.startsAt });
      }
      if (buraco.endsAt < p.endsAt) {
        proximo.push({ startsAt: buraco.endsAt, endsAt: p.endsAt });
      }
    }

    restante = proximo;
  }

  return restante;
}

/**
 * O que gravar para que um dia passe a ter o horário desejado.
 *
 * Devolve sempre a alteração **mínima**: se o desejado já for igual ao base,
 * vem tudo vazio e a interface pode dizer "não há nada a mudar" em vez de
 * gravar duas linhas que não fazem diferença nenhuma.
 */
export function alteracaoDoDia(
  base: readonly PeriodoLocal[],
  desejado: readonly PeriodoLocal[],
): AlteracaoDoDia {
  const desejadoLimpo = juntarPeriodos(desejado);

  // Não trabalhar é uma afirmação simples e merece uma linha simples. Escrever
  // fechos parciais que por acaso cobrem tudo diria a mesma coisa de forma
  // frágil: bastava o padrão base crescer para o dia reabrir sozinho.
  if (desejadoLimpo.length === 0) {
    return { fecharDiaInteiro: true, fechar: [], abrir: [] };
  }

  const baseLimpa = juntarPeriodos(base);

  return {
    fecharDiaInteiro: false,
    fechar: subtrairPeriodos(baseLimpa, desejadoLimpo),
    abrir: subtrairPeriodos(desejadoLimpo, baseLimpa),
  };
}

/** Houve alteração nenhuma? */
export function semAlteracao(a: AlteracaoDoDia): boolean {
  return !a.fecharDiaInteiro && a.fechar.length === 0 && a.abrir.length === 0;
}

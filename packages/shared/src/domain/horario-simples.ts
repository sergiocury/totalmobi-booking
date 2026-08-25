/**
 * O horário de abertura na sua forma mais simples: dias iguais, uma janela.
 *
 * É o que o assistente de configuração pergunta — «de segunda a sexta, das 9h
 * às 18h» — e não substitui a página de horários, que trata de almoços, folgas,
 * exceções e horários diferentes por pessoa. Serve para abrir a agenda no
 * primeiro dia.
 *
 * Está aqui, e não dentro da ação de servidor, porque é a única parte do
 * assistente com regras próprias. Uma ação de servidor precisa de sessão e de
 * base de dados para correr; isto precisa de dois textos e uma lista, e por isso
 * pode ter testes.
 */

export interface JanelaSemanal {
  /** Dias da semana, 0 = domingo, como em JavaScript e na coluna `weekday`. */
  dias: number[];
  /** `HH:MM`, 24 horas. */
  abre: string;
  fecha: string;
}

export type ResultadoDaJanela = { ok: JanelaSemanal } | { erro: string };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Valida uma janela semanal.
 *
 * A comparação das horas é textual, e isso é de propósito: em `HH:MM` com zero
 * à esquerda, a ordem alfabética e a ordem cronológica são a mesma — `"09:00" <
 * "18:00"` é verdade, e `"09:00" < "10:00"` também. Converter para minutos daria
 * o mesmo resultado com mais código. O que sustenta isto é o `HORA` acima, que
 * recusa `9:00` sem o zero; sem essa guarda, a comparação textual mentiria.
 */
export function janelaSemanal(entrada: {
  dias: number[];
  abre: string;
  fecha: string;
}): ResultadoDaJanela {
  if (!HORA.test(entrada.abre) || !HORA.test(entrada.fecha)) {
    return { erro: 'Horas inválidas. Use o formato 09:00.' };
  }

  if (entrada.abre >= entrada.fecha) {
    return { erro: 'A hora de fecho tem de ser depois da de abertura.' };
  }

  const dias = [...new Set(entrada.dias)].sort((a, b) => a - b);

  if (dias.length === 0) {
    return { erro: 'Escolha pelo menos um dia da semana.' };
  }

  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { erro: 'Dia da semana inválido.' };
  }

  return { ok: { dias, abre: entrada.abre, fecha: entrada.fecha } };
}

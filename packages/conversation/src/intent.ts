import { z } from 'zod';

/**
 * O que uma mensagem quer dizer.
 *
 * **Este schema é uma fronteira de segurança, não uma conveniência de tipos.**
 *
 * A saída do LLM é validada contra ele antes de tocar em seja o que for. Campos
 * a mais são descartados; um `intent` que não esteja na lista cai em
 * `desconhecido` e o bot pergunta. Uma injeção que consiga fazer o modelo
 * responder `{"intent":"apagar_tudo"}` produz exatamente nada.
 *
 * OS IDENTIFICADORES SÃO NOMES, NUNCA UUIDs
 *
 * O modelo devolve `"Dra. Ana"`, não `"93f6df79-…"`. Quem resolve o nome é o
 * motor da conversa, contra o catálogo **daquele tenant** — e um nome de outra
 * empresa não resolve para nada.
 *
 * Se o modelo devolvesse ids, uma injeção bem construída podia fazê-lo cuspir
 * o id de um profissional de outra clínica. Com nomes, o pior que consegue é
 * pedir alguém que não existe ali.
 */

export const INTENCOES = [
  'marcar',
  'cancelar',
  'remarcar',
  'confirmar',
  'consultar_marcacao',
  'precos',
  'horarios',
  'morada',
  'falar_humano',
  'saudacao',
  'agradecimento',
  'desconhecido',
] as const;

export type Intencao = (typeof INTENCOES)[number];

export const PERIODOS = ['manha', 'tarde', 'noite'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const intencaoSchema = z.object({
  intent: z.enum(INTENCOES),

  /** Nome do serviço tal como a pessoa o disse. Nunca um id. */
  servico: z.string().max(80).nullable().default(null),
  /** Nome do profissional tal como a pessoa o disse. Nunca um id. */
  profissional: z.string().max(80).nullable().default(null),

  /** `YYYY-MM-DD`, já resolvido a partir de "amanhã", "sexta", etc. */
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),

  periodo: z.enum(PERIODOS).nullable().default(null),
  /** `HH:mm` — "depois das 15" dá `15:00`. */
  horaMinima: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  horaMaxima: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),

  /** "o primeiro que houver". */
  primeiroDisponivel: z.boolean().default(false),

  /**
   * Quanto o extrator confia nisto, de 0 a 1. Abaixo de um limiar, o motor
   * pergunta em vez de assumir — é a diferença entre um bot que confirma e um
   * bot que adivinha.
   */
  confianca: z.number().min(0).max(1).default(0.5),
});

export type Intencao_ = z.infer<typeof intencaoSchema>;
export type IntencaoExtraida = Intencao_;

/** Uma intenção vazia, para quando nada se percebe. */
export function intencaoDesconhecida(): IntencaoExtraida {
  return intencaoSchema.parse({ intent: 'desconhecido', confianca: 0 });
}

/**
 * Valida o que veio de fora — do LLM ou de qualquer outro lado.
 *
 * Nunca lança. Um schema que rebenta a meio de uma conversa deixa a pessoa sem
 * resposta; um schema que devolve `desconhecido` faz o bot perguntar.
 */
export function validarIntencao(bruto: unknown): IntencaoExtraida {
  const r = intencaoSchema.safeParse(bruto);
  if (r.success) return r.data;

  // Segunda hipótese: talvez só o `intent` esteja bom e o resto seja lixo.
  // Aproveitar o que presta é melhor do que deitar fora a mensagem inteira.
  if (typeof bruto === 'object' && bruto !== null && 'intent' in bruto) {
    const intent = (bruto as { intent: unknown }).intent;
    if (typeof intent === 'string' && (INTENCOES as readonly string[]).includes(intent)) {
      return intencaoSchema.parse({ intent, confianca: 0.3 });
    }
  }

  return intencaoDesconhecida();
}

import type { FeatureKey } from '../constants';

/**
 * Os planos comerciais.
 *
 * PORQUE É QUE ISTO É CONFIGURAÇÃO E NÃO CÓDIGO ESPALHADO
 *
 * Um preço escrito dentro de um componente é um preço que alguém vai esquecer
 * quando a área comercial mudar de ideias — e vão ficar dois números diferentes
 * na mesma página. Aqui há um sítio só.
 *
 * A REGRA QUE JÁ EXISTIA E CONTINUA A VALER
 *
 * Nunca escrever `if (plano === 'ai')` no produto. As funcionalidades resolvem-se
 * por `hasFeature(tenantId, 'chatbot_ai')`, contra `plan_features` e
 * `tenant_features`. Isto aqui é a **montra**: o que se mostra a quem ainda não
 * é cliente. O que um cliente pode fazer decide-se na base de dados, onde as
 * cortesias comerciais e os pilotos também cabem.
 *
 * As `capacidades` abaixo servem para desenhar a lista de cada cartão, e têm de
 * bater certo com a tabela `plan_features` — a migration `0033` escreve-as a
 * partir destes mesmos valores.
 *
 * O ANUAL SÃO DEZ MENSALIDADES
 *
 * Doze meses ao preço de dez. Diz-se "dois meses grátis" e não "16,7% de
 * desconto": a primeira frase entende-se sem fazer contas, e é a mesma coisa.
 */

export type CodigoDePlano = 'essential' | 'professional' | 'ai';

export interface Plano {
  readonly codigo: CodigoDePlano;
  readonly nome: string;
  /** Uma linha, para debaixo do nome no cartão. */
  readonly promessa: string;
  readonly precoMensal: number;
  /** Dez mensalidades. `null` quando o plano não se vende ao ano. */
  readonly precoAnual: number | null;
  readonly moeda: 'EUR';
  /** O cartão que leva o destaque e a etiqueta "Mais escolhido". */
  readonly recomendado: boolean;
  /** As chaves de funcionalidade que o plano inclui. */
  readonly capacidades: readonly FeatureKey[];
  /** O que se lista no cartão, por palavras de quem compra. */
  readonly destaques: readonly string[];
  /** O que já se sabe que ainda não está pronto. Dito, não escondido. */
  readonly aindaNao?: readonly string[];
}

/**
 * A página pública de marcação está em **todos** os planos.
 *
 * É deliberado e é comercial: é a funcionalidade que responde a "eu não tenho
 * site", e quem paga 29 tem de a poder pôr na bio do Instagram. Cortá-la ao
 * plano de entrada seria cortar o argumento que traz o plano de entrada.
 */
const BASE: readonly FeatureKey[] = ['widget'];

export const PLANOS: readonly Plano[] = [
  {
    codigo: 'essential',
    nome: 'Essencial',
    promessa: 'Tudo o que precisa para começar a receber marcações online.',
    precoMensal: 29,
    precoAnual: 290,
    moeda: 'EUR',
    recomendado: false,
    capacidades: BASE,
    destaques: [
      'página pública de marcação, com a sua marca',
      'link próprio para partilhar onde quiser',
      'integração no site que já tem',
      'agenda com toda a equipa',
      'serviços, durações e preços seus',
      'horários por profissional, férias e folgas',
      'cancelamento e reagendamento pelo cliente',
      'confirmações e lembretes por email',
      'logótipo e cores da empresa',
    ],
  },
  {
    codigo: 'professional',
    nome: 'Profissional',
    promessa: 'Transforme o WhatsApp num canal de marcações.',
    precoMensal: 49,
    precoAnual: 490,
    moeda: 'EUR',
    recomendado: true,
    capacidades: [...BASE, 'whatsapp', 'multi_location', 'waitlist', 'advanced_reports'],
    destaques: [
      'tudo do Essencial',
      'WhatsApp integrado',
      'marcar, remarcar e cancelar por WhatsApp',
      'confirmações e lembretes por WhatsApp',
      'caixa de entrada das conversas',
      'automações',
      'várias unidades',
      'lista de espera',
      'relatórios',
    ],
  },
  {
    codigo: 'ai',
    nome: 'IA',
    promessa: 'Deixe a inteligência artificial atender e marcar.',
    precoMensal: 79,
    precoAnual: 790,
    moeda: 'EUR',
    recomendado: false,
    capacidades: [
      ...BASE,
      'whatsapp',
      'multi_location',
      'waitlist',
      'advanced_reports',
      'chatbot_ai',
      'resources',
      'group_sessions',
      'api_access',
    ],
    destaques: [
      'tudo do Profissional',
      'assistente de IA em linguagem natural',
      'percebe serviço, dia, hora e profissional',
      'sugere horários alternativos',
      'atende a qualquer hora',
      'recursos e sessões de grupo',
      'acesso à API',
      'apoio prioritário',
    ],
    // O `voice` existe como chave de funcionalidade e como canal na base de
    // dados, mas não há implementação. Vender "voz" hoje seria vender uma
    // funcionalidade que não existe.
    aindaNao: ['atendimento por voz — a arquitetura está preparada, ainda não está disponível'],
  },
];

export function planoPorCodigo(codigo: string): Plano | null {
  return PLANOS.find((p) => p.codigo === codigo) ?? null;
}

/** Quantos meses o cliente poupa ao pagar de uma vez. */
export function mesesPoupados(plano: Plano): number | null {
  if (plano.precoAnual === null) return null;
  const meses = plano.precoAnual / plano.precoMensal;
  return Math.round(12 - meses);
}

/** Há preço anual em todos os planos? Decide se o seletor faz sentido. */
export function temAnual(): boolean {
  return PLANOS.every((p) => p.precoAnual !== null);
}

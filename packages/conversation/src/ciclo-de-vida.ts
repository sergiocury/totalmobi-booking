import type { Estado } from './state-machine';

/**
 * Quando é que uma conversa deixa de ser a mesma conversa.
 *
 * O DEFEITO QUE ISTO CORRIGE
 *
 * A conversa de um número era encontrada, reaberta e retomada **para sempre**.
 * Não havia expiração, e a procura nem sequer filtrava por conversa aberta: uma
 * conversa marcada como fechada era reaberta na mensagem seguinte, com o
 * contexto todo intacto.
 *
 * O efeito com clientes reais: quem marcou uma limpeza em agosto e volta em
 * outubro para marcar uma consulta continua na conversa de agosto — com o
 * serviço antigo, a data antiga e as horas antigas no contexto. O assistente
 * responde a partir de um pedido que já foi cumprido, e a pessoa não tem forma
 * nenhuma de recomeçar.
 *
 * PORQUE É QUE SÃO 24 HORAS
 *
 * Não é um número escolhido por gosto: é a janela de sessão do WhatsApp. Fora
 * dela nem sequer podemos mandar texto livre — a plataforma considera a sessão
 * terminada. Fazer o mesmo mantém a nossa noção de "conversa" alinhada com a
 * da plataforma, em vez de inventar uma segunda.
 *
 * FECHAR E ABRIR OUTRA, EM VEZ DE LIMPAR O CONTEXTO
 *
 * Limpar em cima apagava o histórico da conversa anterior, ou misturava dois
 * episódios na mesma caixa de entrada. Quem atende quer ver "a marcação de
 * agosto" e "a de outubro" separadas — que é como as pessoas se lembram delas.
 */

/**
 * Estados de onde não se continua.
 *
 * `BOOKED` é o pedido cumprido: a próxima mensagem é assunto novo, não a
 * continuação de uma marcação que já foi feita. `CLOSED` é a despedida.
 */
const TERMINAIS: ReadonlySet<Estado> = new Set<Estado>(['BOOKED', 'CLOSED']);

/** A janela de sessão do WhatsApp. Ver a nota no topo. */
export const HORAS_ATE_EXPIRAR = 24;

export interface ConversaAnterior {
  readonly estado: Estado;
  /** A última mensagem **da pessoa**. As nossas não contam. */
  readonly ultimaEntrada: Date | null;
}

export function deveRecomecar(anterior: ConversaAnterior, agora: Date): boolean {
  if (TERMINAIS.has(anterior.estado)) return true;

  // Sem registo de entrada nenhuma, não há o que retomar.
  if (!anterior.ultimaEntrada) return true;

  const decorridas = (agora.getTime() - anterior.ultimaEntrada.getTime()) / 3_600_000;

  // Uma data futura — relógios trocados, um registo estranho — não deve
  // provocar um recomeço. `decorridas` negativo cai naturalmente no `false`.
  return decorridas >= HORAS_ATE_EXPIRAR;
}

/**
 * A pessoa está a pedir para recomeçar do zero.
 *
 * Existe porque a expiração automática não chega: quem se enganou no serviço a
 * meio de uma conversa não vai esperar 24 horas para corrigir. É a saída que
 * qualquer sistema de menus tem, e que aqui faltava.
 *
 * Deliberadamente estreito, ao contrário do `querOutroDia`. Um falso positivo
 * aqui **deita fora o que a pessoa já disse** — por isso exige-se uma palavra
 * que ninguém escreve por acaso a meio de uma marcação.
 */
const PEDE_RECOMECAR = new RegExp(
  String.raw`\b(recomecar|comecar de novo|do inicio|do zero|esquece|esqueca|menu|voltar ao inicio|anular tudo|limpar)\b`,
);

export function querRecomecar(mensagem: string): boolean {
  const t = mensagem.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  return PEDE_RECOMECAR.test(t);
}

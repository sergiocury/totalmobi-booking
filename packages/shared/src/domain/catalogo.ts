/**
 * O que se pode oferecer a quem quer marcar.
 *
 * O BECO SEM SAÍDA QUE ISTO FECHA
 *
 * Na Clínica Sorriso, o serviço "Consulta" não tinha profissional nenhum
 * associado. O assistente oferecia-o na mesma, a pessoa escolhia-o, e a partir
 * daí **nenhum dia podia ter horas** — nem hoje, nem daqui a duas semanas. A
 * resposta "não encontrei horas livres nos próximos dias" estava correta e era
 * inútil: o beco tinha sido cavado três mensagens antes.
 *
 * A página de marcação já filtrava isto. Os três canais de conversa não — a
 * regra tinha ficado escrita num sítio só, e é o mesmo padrão que obrigou a
 * corrigir a preferência horária três vezes.
 *
 * PORQUE É QUE ISTO VIVE AQUI E NÃO JUNTO ÀS CONSULTAS
 *
 * Estava em `apps/web`, onde os testes deste repositório não chegam. Uma regra
 * que já falhou uma vez, e que só se manifesta com dados reais, é precisamente
 * a que precisa de estar num sítio onde um teste a possa prender.
 */

export interface ServicoDoCatalogo {
  readonly id: string;
  readonly name: string;
}

export interface MembroDaEquipa {
  readonly id: string;
  readonly full_name: string;
}

export interface LigacaoServicoEquipa {
  readonly staff_id: string;
  readonly service_id: string;
}

export interface Catalogo<S extends ServicoDoCatalogo, P extends MembroDaEquipa> {
  /** Só os serviços que alguém da equipa faz. */
  readonly servicos: S[];
  readonly equipa: P[];
  /** `service_id` → quem o faz. */
  readonly quemFaz: Map<string, Set<string>>;
}

/**
 * Cruza serviços, equipa e ligações.
 *
 * A equipa que entra já vem filtrada por ativa e por aceitar marcação online.
 * Uma ligação a alguém que saiu não conta — senão o serviço continuava a
 * aparecer sustentado por um profissional que já não existe.
 */
export function montarCatalogo<S extends ServicoDoCatalogo, P extends MembroDaEquipa>(
  servicos: readonly S[],
  equipa: readonly P[],
  ligacoes: readonly LigacaoServicoEquipa[],
): Catalogo<S, P> {
  const daEquipa = new Set(equipa.map((p) => p.id));

  const quemFaz = new Map<string, Set<string>>();
  for (const l of ligacoes) {
    if (!daEquipa.has(l.staff_id)) continue;
    const atual = quemFaz.get(l.service_id) ?? new Set<string>();
    atual.add(l.staff_id);
    quemFaz.set(l.service_id, atual);
  }

  return {
    servicos: servicos.filter((s) => (quemFaz.get(s.id)?.size ?? 0) > 0),
    equipa: [...equipa],
    quemFaz,
  };
}

/**
 * O profissional pedido faz o serviço pedido?
 *
 * Devolve a frase a dizer quando não faz — com o que ele **faz**, porque um
 * "não é possível" sem alternativa manda a pessoa embora, e a alternativa
 * costuma servir.
 *
 * `null` quando faz: não há nada a dizer, segue-se para a procura.
 */
export function objecaoDoProfissional<S extends ServicoDoCatalogo, P extends MembroDaEquipa>(
  catalogo: Catalogo<S, P>,
  servicoId: string,
  profissional: MembroDaEquipa,
): { texto: string; opcoes: string[] } | null {
  if (catalogo.quemFaz.get(servicoId)?.has(profissional.id)) return null;

  const faz = catalogo.servicos
    .filter((s) => catalogo.quemFaz.get(s.id)?.has(profissional.id))
    .map((s) => s.name);

  if (faz.length === 0) {
    return {
      texto: `${profissional.full_name} não faz marcações online. Quer marcar com outra pessoa?`,
      opcoes: ['Outra pessoa', 'Falar com alguém'],
    };
  }

  return {
    texto: `${profissional.full_name} faz ${faz.join(' e ')}. Quer marcar um desses, ou prefere outra pessoa?`,
    opcoes: [...faz, 'Outra pessoa'],
  };
}

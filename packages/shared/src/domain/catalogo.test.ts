import { describe, expect, it } from 'vitest';

import { montarCatalogo, objecaoDoProfissional } from './catalogo';

/*
 * Os dados que estavam em produção a 30 de agosto de 2026, na Clínica Sorriso.
 *
 * "Consulta" sem ninguém associado. O assistente oferecia-a, a pessoa
 * escolhia-a, e a partir daí nenhum dia podia ter horas — a conversa passava a
 * responder "não encontrei horas livres nos próximos dias" para sempre.
 */
const CONSULTA = { id: 'srv-consulta', name: 'Consulta' };
const LIMPEZA = { id: 'srv-limpeza', name: 'Limpeza dentária' };

const ANA = { id: 'p-ana', full_name: 'Ana Martins' };
const SERGIO = { id: 'p-sergio', full_name: 'Sergio' };

const LIGACOES = [
  { staff_id: ANA.id, service_id: LIMPEZA.id },
  { staff_id: SERGIO.id, service_id: LIMPEZA.id },
];

describe('montarCatalogo', () => {
  it('esconde o serviço que ninguém faz', () => {
    const c = montarCatalogo([CONSULTA, LIMPEZA], [ANA, SERGIO], LIGACOES);

    expect(c.servicos.map((s) => s.name)).toEqual(['Limpeza dentária']);
  });

  it('a equipa não é filtrada — só os serviços', () => {
    const c = montarCatalogo([CONSULTA, LIMPEZA], [ANA, SERGIO], LIGACOES);

    expect(c.equipa).toHaveLength(2);
  });

  /*
   * Uma ligação a quem já não está.
   *
   * A equipa que entra vem filtrada por ativa e por aceitar marcação online.
   * Contar a ligação de quem saiu deixaria o serviço à vista, sustentado por
   * um profissional que o motor nunca vai considerar — o mesmo beco, por outra
   * porta.
   */
  it('ignora ligações a quem já não está na equipa', () => {
    const c = montarCatalogo(
      [LIMPEZA],
      [ANA],
      [{ staff_id: 'p-quem-saiu', service_id: LIMPEZA.id }],
    );

    expect(c.servicos).toEqual([]);
  });

  it('sem ligações nenhumas não sobra serviço nenhum', () => {
    expect(montarCatalogo([CONSULTA, LIMPEZA], [ANA], []).servicos).toEqual([]);
  });
});

describe('objecaoDoProfissional', () => {
  const catalogo = montarCatalogo([CONSULTA, LIMPEZA], [ANA, SERGIO], LIGACOES);

  it('quem faz o serviço não gera objeção', () => {
    expect(objecaoDoProfissional(catalogo, LIMPEZA.id, SERGIO)).toBeNull();
  });

  /*
   * A conversa real: pediu-se o próximo horário livre do Sergio, para Consulta.
   * A resposta era "não encontrei horas livres nos próximos dias" — verdade, e
   * sem qualquer explicação. Dizer o que ele faz resolve o pedido numa
   * mensagem em vez de o mandar embora.
   */
  it('diz o que o profissional faz, em vez de não ter horas', () => {
    const o = objecaoDoProfissional(catalogo, CONSULTA.id, SERGIO);

    expect(o?.texto).toContain('Sergio');
    expect(o?.texto).toContain('Limpeza dentária');
    expect(o?.opcoes).toContain('Limpeza dentária');
  });

  it('quem não faz nada online é encaminhado para outra pessoa', () => {
    const novo = { id: 'p-novo', full_name: 'Rita' };
    const c = montarCatalogo([LIMPEZA], [ANA, novo], LIGACOES);

    const o = objecaoDoProfissional(c, LIMPEZA.id, novo);

    expect(o?.texto).toContain('Rita');
    expect(o?.opcoes).toContain('Outra pessoa');
  });
});

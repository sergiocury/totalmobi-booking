import { describe, expect, it } from 'vitest';

import { proximoTurno, type ContextoDaConversa } from './state-machine';

/**
 * O cliente chama-se como um profissional.
 *
 * Aconteceu em produção a 30 de agosto de 2026, na Clínica Sorriso, com estes
 * nomes exatos: pediu-se o próximo horário livre **da Ana**, escolheu-se a
 * hora, e à pergunta "qual é o seu nome?" o cliente respondeu "Sergio" — que é
 * também o nome do outro profissional.
 *
 * O `fundir` corria em todas as mensagens, o extrator encontrou "Sergio" no
 * catálogo da equipa, e o `profissional` do contexto passou de "Ana Martins"
 * para "Sergio". A marcação foi criada na agenda dele.
 *
 * Não é um caso exótico: os nomes dos clientes e os da equipa saem do mesmo
 * conjunto de nomes próprios. Numa clínica com uma Ana, uma Maria e um João, a
 * colisão é quase certa.
 */

const CATALOGO = {
  servicos: ['Consulta', 'Limpeza dentária'],
  profissionais: ['Ana Martins', 'Sergio'],
};

const AGORA = new Date('2026-08-30T12:00:00.000Z');

/** A conversa parada onde parou: hora escolhida, à espera do nome. */
const A_PEDIR_NOME: ContextoDaConversa = {
  servico: 'Limpeza dentária',
  profissional: 'Ana Martins',
  data: '2026-08-31',
  slotEscolhido: '2026-08-31T13:00:00.000Z',
  slotsOferecidos: [{ iso: '2026-08-31T13:00:00.000Z', hora: '14:00' }],
};

const responder = (mensagem: string, contexto = A_PEDIR_NOME) =>
  proximoTurno({
    estado: 'COLLECTING_CUSTOMER_DATA',
    contexto,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'Clínica Sorriso',
  });

describe('o nome do cliente não muda a marcação', () => {
  it('um cliente chamado como um profissional não rouba a marcação', () => {
    const r = responder('Sergio');

    expect(r.contexto.nome).toBe('Sergio');
    // O que interessa: continua a ser a marcação da Ana.
    expect(r.contexto.profissional).toBe('Ana Martins');
  });

  /*
   * Mesmo quando o nome coincide com um serviço, a marcação não muda.
   *
   * Aqui não se afirma que "Consulta" é aceite como nome — não é, porque a
   * porta que decide se a mensagem é um nome ainda olha para a intenção
   * extraída, e "Consulta" parece um pedido de marcação. Isso é uma limitação
   * conhecida e sem consequência: não é nome de pessoa.
   *
   * O que **tem** de ser verdade é que o serviço e a hora já escolhidos não
   * mudam por causa do que veio na resposta ao nome.
   */
  it('o serviço e a hora sobrevivem ao que vier na resposta', () => {
    const r = responder('Consulta');

    expect(r.contexto.servico).toBe('Limpeza dentária');
    expect(r.contexto.slotEscolhido).toBe('2026-08-31T13:00:00.000Z');
  });

  /*
   * Uma data no nome também não pode mexer na marcação. "Amanhã" não é um nome
   * plausível, mas "Márcia" e "Marco" são — e o extrator de datas trabalha
   * sobre texto normalizado.
   */
  it('nada do que vem no nome altera o contexto', () => {
    const r = responder('amanhã de manhã');

    expect(r.contexto.data).toBe('2026-08-31');
    expect(r.contexto.periodo ?? null).toBeNull();
  });

  it('um nome normal continua a ser aceite', () => {
    expect(responder('Maria Silva').contexto.nome).toBe('Maria Silva');
  });

  /*
   * A confirmação tem de dizer o que confirma.
   *
   * Dizia só "Confirmo a marcação?". O cliente cuja marcação foi para a agenda
   * errada não tinha como reparar antes de confirmar — a única palavra que lhe
   * foi mostrada era "marcação". É o último momento em que alguém pode travar
   * um engano.
   */
  it('a confirmação diz o serviço, a hora e com quem', () => {
    const texto = responder('Maria Silva').texto;

    expect(texto).toContain('Limpeza dentária');
    expect(texto).toContain('14:00');
    expect(texto).toContain('Ana Martins');
  });

  /*
   * O outro lado da regra: **depois** de o nome estar recolhido, a conversa
   * volta a ouvir. Quem já se identificou e diz "afinal com a Ana" tem de ser
   * atendido — senão a correção do defeito criava um bot surdo a seguir.
   */
  it('depois do nome recolhido, a conversa volta a ouvir', () => {
    const r = proximoTurno({
      estado: 'CONFIRMING',
      contexto: { ...A_PEDIR_NOME, nome: 'Sergio' },
      mensagem: 'afinal prefiro com a Ana Martins',
      catalogo: CATALOGO,
      agora: AGORA,
      nomeDaEmpresa: 'Clínica Sorriso',
    });

    expect(r.contexto.profissional).toBe('Ana Martins');
  });
});

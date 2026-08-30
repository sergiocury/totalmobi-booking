import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cifrar, decifrar, lerChave, mascarar } from './crypto';
import {
  e164ParaWaId,
  escolherFormato,
  janelaAberta,
  LIMITES_INTERATIVOS,
  minutosAteFecharJanela,
  waIdParaE164,
} from './provider';
import {
  assinaturaValida,
  idDoEvento,
  interpretarEvento,
  responderDesafio,
  textoUtilizavel,
} from './webhook';

/**
 * O que se pode provar sem credenciais da Meta.
 *
 * O envio real precisa de uma conta, de um número de teste e de um token — e
 * nada disso existe ainda. Mas a parte que dá erros silenciosos e caros é
 * exatamente a que se testa aqui: assinaturas, janela de 24 h e interpretação
 * do payload.
 */

const APP_SECRET = 'segredo-de-teste-da-aplicacao';

function assinar(corpo: string, segredo = APP_SECRET): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex')}`;
}

describe('desafio de verificação', () => {
  it('devolve o desafio quando o token bate', () => {
    const r = responderDesafio(
      { modo: 'subscribe', token: 'o-meu-token', desafio: '1234567890' },
      'o-meu-token',
    );

    expect(r).toBe('1234567890');
  });

  it('recusa token errado', () => {
    expect(
      responderDesafio({ modo: 'subscribe', token: 'errado', desafio: '123' }, 'certo'),
    ).toBeNull();
  });

  it('recusa modo diferente de subscribe', () => {
    expect(
      responderDesafio({ modo: 'unsubscribe', token: 'certo', desafio: '123' }, 'certo'),
    ).toBeNull();
  });

  it('recusa pedido sem desafio', () => {
    expect(
      responderDesafio({ modo: 'subscribe', token: 'certo', desafio: null }, 'certo'),
    ).toBeNull();
  });
});

describe('assinatura do payload', () => {
  const corpo = JSON.stringify({ entry: [{ id: '123' }] });

  it('aceita a assinatura correta', () => {
    expect(assinaturaValida(corpo, assinar(corpo), APP_SECRET)).toBe(true);
  });

  it('recusa assinatura de outro segredo', () => {
    expect(assinaturaValida(corpo, assinar(corpo, 'outro-segredo'), APP_SECRET)).toBe(false);
  });

  it('recusa corpo alterado depois de assinado', () => {
    const assinatura = assinar(corpo);
    expect(assinaturaValida(`${corpo} `, assinatura, APP_SECRET)).toBe(false);
  });

  it('recusa cabeçalho em falta ou sem o prefixo', () => {
    expect(assinaturaValida(corpo, null, APP_SECRET)).toBe(false);
    expect(assinaturaValida(corpo, 'abc123', APP_SECRET)).toBe(false);
  });

  it('recusa assinatura de tamanho diferente sem rebentar', () => {
    // `timingSafeEqual` lança se os buffers tiverem tamanhos diferentes. Se
    // isto rebentasse, um atacante derrubava o webhook com um cabeçalho curto.
    expect(() => assinaturaValida(corpo, 'sha256=abc', APP_SECRET)).not.toThrow();
    expect(assinaturaValida(corpo, 'sha256=abc', APP_SECRET)).toBe(false);
  });

  it('um corpo que passe por JSON.parse/stringify já não bate', () => {
    // A armadilha documentada no módulo: assinar o objeto em vez dos bytes.
    //
    // Nota sobre o que **não** a provoca: reordenar chaves. O `JSON.stringify`
    // preserva a ordem de inserção das chaves de texto, e a primeira versão
    // deste teste assumia o contrário — passou a testar o que muda mesmo os
    // bytes: o escape de não-ASCII e os espaços de formatação.
    // O acento vem escapado no corpo; o `stringify` devolve-o literal.
    const comEscape = String.raw`{"nome":"Sofia Ara\u00fajo"}`;
    expect(
      assinaturaValida(JSON.stringify(JSON.parse(comEscape)), assinar(comEscape), APP_SECRET),
    ).toBe(false);

    const comEspacos = '{\n  "a": 1\n}';
    expect(
      assinaturaValida(JSON.stringify(JSON.parse(comEspacos)), assinar(comEspacos), APP_SECRET),
    ).toBe(false);

    // E o corpo intacto continua a bater — senão isto não provava nada.
    expect(assinaturaValida(comEscape, assinar(comEscape), APP_SECRET)).toBe(true);
  });
});

describe('interpretar o payload', () => {
  const payload = {
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            value: {
              metadata: { phone_number_id: '555000111' },
              contacts: [{ wa_id: '351912345678', profile: { name: 'Sofia' } }],
              messages: [
                {
                  id: 'wamid.AAA',
                  from: '351912345678',
                  timestamp: '1787000000',
                  type: 'text',
                  text: { body: 'Bom dia, queria marcar' },
                },
                {
                  id: 'wamid.BBB',
                  from: '351912345678',
                  timestamp: '1787000060',
                  type: 'text',
                  text: { body: 'para quinta se possível' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('lê todas as mensagens do lote, não só a primeira', () => {
    const evento = interpretarEvento(payload);

    expect(evento.mensagens).toHaveLength(2);
    expect(evento.mensagens[0]!.texto).toBe('Bom dia, queria marcar');
    expect(evento.mensagens[1]!.texto).toBe('para quinta se possível');
  });

  it('converte o timestamp de segundos para milissegundos', () => {
    const evento = interpretarEvento(payload);

    // 1787000000 s = 2026. Sem multiplicar por 1000 daria 1970.
    expect(evento.mensagens[0]!.recebidaEm.getUTCFullYear()).toBe(2026);
  });

  it('traz o nome do perfil e o número em E.164', () => {
    const evento = interpretarEvento(payload);

    expect(evento.mensagens[0]!.nome).toBe('Sofia');
    expect(evento.mensagens[0]!.de).toBe('+351912345678');
  });

  it('lê estados de entrega', () => {
    const evento = interpretarEvento({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '555000111' },
                statuses: [
                  { id: 'wamid.AAA', status: 'delivered', timestamp: '1787000100' },
                  { id: 'wamid.BBB', status: 'read', timestamp: '1787000200' },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(evento.estados.map((e) => e.estado)).toEqual(['delivered', 'read']);
  });

  it('não rebenta com um payload vazio ou estranho', () => {
    expect(interpretarEvento({}).mensagens).toHaveLength(0);
    expect(interpretarEvento({ entry: [{}] }).mensagens).toHaveLength(0);
    expect(interpretarEvento(null).mensagens).toHaveLength(0);
  });

  it('o id do evento é estável — reenviar dá a mesma chave', () => {
    const a = idDoEvento(interpretarEvento(payload));
    const b = idDoEvento(interpretarEvento(payload));

    expect(a).toBe(b);
    expect(a).toContain('wamid.AAA');
  });

  it('lotes diferentes dão chaves diferentes', () => {
    const outro = structuredClone(payload);
    outro.entry[0]!.changes[0]!.value.messages![0]!.id = 'wamid.ZZZ';

    expect(idDoEvento(interpretarEvento(payload))).not.toBe(idDoEvento(interpretarEvento(outro)));
  });
});

describe('janela de 24 horas', () => {
  const agora = new Date('2026-08-19T12:00:00Z');

  it('está aberta 23 horas depois da mensagem do cliente', () => {
    expect(janelaAberta(new Date('2026-08-18T13:00:00Z'), agora)).toBe(true);
  });

  it('está fechada 25 horas depois', () => {
    expect(janelaAberta(new Date('2026-08-18T11:00:00Z'), agora)).toBe(false);
  });

  it('está fechada quando o cliente nunca escreveu', () => {
    expect(janelaAberta(null, agora)).toBe(false);
  });

  it('sabe quanto falta para fechar', () => {
    expect(minutosAteFecharJanela(new Date('2026-08-19T10:00:00Z'), agora)).toBe(22 * 60);
    expect(minutosAteFecharJanela(new Date('2026-08-17T10:00:00Z'), agora)).toBeNull();
  });
});

describe('wa_id e E.164', () => {
  it('tira e põe o mais', () => {
    expect(e164ParaWaId('+351912345678')).toBe('351912345678');
    expect(waIdParaE164('351912345678')).toBe('+351912345678');
  });

  it('é idempotente nos dois sentidos', () => {
    expect(waIdParaE164(waIdParaE164('351912345678'))).toBe('+351912345678');
    expect(e164ParaWaId(e164ParaWaId('+351912345678'))).toBe('351912345678');
  });
});

describe('cifra dos tokens', () => {
  const chave = lerChave(Buffer.alloc(32, 7).toString('base64'), 'k1');

  it('cifra e decifra', () => {
    const token = 'EAAG1234567890tokendametaquenaoquerosaber';
    expect(decifrar(cifrar(token, chave), chave)).toBe(token);
  });

  it('duas cifragens do mesmo texto dão resultados diferentes', () => {
    // IV novo de cada vez. Se isto falhar, a cifra está partida.
    const a = cifrar('mesmo-token', chave);
    const b = cifrar('mesmo-token', chave);

    expect(a.equals(b)).toBe(false);
    expect(decifrar(a, chave)).toBe(decifrar(b, chave));
  });

  it('recusa dados adulterados', () => {
    const cifrado = cifrar('token', chave);
    cifrado[cifrado.length - 1] ^= 0xff;

    expect(() => decifrar(cifrado, chave)).toThrow();
  });

  it('recusa a chave errada', () => {
    const outra = lerChave(Buffer.alloc(32, 9).toString('base64'), 'k2');
    expect(() => decifrar(cifrar('token', chave), outra)).toThrow();
  });

  it('recusa chaves com o tamanho errado', () => {
    expect(() => lerChave(Buffer.alloc(16).toString('base64'), 'curta')).toThrow(/32/);
  });

  it('mascarar mostra o suficiente para distinguir e de menos para usar', () => {
    const mascarado = mascarar('EAAG1234567890abcdef');

    expect(mascarado).toBe('EAAG••••cdef');
    expect(mascarado).not.toContain('1234567890');
    expect(mascarar('curto')).toBe('••••');
  });
});

/*
 * Botoes e listas.
 *
 * As opcoes iam no corpo do texto como marcas de lista: no ecra do cliente
 * pareciam botoes e nao eram. Quem toca e nada acontece conclui que o servico
 * esta avariado.
 *
 * Os limites sao os da Meta, verificados na documentacao a 2026-08-29. Nao sao
 * preferencias de desenho: ultrapassa-los da erro no envio, e um envio falhado
 * a meio de uma conversa deixa o cliente sem resposta nenhuma.
 */
describe('escolherFormato', () => {
  it('ate tres opcoes curtas sao botoes', () => {
    expect(escolherFormato(['Marcar', 'Alterar', 'Cancelar'], 'x')).toBe('botoes');
  });

  it('a quarta opcao ja obriga a lista', () => {
    expect(escolherFormato(['Marcar', 'Alterar', 'Cancelar', 'Falar com alguem'], 'x')).toBe(
      'lista',
    );
  });

  it('sem opcoes nao ha formato', () => {
    expect(escolherFormato([], 'x')).toBeNull();
  });

  it('ate dez opcoes cabem numa lista', () => {
    const horas = Array.from({ length: 10 }, (_, i) => `${9 + i}:00`);

    expect(escolherFormato(horas, 'x')).toBe('lista');
    expect(escolherFormato([...horas, '19:00'], 'x')).toBeNull();
  });

  it('um corpo longo demais volta ao texto', () => {
    const corpo = 'a'.repeat(LIMITES_INTERATIVOS.corpo + 1);

    expect(escolherFormato(['Sim', 'Nao'], corpo)).toBeNull();
    expect(escolherFormato(['Sim', 'Nao'], 'a'.repeat(LIMITES_INTERATIVOS.corpo))).toBe('botoes');
  });

  /*
   * O caso que decide o desenho todo.
   *
   * O que volta da Meta quando o cliente toca e o **titulo**, e a maquina de
   * estados compara-o com o que ofereceu. Truncar um servico chamado "Limpeza
   * dentaria profunda com destartarizacao" faria o titulo deixar de bater certo
   * com o catalogo — e a conversa responderia "nao percebi" a um toque num
   * botao que ela propria desenhou. Por isso, quando nao cabe, volta ao texto.
   */
  it('um titulo que nao cabe inteiro faz voltar ao texto', () => {
    const longo = 'Limpeza dentaria profunda com destartarizacao';
    expect(longo.length).toBeGreaterThan(LIMITES_INTERATIVOS.lista.titulo);

    expect(escolherFormato([longo, 'Consulta'], 'x')).toBeNull();
  });

  it('entre 21 e 24 caracteres deixa de ser botao e passa a lista', () => {
    const titulo = 'a'.repeat(LIMITES_INTERATIVOS.botoes.titulo + 1);

    expect(titulo.length).toBeLessThanOrEqual(LIMITES_INTERATIVOS.lista.titulo);
    expect(escolherFormato([titulo], 'x')).toBe('lista');
  });
});

describe('interpretarEvento com respostas interativas', () => {
  const envelope = (mensagem: unknown) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            value: {
              metadata: { phone_number_id: '123' },
              contacts: [{ wa_id: '351912345678', profile: { name: 'Sofia' } }],
              messages: [mensagem],
            },
          },
        ],
      },
    ],
  });

  it('le o titulo do botao tocado', () => {
    const evento = interpretarEvento(
      envelope({
        id: 'wamid.1',
        from: '351912345678',
        timestamp: '1756400000',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'opcao_0', title: 'Marcar' },
        },
      }),
    );

    expect(evento.mensagens[0]?.texto).toBe('Marcar');
  });

  it('le o titulo da linha escolhida na lista', () => {
    const evento = interpretarEvento(
      envelope({
        id: 'wamid.2',
        from: '351912345678',
        timestamp: '1756400000',
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: { id: 'opcao_3', title: '14:30' },
        },
      }),
    );

    expect(evento.mensagens[0]?.texto).toBe('14:30');
  });

  it('uma mensagem de texto continua a ser lida do sitio de sempre', () => {
    const evento = interpretarEvento(
      envelope({
        id: 'wamid.3',
        from: '351912345678',
        timestamp: '1756400000',
        type: 'text',
        text: { body: 'quero marcar' },
      }),
    );

    expect(evento.mensagens[0]?.texto).toBe('quero marcar');
  });
});

/*
 * A porta que descartava os toques.
 *
 * Quando as opcoes passaram a ser botoes, o leitor aprendeu a tirar o titulo de
 * `list_reply` — mas quem responde continuou com `if (tipo !== 'text')`. Em
 * producao, a 30 de agosto de 2026, o evento chegou ao webhook, ficou guardado
 * com `list_reply: { title: "14:45" }`, e nunca foi processado: a conversa
 * parou a meio, sem erro nenhum.
 *
 * Ficou pior do que antes dos botoes, quando as pessoas escreviam a hora.
 */
describe('textoUtilizavel', () => {
  it('aceita o titulo de um botao ou de uma lista', () => {
    expect(textoUtilizavel({ tipo: 'interactive', texto: '14:45' })).toBe('14:45');
  });

  it('aceita texto escrito', () => {
    expect(textoUtilizavel({ tipo: 'text', texto: 'quero marcar' })).toBe('quero marcar');
  });

  it('apara os espacos', () => {
    expect(textoUtilizavel({ tipo: 'text', texto: '  14:45  ' })).toBe('14:45');
  });

  it('recusa o que nao tem texto nenhum', () => {
    expect(textoUtilizavel({ tipo: 'text', texto: '   ' })).toBeNull();
    expect(textoUtilizavel({ tipo: 'text' })).toBeNull();
    expect(textoUtilizavel({ tipo: 'interactive' })).toBeNull();
  });

  /*
   * Continua a recusar o resto. Uma fotografia registada e nao respondida e
   * melhor do que uma fotografia respondida como se fosse texto vazio.
   */
  it('recusa audio, imagens e documentos', () => {
    for (const tipo of ['audio', 'image', 'document', 'location', 'sticker']) {
      expect(textoUtilizavel({ tipo, texto: 'legenda' }), tipo).toBeNull();
    }
  });
});

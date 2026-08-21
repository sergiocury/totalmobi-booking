import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cifrar, decifrar, lerChave, mascarar } from './crypto';
import { e164ParaWaId, janelaAberta, minutosAteFecharJanela, waIdParaE164 } from './provider';
import {
  assinaturaValida,
  idDoEvento,
  interpretarEvento,
  responderDesafio,
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

    expect(idDoEvento(interpretarEvento(payload))).not.toBe(
      idDoEvento(interpretarEvento(outro)),
    );
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

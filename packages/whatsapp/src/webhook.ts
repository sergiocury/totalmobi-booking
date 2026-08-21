import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * O webhook da Meta.
 *
 * Verificado em `developers.facebook.com/docs/graph-api/webhooks/getting-started`
 * (2026-08-19):
 *
 *   GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 *        → devolver o `hub.challenge` em texto simples, se o token bater
 *   POST X-Hub-Signature-256: sha256={hmac}
 *        → HMAC-SHA256 do **corpo em bruto** com o App Secret
 *
 * DUAS ARMADILHAS QUE ESTA VERIFICAÇÃO EVITA
 *
 * 1. **Comparar assinaturas com `===`.** Um `===` sai mal ao primeiro byte
 *    diferente, e o tempo que demora denuncia quantos bytes acertaram. Com
 *    pedidos suficientes, descobre-se a assinatura byte a byte. `timingSafeEqual`
 *    demora sempre o mesmo.
 *
 * 2. **Assinar o corpo já convertido em objeto.** O HMAC é sobre os **bytes**
 *    que chegaram. Um `JSON.parse` seguido de `JSON.stringify` reordena chaves,
 *    muda espaços e altera a codificação de caracteres — e a assinatura deixa
 *    de bater, sem que se perceba porquê. O corpo tem de ser lido em bruto
 *    **antes** de qualquer interpretação.
 */

export interface DesafioVerificacao {
  modo: string | null;
  token: string | null;
  desafio: string | null;
}

/**
 * Responde ao desafio de verificação. Devolve o texto a enviar, ou `null` se o
 * token não bate — e nesse caso a resposta correta é 403, não uma explicação.
 */
export function responderDesafio(
  desafio: DesafioVerificacao,
  tokenEsperado: string,
): string | null {
  if (desafio.modo !== 'subscribe') return null;
  if (!desafio.token || !desafio.desafio) return null;
  if (!iguaisEmTempoConstante(desafio.token, tokenEsperado)) return null;

  return desafio.desafio;
}

export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  // `timingSafeEqual` rebenta se os tamanhos diferirem — e o próprio tamanho já
  // é informação. Compara-se contra um buffer do mesmo tamanho para o resultado
  // ser sempre `false` sem revelar nada pelo caminho.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * A assinatura confere?
 *
 * `corpoEmBruto` tem de ser exatamente o que chegou na ligação. Ver a nota 2
 * no topo.
 */
export function assinaturaValida(
  corpoEmBruto: string,
  cabecalho: string | null,
  appSecret: string,
): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false;

  const esperada = createHmac('sha256', appSecret).update(corpoEmBruto, 'utf8').digest('hex');

  return iguaisEmTempoConstante(cabecalho.slice('sha256='.length), esperada);
}

// --- Interpretação do payload ------------------------------------------------

export interface MensagemRecebida {
  readonly providerMessageId: string;
  readonly de: string;
  readonly waId: string;
  readonly nome?: string | undefined;
  readonly texto?: string | undefined;
  readonly tipo: string;
  readonly recebidaEm: Date;
  readonly phoneNumberId: string;
}

export interface EstadoDeEntrega {
  readonly providerMessageId: string;
  readonly estado: string;
  readonly em: Date;
  readonly phoneNumberId: string;
  readonly erro?: string | undefined;
}

export interface EventoInterpretado {
  readonly mensagens: MensagemRecebida[];
  readonly estados: EstadoDeEntrega[];
  readonly phoneNumberIds: string[];
}

interface PayloadMeta {
  entry?: {
    id?: string;
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }[];
        statuses?: {
          id?: string;
          status?: string;
          timestamp?: string;
          errors?: { title?: string }[];
        }[];
      };
    }[];
  }[];
}

/**
 * Um payload da Meta pode trazer várias mensagens e vários estados de uma vez.
 * Tratar só o primeiro é o erro clássico — e só se nota em picos de tráfego,
 * que é quando menos apetece descobri-lo.
 */
export function interpretarEvento(payload: unknown): EventoInterpretado {
  const mensagens: MensagemRecebida[] = [];
  const estados: EstadoDeEntrega[] = [];
  const numeros = new Set<string>();

  // Um corpo nulo ou que não seja objeto rebentava aqui. Chega de um pedido
  // malformado para derrubar o webhook — e um webhook em baixo faz a Meta
  // desativar a subscrição ao fim de várias falhas.
  if (typeof payload !== 'object' || payload === null) {
    return { mensagens, estados, phoneNumberIds: [] };
  }

  const p = payload as PayloadMeta;

  for (const entrada of p.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value;
      const phoneNumberId = valor?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      numeros.add(phoneNumberId);

      const nomePorWaId = new Map(
        (valor?.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name]),
      );

      for (const m of valor?.messages ?? []) {
        if (!m.id || !m.from) continue;

        mensagens.push({
          providerMessageId: m.id,
          de: `+${m.from}`,
          waId: m.from,
          nome: nomePorWaId.get(m.from) ?? undefined,
          texto: m.text?.body,
          tipo: m.type ?? 'text',
          // O timestamp vem em segundos, não milissegundos. Multiplicar é a
          // diferença entre 2026 e 1970.
          recebidaEm: new Date(Number(m.timestamp ?? 0) * 1000),
          phoneNumberId,
        });
      }

      for (const s of valor?.statuses ?? []) {
        if (!s.id || !s.status) continue;

        estados.push({
          providerMessageId: s.id,
          estado: s.status,
          em: new Date(Number(s.timestamp ?? 0) * 1000),
          phoneNumberId,
          erro: s.errors?.[0]?.title,
        });
      }
    }
  }

  return { mensagens, estados, phoneNumberIds: [...numeros] };
}

/**
 * Um identificador estável do evento, para a idempotência.
 *
 * A Meta não manda um id de evento — manda ids de **mensagem** e de **estado**.
 * O identificador é construído a partir deles: reenviar o mesmo lote dá a mesma
 * chave, e o índice único recusa o duplicado.
 */
export function idDoEvento(evento: EventoInterpretado): string {
  const partes = [
    ...evento.mensagens.map((m) => `m:${m.providerMessageId}`),
    ...evento.estados.map((s) => `s:${s.providerMessageId}:${s.estado}`),
  ].sort();

  return partes.join('|').slice(0, 500) || 'vazio';
}

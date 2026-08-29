import {
  DomainErrorCode,
  domainError,
  err,
  ok,
  type DomainError,
  type Result,
} from '@totalmobi/shared';

/**
 * O canal de WhatsApp.
 *
 * **Meta Cloud API, sempre.** Nunca automação do WhatsApp Web, nem bibliotecas
 * não oficiais que emulam um telemóvel: violam os termos da Meta, dão banimento
 * do número do cliente, e num produto comercial isso não é um risco técnico —
 * é um risco de negócio do próprio cliente.
 *
 * A API foi verificada em `developers.facebook.com/docs/whatsapp/cloud-api`
 * (2026-08-19), não deduzida:
 *
 *   POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages
 *   Authorization: Bearer {TOKEN}
 *   { messaging_product: 'whatsapp', to, type: 'text', text: { body } }
 *   → { messaging_product, contacts: [{ wa_id }], messages: [{ id }] }
 *
 * A JANELA DE 24 HORAS
 *
 * Abre quando o cliente **nos** escreve, e renova a cada mensagem dele. Dentro
 * dela pode sair texto livre; fora dela só sai template previamente aprovado
 * pela Meta.
 *
 * Isto não é uma preferência de estilo — é a regra da plataforma, e ignorá-la
 * dá erro no envio. É por isso que a decisão texto-ou-template não pode viver
 * no código de negócio: vive aqui, calculada a partir de um instante.
 */

export interface MensagemTexto {
  readonly tipo: 'texto';
  readonly para: string;
  readonly corpo: string;
  /** Pré-visualização de links. Útil no link de gestão da marcação. */
  readonly previewUrl?: boolean;
}

export interface MensagemTemplate {
  readonly tipo: 'template';
  readonly para: string;
  readonly nomeTemplate: string;
  readonly idioma: string;
  /** Variáveis do corpo, pela ordem em que aparecem no template aprovado. */
  readonly variaveis: readonly string[];
}

/**
 * Uma escolha para tocar, não para escrever.
 *
 * O QUE ISTO CORRIGE
 *
 * As opções iam no corpo do texto, como marcas de lista. No ecrã do cliente
 * apareciam "• Marcar", "• Alterar" — pareciam botões e não eram. Quem tenta
 * tocar e nada acontece conclui que o serviço está avariado, e escrever a
 * palavra à mão é precisamente o esforço que a conversa existe para poupar.
 */
export interface OpcaoInterativa {
  readonly id: string;
  readonly titulo: string;
}

export interface MensagemInterativa {
  readonly tipo: 'interativa';
  readonly para: string;
  readonly corpo: string;
  readonly formato: FormatoInterativo;
  readonly opcoes: readonly OpcaoInterativa[];
  /** O texto que abre a lista. Só usado no formato `lista`. */
  readonly rotuloDaLista?: string;
}

export type MensagemWhatsApp = MensagemTexto | MensagemTemplate | MensagemInterativa;

/**
 * Os limites da Meta, verificados na documentação a 2026-08-29.
 *
 * Não são preferências de desenho: ultrapassá-los dá erro no envio, e um envio
 * falhado numa conversa a meio deixa o cliente sem resposta nenhuma.
 */
export const LIMITES_INTERATIVOS = {
  botoes: { maximo: 3, titulo: 20 },
  lista: { maximo: 10, titulo: 24, rotulo: 20 },
  corpo: 1024,
} as const;

export type FormatoInterativo = 'botoes' | 'lista';

/**
 * Que formato serve estas opções — ou nenhum.
 *
 * PORQUE É QUE NÃO SE TRUNCA
 *
 * A tentação é cortar o título a 24 caracteres e enviar na mesma. Mas o que
 * volta da Meta quando o cliente toca é **o título**, e a máquina de estados
 * compara-o com o que ofereceu. Um serviço chamado "Limpeza dentária profunda"
 * truncado deixa de bater certo com o catálogo, e a conversa responde "não
 * percebi" a um toque num botão que ela própria desenhou.
 *
 * Por isso o formato só se usa quando **todas** as opções cabem inteiras.
 * Quando não cabem, devolve-se `null` e quem chama volta ao texto — que é feio,
 * mas funciona.
 */
export function escolherFormato(
  opcoes: readonly string[],
  corpo: string,
): FormatoInterativo | null {
  if (opcoes.length === 0) return null;

  // O corpo tem limite proprio, e um corpo longo demais faz o envio falhar a
  // meio da conversa. Em texto nao ha esse limite, por isso vale a pena descer.
  if (corpo.length > LIMITES_INTERATIVOS.corpo) return null;

  const cabeEm = (limite: number) => opcoes.every((o) => o.length <= limite);

  if (
    opcoes.length <= LIMITES_INTERATIVOS.botoes.maximo &&
    cabeEm(LIMITES_INTERATIVOS.botoes.titulo)
  ) {
    return 'botoes';
  }

  if (
    opcoes.length <= LIMITES_INTERATIVOS.lista.maximo &&
    cabeEm(LIMITES_INTERATIVOS.lista.titulo)
  ) {
    return 'lista';
  }

  return null;
}

export interface MensagemEnviada {
  readonly providerMessageId: string;
  readonly waId?: string | undefined;
}

export interface MessagingProvider {
  readonly name: string;
  send(mensagem: MensagemWhatsApp): Promise<Result<MensagemEnviada, DomainError>>;
}

/**
 * A janela está aberta?
 *
 * Só a última mensagem **de entrada** conta. As nossas não renovam nada — se
 * renovassem, bastava mandar uma mensagem por dia para nunca mais precisar de
 * template, e a regra deixaria de existir.
 */
export function janelaAberta(ultimaEntrada: Date | null, agora: Date): boolean {
  if (!ultimaEntrada) return false;
  return agora.getTime() - ultimaEntrada.getTime() < 24 * 3_600_000;
}

/** Quanto falta para a janela fechar. `null` se já está fechada. */
export function minutosAteFecharJanela(ultimaEntrada: Date | null, agora: Date): number | null {
  if (!janelaAberta(ultimaEntrada, agora)) return null;
  const fecha = ultimaEntrada!.getTime() + 24 * 3_600_000;
  return Math.max(0, Math.round((fecha - agora.getTime()) / 60_000));
}

/**
 * O `wa_id` é o número internacional **sem** o `+`.
 *
 * Guardamos tudo em E.164 (`+351912345678`); a Meta devolve e espera
 * `351912345678`. Converter num só sítio evita a classe de bug em que metade
 * do código procura com `+` e a outra metade sem.
 */
export function e164ParaWaId(e164: string): string {
  return e164.replace(/^\+/, '');
}

export function waIdParaE164(waId: string): string {
  return waId.startsWith('+') ? waId : `+${waId}`;
}

const VERSAO_GRAPH = 'v25.0';

export class MetaCloudApiProvider implements MessagingProvider {
  readonly name = 'meta_cloud_api';

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  async send(mensagem: MensagemWhatsApp): Promise<Result<MensagemEnviada, DomainError>> {
    const corpo =
      mensagem.tipo === 'interativa'
        ? {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: e164ParaWaId(mensagem.para),
            type: 'interactive',
            interactive: corpoInterativo(mensagem),
          }
        : mensagem.tipo === 'texto'
          ? {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: e164ParaWaId(mensagem.para),
              type: 'text',
              text: { preview_url: mensagem.previewUrl ?? true, body: mensagem.corpo },
            }
          : {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: e164ParaWaId(mensagem.para),
              type: 'template',
              template: {
                name: mensagem.nomeTemplate,
                language: { code: mensagem.idioma },
                components: mensagem.variaveis.length
                  ? [
                      {
                        type: 'body',
                        parameters: mensagem.variaveis.map((v) => ({ type: 'text', text: v })),
                      },
                    ]
                  : [],
              },
            };

    let resposta: Response;

    try {
      resposta = await fetch(
        `https://graph.facebook.com/${VERSAO_GRAPH}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(corpo),
        },
      );
    } catch (cause) {
      return err(
        domainError(DomainErrorCode.PROVIDER_ERROR, 'Não foi possível contactar a Meta', { cause }),
      );
    }

    if (!resposta.ok) {
      const texto = await resposta.text();

      // 4xx é do pedido — template não aprovado, número inválido, janela
      // fechada. Repetir dá o mesmo erro. 5xx e 429 são deles, e valem retry.
      const permanente = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;

      return err(
        domainError(
          permanente ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.PROVIDER_ERROR,
          // O token vai no cabeçalho, nunca no corpo — o texto do erro pode ir
          // para o log sem risco. Ainda assim é truncado.
          `Meta respondeu ${resposta.status}: ${texto.slice(0, 300)}`,
          { details: { status: resposta.status, permanente } },
        ),
      );
    }

    const dados = (await resposta.json()) as {
      messages?: { id?: string }[];
      contacts?: { wa_id?: string }[];
    };

    const id = dados.messages?.[0]?.id;

    if (!id) {
      return err(
        domainError(DomainErrorCode.PROVIDER_ERROR, 'A Meta respondeu sem id de mensagem'),
      );
    }

    return ok({ providerMessageId: id, waId: dados.contacts?.[0]?.wa_id });
  }
}

/**
 * O objeto `interactive`, nas duas formas que a Meta aceita.
 *
 * O `id` é o índice, não o título: o título já viaja em `title`, e repeti-lo
 * num identificador limitado a 256 caracteres não acrescenta nada.
 */
function corpoInterativo(mensagem: MensagemInterativa): unknown {
  if (mensagem.formato === 'botoes') {
    return {
      type: 'button',
      body: { text: mensagem.corpo },
      action: {
        buttons: mensagem.opcoes.map((o) => ({
          type: 'reply',
          reply: { id: o.id, title: o.titulo },
        })),
      },
    };
  }

  return {
    type: 'list',
    body: { text: mensagem.corpo },
    action: {
      button: mensagem.rotuloDaLista ?? 'Ver opções',
      sections: [
        {
          title: 'Opções',
          rows: mensagem.opcoes.map((o) => ({ id: o.id, title: o.titulo })),
        },
      ],
    },
  };
}

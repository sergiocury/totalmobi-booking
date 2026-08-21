import {
  DomainErrorCode,
  domainError,
  err,
  ok,
  type DomainError,
  type Result,
} from '@totalmobi/shared';

import type { EmailMessage, EmailProvider, SentEmail } from '../email-provider';

/**
 * Envio por Resend.
 *
 * A API foi verificada em `resend.com/docs/api-reference/emails/send-email`
 * (2026-08-19), não deduzida:
 *
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer re_...
 *   { from, to, subject, html | text }        →  { "id": "..." }
 *
 * O `Idempotency-Key` é opcional na API e **obrigatório aqui**. É a peça que
 * torna a fila segura: se o envio correr bem e a escrita do `sent_at` falhar a
 * seguir, o job volta à fila e é tentado outra vez — e sem esta chave o cliente
 * receberia o mesmo email duas vezes. Com ela, o Resend reconhece o pedido e
 * devolve o mesmo `id` sem reenviar.
 *
 * As chaves expiram ao fim de 24 horas do lado deles, o que cobre folgadamente
 * as cinco tentativas com backoff (o total é menos de 31 minutos).
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
  ) {
    if (!apiKey.startsWith('re_')) {
      throw new Error('Chave do Resend inválida: as chaves começam por "re_".');
    }
  }

  async send(
    message: EmailMessage,
    idempotencyKey?: string,
  ): Promise<Result<SentEmail, DomainError>> {
    // O remetente white-label: o nome é o da empresa, o endereço é de um
    // domínio nosso verificado. Usar o domínio do cliente exigiria que cada um
    // configurasse SPF e DKIM antes de poder marcar — inaceitável no onboarding.
    const from = message.fromName
      ? `${message.fromName} <${this.defaultFrom}>`
      : this.defaultFrom;

    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
      // Máximo de 256 caracteres, segundo a documentação.
      cabecalhos['Idempotency-Key'] = idempotencyKey.slice(0, 256);
    }

    let resposta: Response;

    try {
      resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({
          from,
          to: [message.to.email],
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo.email } : {}),
        }),
      });
    } catch (cause) {
      // Rede em baixo. É **retentável** — e essa distinção é o que decide se o
      // job volta à fila ou morre.
      return err(
        domainError(DomainErrorCode.PROVIDER_ERROR, 'Não foi possível contactar o Resend', {
          cause,
        }),
      );
    }

    if (!resposta.ok) {
      const corpo = await resposta.text();

      // 4xx é culpa do pedido — email inválido, domínio não verificado. Tentar
      // outra vez dá exatamente o mesmo erro, cinco vezes, com espera pelo meio.
      // 5xx e 429 são deles, e passam.
      const permanente = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;

      return err(
        domainError(
          permanente ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.PROVIDER_ERROR,
          `Resend respondeu ${resposta.status}: ${corpo.slice(0, 300)}`,
          { details: { status: resposta.status, permanente } },
        ),
      );
    }

    const dados = (await resposta.json()) as { id?: string };

    return ok({ providerMessageId: dados.id ?? 'desconhecido' });
  }
}

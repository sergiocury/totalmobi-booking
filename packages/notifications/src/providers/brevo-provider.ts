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
 * Envio por Brevo.
 *
 * PORQUE É QUE ISTO EXISTE, TENDO JÁ UM PROVIDER DE RESEND
 *
 * O `totalmobi.pt` **já está verificado no Brevo** — SPF com
 * `include:spf.brevo.com`, DKIM em `brevo1._domainkey` e `brevo2._domainkey`,
 * DMARC a reportar para lá. Está a funcionar noutros projetos do Sérgio.
 *
 * Para usar o Resend seria preciso acrescentar um registo TXT em
 * `resend._domainkey.totalmobi.pt` — e o painel do one.com recusa-o com um
 * "erro inesperado" sem explicação. (Aceita `_dmarc` em TXT e
 * `brevo1._domainkey` em CNAME; falha em TXT com underscore numa etiqueta do
 * meio. É um defeito do painel deles.)
 *
 * Entre lutar contra um painel de DNS e usar um fornecedor já verificado, a
 * escolha não é difícil. **Foi para isto que o `EmailProvider` é uma
 * interface** desde o M2: trocar de fornecedor é escrever uma classe, não
 * reescrever o produto.
 *
 * A API foi verificada em `developers.brevo.com/reference/sendtransacemail`
 * (2026-08-21), não deduzida:
 *
 *   POST https://api.brevo.com/v3/smtp/email
 *   api-key: <chave>
 *   { sender: {email, name}, to: [{email, name}], subject, htmlContent }
 *   → 201 { "messageId": "<…@relay.domain.com>" }
 *
 * SOBRE A IDEMPOTÊNCIA
 *
 * O Brevo aceita cabeçalhos personalizados na mensagem, mas **não documenta
 * uma garantia de idempotência** como o Resend faz. Envia-se a chave à mesma —
 * fica no cabeçalho da mensagem e serve para rastrear —, mas **não se pode
 * contar com ela** para evitar um envio duplicado.
 *
 * Isso não deixa a fila insegura: a proteção principal é o índice único em
 * `notification_jobs`, que impede o mesmo aviso de ser planeado duas vezes. O
 * que se perde é a rede de segurança para o caso raro de o envio correr bem e
 * a escrita do estado falhar logo a seguir. Fica registado por ser uma
 * diferença real entre os dois fornecedores.
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';

  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
  ) {
    if (!apiKey.startsWith('xkeysib-')) {
      throw new Error('Chave do Brevo inválida: as chaves de API começam por "xkeysib-".');
    }
  }

  async send(
    message: EmailMessage,
    idempotencyKey?: string,
  ): Promise<Result<SentEmail, DomainError>> {
    let resposta: Response;

    try {
      resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          // O nome do remetente é o da empresa; o endereço é de um domínio
          // nosso verificado. Usar o domínio do cliente exigiria que cada um
          // configurasse SPF e DKIM antes de poder marcar.
          sender: {
            email: this.defaultFrom,
            ...(message.fromName ? { name: message.fromName } : {}),
          },
          to: [
            {
              email: message.to.email,
              ...(message.to.name ? { name: message.to.name } : {}),
            },
          ],
          subject: message.subject,
          htmlContent: message.html,
          ...(message.text ? { textContent: message.text } : {}),
          ...(message.replyTo ? { replyTo: { email: message.replyTo.email } } : {}),
          // Vai no cabeçalho da mensagem para se poder correlacionar um email
          // recebido com o job que o gerou. Ver a nota sobre idempotência.
          ...(idempotencyKey ? { headers: { 'X-Job-Id': idempotencyKey.slice(0, 200) } } : {}),
        }),
      });
    } catch (cause) {
      return err(
        domainError(DomainErrorCode.PROVIDER_ERROR, 'Não foi possível contactar o Brevo', {
          cause,
        }),
      );
    }

    if (!resposta.ok) {
      const corpo = await resposta.text();

      // 4xx é do pedido — remetente não verificado, email inválido. Repetir dá
      // o mesmo erro cinco vezes. 5xx e 429 são deles, e valem retry.
      const permanente = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;

      return err(
        domainError(
          permanente ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.PROVIDER_ERROR,
          `Brevo respondeu ${resposta.status}: ${corpo.slice(0, 300)}`,
          { details: { status: resposta.status, permanente } },
        ),
      );
    }

    const dados = (await resposta.json()) as { messageId?: string };

    return ok({ providerMessageId: dados.messageId ?? 'desconhecido' });
  }
}

import { ok, type DomainError, type Result } from '@totalmobi/shared';

import type { EmailMessage, EmailProvider, SentEmail } from '../email-provider';

/**
 * Provider de desenvolvimento: escreve o email na consola em vez de o enviar.
 *
 * Não é um `null provider` que deita fora a mensagem. Imprime o assunto, o
 * destinatário e **os links contidos no corpo**, porque durante o
 * desenvolvimento o que se precisa de um convite é exatamente isso: o URL, para
 * o abrir no browser sem passar por caixa de correio nenhuma.
 *
 * É deliberadamente ruidoso. Um provider silencioso em produção seria um
 * desastre calado — convites que ninguém recebe e ninguém dá por isso.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<Result<SentEmail, DomainError>> {
    const links = [...message.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    console.warn(
      [
        '',
        '┌─ EMAIL NÃO ENVIADO (provider de desenvolvimento) ─────────────',
        `│ Para:    ${message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email}`,
        `│ De:      ${message.fromName ?? 'Totalmobi Booking'}`,
        `│ Assunto: ${message.subject}`,
        ...(links.length ? ['│', '│ Links:', ...links.map((l) => `│   ${l}`)] : []),
        '└───────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    return ok({ providerMessageId: `console-${Date.now()}` });
  }
}

import type { DomainError, Result } from '@totalmobi/shared';

/**
 * Interface de envio de email.
 *
 * PORQUE É QUE ESTE PACOTE EXISTE, EM VEZ DE SE USAR O SUPABASE
 *
 * O Supabase envia emails de autenticação sozinho. Não os usamos, por duas
 * razões independentes — e qualquer uma delas bastaria:
 *
 * 1. **Os templates são um por projeto.** O Booking é white-label: o convite
 *    para gerir a agenda da Clínica Sorriso tem de levar o logo e as cores da
 *    Clínica Sorriso, e o do Studio Bella os dele. Um template de projeto nunca
 *    consegue isso, esteja o projeto partilhado ou não.
 *
 * 2. **O SMTP interno do Supabase está limitado a 2 emails por hora** neste
 *    projeto (`rate_limit_email_sent: 2`, medido a 2026-08-17). Chega para
 *    entrar durante o desenvolvimento; não chega para convidar uma equipa.
 *
 * O caminho é sempre o mesmo: `auth.admin.generateLink()` devolve um
 * `hashed_token` **sem enviar email nenhum**, nós construímos o URL para
 * `/auth/confirm` e mandamo-lo pelo provider daqui.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  to: EmailAddress;
  subject: string;
  html: string;
  text: string;
  replyTo?: EmailAddress;
  /** Marca do tenant, para o remetente aparecer como a empresa e não como nós. */
  fromName?: string;
  tags?: Record<string, string>;
}

export interface SentEmail {
  providerMessageId: string;
}

export interface EmailProvider {
  readonly name: string;
  /**
   * `idempotencyKey` é opcional na interface e essencial na fila: se o envio
   * correr bem e a escrita do estado falhar a seguir, o job é tentado outra vez
   * — e sem a chave o destinatário recebia o mesmo email duas vezes.
   *
   * Um provider que não a suporte simplesmente ignora-a; a fila continua
   * correta, só perde esta rede de segurança.
   */
  send(
    message: EmailMessage,
    idempotencyKey?: string,
  ): Promise<Result<SentEmail, DomainError>>;
}

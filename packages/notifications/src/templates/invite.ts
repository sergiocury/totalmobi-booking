/**
 * Template do convite para gerir uma agenda.
 *
 * HTML escrito à mão, com estilos inline e tabelas. Não é falta de gosto: os
 * clientes de email — sobretudo o Outlook — ignoram folhas de estilo externas,
 * `flex` e boa parte do CSS moderno. Um template bonito no browser que chega
 * partido à caixa de entrada não serve de nada.
 *
 * As cores vêm do tenant. É o mesmo motivo pelo qual não usamos os templates do
 * Supabase: quem convida é a Clínica Sorriso, não a Totalmobi.
 */

export interface InviteTemplateInput {
  /** Nome de quem recebe, quando se sabe. */
  recipientName?: string | undefined;
  tenantName: string;
  inviterName?: string | undefined;
  roleLabel: string;
  acceptUrl: string;
  primaryColor: string;
  logoUrl?: string | undefined;
  expiresInHours: number;
}

/** Escapa para HTML. O nome da empresa é escrito por um utilizador. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderInviteEmail(input: InviteTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const tenant = escapeHtml(input.tenantName);
  const greeting = input.recipientName ? `Olá ${escapeHtml(input.recipientName)},` : 'Olá,';
  const inviter = input.inviterName ? escapeHtml(input.inviterName) : null;
  const role = escapeHtml(input.roleLabel);

  const subject = `Convite para gerir a agenda da ${input.tenantName}`;

  const intro = inviter
    ? `${inviter} convidou-o para gerir a agenda da <strong>${tenant}</strong> como ${role}.`
    : `Foi convidado para gerir a agenda da <strong>${tenant}</strong> como ${role}.`;

  const html = `<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f8f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:40px 36px;">
        ${
          input.logoUrl
            ? `<tr><td style="padding-bottom:28px;"><img src="${escapeHtml(input.logoUrl)}" alt="${tenant}" height="40" style="height:40px;display:block;border:0;"></td></tr>`
            : `<tr><td style="padding-bottom:28px;font-size:19px;font-weight:600;color:#101828;">${tenant}</td></tr>`
        }
        <tr><td style="font-size:16px;line-height:1.6;color:#101828;">
          <p style="margin:0 0 16px;">${greeting}</p>
          <p style="margin:0 0 28px;">${intro}</p>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <a href="${escapeHtml(input.acceptUrl)}"
             style="display:inline-block;background:${escapeHtml(input.primaryColor)};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;font-size:15px;">
            Aceitar convite
          </a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#5a6b73;border-top:1px solid #e3e9eb;padding-top:22px;">
          <p style="margin:0 0 10px;">Este link é pessoal e expira em ${input.expiresInHours} horas.</p>
          <p style="margin:0;">Se não estava à espera deste convite, ignore este email — não é preciso fazer nada.</p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:20px auto 0;font-size:12px;color:#8a9ba3;text-align:center;">
        Enviado pela ${tenant} através do Totalmobi Booking.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    greeting,
    '',
    inviter
      ? `${input.inviterName} convidou-o para gerir a agenda da ${input.tenantName} como ${input.roleLabel}.`
      : `Foi convidado para gerir a agenda da ${input.tenantName} como ${input.roleLabel}.`,
    '',
    'Aceitar o convite:',
    input.acceptUrl,
    '',
    `Este link é pessoal e expira em ${input.expiresInHours} horas.`,
    'Se não estava à espera deste convite, ignore este email.',
  ].join('\n');

  return { subject, html, text };
}

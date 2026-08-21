import { formatInZone } from '@totalmobi/shared';

import type { EmailMessage } from '../email-provider';

/**
 * Compor a mensagem de uma marcação.
 *
 * O template vem da base de dados — do tenant se ele o personalizou, da
 * plataforma se não. Aqui só se substituem as chaves e se envolve o resultado
 * em HTML com a cor da empresa.
 *
 * PORQUE É QUE NÃO HÁ MOTOR DE TEMPLATES
 *
 * São nove substituições. Um Handlebars ou um MJML no caminho de envio seria
 * uma dependência a mais para falhar às três da manhã, e a capacidade de
 * escrever lógica dentro do texto — que é exatamente o que não se quer que um
 * cliente possa fazer num template que corre no nosso servidor.
 *
 * O HTML É DELIBERADAMENTE ANTIQUADO
 *
 * Tabelas e estilos em linha. O Outlook ignora `<style>` no `<head>`, o Gmail
 * remove-o, e metade dos clientes de email não faz flexbox. Um email bonito no
 * browser e partido no Outlook é um email partido.
 */

export interface DadosDaMarcacao {
  customerName: string;
  tenantName: string;
  brandColor?: string | null;
  logoUrl?: string | null;

  serviceName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  staffName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationPhone?: string | null;

  /** URL completo de `/m/<token>`. */
  manageUrl?: string | null;
  locale?: string;
}

export interface TemplateBruto {
  subject: string | null;
  body: string;
}

/** Escapa o que vai para dentro de HTML. Os dados vêm de quem marcou. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function substituir(texto: string, dados: DadosDaMarcacao): string {
  const locale = dados.locale ?? 'pt-PT';
  const tz = dados.timezone;

  // "sexta-feira, 21 de agosto às 22:09".
  //
  // A primeira versão juntava três formatos do `formatInZone` e saía
  // "sexta 21, 21/08/2026 às 22:09" — com o dia repetido. Só se viu na
  // pré-visualização, que é precisamente para isso que ela existe.
  //
  // Sem o ano de propósito: um lembrete é sempre para os próximos dias, e o ano
  // só acrescenta ruído a uma frase que se lê de relance no telemóvel.
  const quando = `${new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(dados.startAt))} às ${formatInZone(new Date(dados.startAt), tz, locale, 'time')}`;

  const valores: Record<string, string> = {
    customerName: dados.customerName,
    tenantName: dados.tenantName,
    serviceName: dados.serviceName,
    quando,
    hora: formatInZone(new Date(dados.startAt), tz, locale, 'time'),
    // Linhas que desaparecem quando não há dados, em vez de deixarem "Com: —".
    staffLinha: dados.staffName ? `Com ${dados.staffName}\n` : '',
    locationName: dados.locationName ?? '',
    locationAddress: dados.locationAddress ? `\n${dados.locationAddress}` : '',
    telefoneFrase: dados.locationPhone ? ` pelo ${dados.locationPhone}` : '',
    manageUrl: dados.manageUrl ?? '',
  };

  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => valores[chave] ?? '');
}

export function comporEmail(
  template: TemplateBruto,
  dados: DadosDaMarcacao,
  para: string,
): EmailMessage {
  const texto = substituir(template.body, dados);
  const assunto = substituir(template.subject ?? 'Marcação — {{tenantName}}', dados);
  const marca = dados.brandColor ?? '#0B5FFF';

  // O corpo vem em texto simples com quebras de linha; aqui vira parágrafos.
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escapar(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const botao = dados.manageUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px">
         <tr><td style="background:${escapar(marca)};border-radius:8px">
           <a href="${escapar(dados.manageUrl)}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600">Ver a minha marcação</a>
         </td></tr>
       </table>`
    : '';

  const html = `<!doctype html>
<html lang="${escapar(dados.locale ?? 'pt-PT')}">
<body style="margin:0;padding:0;background:#f4f6f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101828;font-size:16px">
        <tr><td>
          ${dados.logoUrl ? `<img src="${escapar(dados.logoUrl)}" alt="" height="36" style="height:36px;margin-bottom:20px">` : `<p style="margin:0 0 20px;font-size:18px;font-weight:600;color:${escapar(marca)}">${escapar(dados.tenantName)}</p>`}
          ${paragrafos}
          ${botao}
        </td></tr>
      </table>
      <p style="max-width:520px;margin:16px auto 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#667085">
        Recebeu este email porque tem uma marcação em ${escapar(dados.tenantName)}.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    to: { email: para, name: dados.customerName },
    subject: assunto,
    html,
    text: texto,
    // O remetente aparece com o nome da empresa. É o que faz o email parecer
    // dela e não de um sistema.
    fromName: dados.tenantName,
  };
}

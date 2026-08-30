import { formatInZone } from '@totalmobi/shared';

/**
 * O que uma notificação precisa de saber para virar texto.
 *
 * Vive no pacote, e não em `apps/web`, porque é lógica pura — e porque lá os
 * testes deste repositório não chegam.
 */
export interface DadosDaNotificacao {
  readonly tipo: string;
  readonly para: string | null;
  readonly nomeDoCliente: string | null;
  readonly nomeDaEmpresa: string | null;
  readonly servico: string | null;
  readonly inicio: string | null;
  readonly fuso: string | null;
  readonly profissional: string | null;
  readonly unidade: string | null;
  readonly morada: string | null;
  readonly urlDeGestao: string | null;
}

/**
 * O texto de uma notificação de WhatsApp.
 *
 * O WhatsApp não é HTML: negrito é `*asterisco*`, não há assunto, e uma
 * mensagem longa é lida num ecrã de telemóvel. Reaproveitar o corpo do email
 * daria uma parede de texto com marcas que não renderizam.
 */
export function comporTextoDaNotificacao(d: DadosDaNotificacao): string | null {
  if (!d.inicio) return null;

  const fuso = d.fuso ?? 'Europe/Lisbon';
  const quando = formatInZone(new Date(d.inicio), fuso, 'pt-PT', 'datetime');
  const nome = d.nomeDoCliente ?? '';
  const ola = nome ? `Olá ${nome}, ` : '';

  const linhas: string[] = [];

  if (d.tipo === 'cancelled') {
    linhas.push(`${ola}a sua marcação de ${d.servico ?? 'serviço'} em ${quando} foi cancelada.`);
  } else if (d.tipo === 'reminder') {
    linhas.push(`${ola}lembrete: ${d.servico ?? 'a sua marcação'} em ${quando}.`);
  } else {
    linhas.push(`${ola}a sua marcação está confirmada.`);
    linhas.push('');
    linhas.push(`*${d.servico ?? 'Marcação'}*`);
    linhas.push(quando);
  }

  if (d.profissional && d.tipo !== 'cancelled') linhas.push(`Com ${d.profissional}`);
  if (d.unidade) linhas.push(d.morada ? `${d.unidade} — ${d.morada}` : d.unidade);

  if (d.urlDeGestao && d.tipo !== 'cancelled') {
    linhas.push('');
    linhas.push(`Para alterar ou cancelar: ${d.urlDeGestao}`);
  }

  return linhas.join('\n');
}

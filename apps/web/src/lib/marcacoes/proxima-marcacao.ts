import 'server-only';

import { cancelBooking, rescheduleBooking, type BookingClient } from '@totalmobi/database';
import { formatInZone, motivoDaRecusa, regraDeAntecedencia } from '@totalmobi/shared';

/**
 * A marcação de quem está a falar connosco.
 *
 * PORQUE É QUE ISTO NÃO EXISTIA
 *
 * A máquina de estados sabia perguntar "quer mesmo cancelar?" desde sempre, e
 * o adaptador do WhatsApp **não cumpria nenhuma** das necessidades de gestão:
 * `cancelar_marcacao`, `consultar_marcacao` e `chamar_humano` eram todas
 * ignoradas em silêncio. O bot fazia a pergunta e não tinha como agir sobre a
 * resposta — que foi como um pedido de cancelamento acabou em ciclo.
 *
 * O TELEFONE É A CHAVE, E CHEGA
 *
 * Quem escreve pelo WhatsApp é identificado pelo número, e o número está no
 * `customers` em E.164. Não se pede código nem confirmação de identidade: quem
 * tem o telemóvel na mão já provou o que havia a provar, e é o mesmo critério
 * do link de gestão que vai nos emails.
 *
 * **Só marcações futuras e que ocupam a agenda.** Cancelar uma consulta de
 * ontem não faz sentido, e uma já cancelada não se cancela outra vez.
 */

export interface MarcacaoDoCliente {
  readonly id: string;
  readonly inicio: string;
  readonly servico: string | null;
  readonly profissional: string | null;
  readonly fuso: string;
}

interface LinhaDaMarcacao {
  id: string;
  start_at: string;
  timezone: string | null;
  services: { name: string } | null;
  staff: { full_name: string } | null;
}

export async function proximaMarcacao(
  client: BookingClient,
  tenantId: string,
  telefone: string,
  agora: Date,
): Promise<MarcacaoDoCliente | null> {
  const { data: cliente } = await client
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', telefone)
    .is('anonymized_at', null)
    .maybeSingle<{ id: string }>();

  if (!cliente) return null;

  const { data } = await client
    .from('bookings')
    .select('id, start_at, timezone, services(name), staff(full_name)')
    .eq('tenant_id', tenantId)
    .eq('customer_id', cliente.id)
    .eq('occupies_slot', true)
    .gte('start_at', agora.toISOString())
    .order('start_at', { ascending: true })
    .limit(1)
    .maybeSingle<LinhaDaMarcacao>();

  if (!data) return null;

  return {
    id: data.id,
    inicio: data.start_at,
    servico: data.services?.name ?? null,
    profissional: data.staff?.full_name ?? null,
    fuso: data.timezone ?? 'Europe/Lisbon',
  };
}

/** A marcação em palavras, para entrar numa resposta. */
export function descreverMarcacao(m: MarcacaoDoCliente): string {
  const quando = formatInZone(new Date(m.inicio), m.fuso, 'pt-PT', 'datetime');
  const com = m.profissional ? ` com ${m.profissional}` : '';

  return `${m.servico ?? 'a marcação'} em ${quando}${com}`;
}

/**
 * Cancelar a próxima marcação de quem está a escrever.
 *
 * O aviso ao cliente **não** sai daqui: o gatilho da base de dados planeia a
 * notificação de `cancelled` quando a marcação deixa de ocupar a agenda. Enviar
 * também por aqui daria duas mensagens a dizer o mesmo.
 */
export async function cancelarDoCliente(
  client: BookingClient,
  tenantId: string,
  telefone: string,
  agora: Date,
): Promise<{ texto: string; humano?: boolean }> {
  const marcacao = await proximaMarcacao(client, tenantId, telefone, agora);

  if (!marcacao) {
    return { texto: 'Não encontrei nenhuma marcação futura no seu número. Quer marcar uma?' };
  }

  const r = await cancelBooking(client, marcacao.id, {
    reason: 'cancelado pelo cliente no WhatsApp',
    byCustomer: true,
  });

  if (!r.ok) {
    /*
     * A recusa costuma ser uma regra da empresa, não uma avaria — e escondê-la
     * faz o cliente pensar que o sistema falhou. Ver `motivoDaRecusa`.
     */
    const regra = regraDeAntecedencia(r.error.code, r.error.message);
    if (regra) {
      return { texto: `${regra}. Vou passar a um colega, que trata disto consigo.`, humano: true };
    }

    const motivo = motivoDaRecusa(r.error.code);
    return {
      texto: motivo
        ? `Não cancelei: ${motivo}. Quer que um colega trate disto?`
        : 'Não consegui cancelar. Vou passar a um colega.',
      humano: true,
    };
  }

  return {
    texto: `Cancelei ${descreverMarcacao(marcacao)}. Se precisar, é só dizer para marcar outra.`,
  };
}

/**
 * Mudar a hora da marcação que a pessoa já tem.
 *
 * A hora nova vem de `slotEscolhido`, que só pode ser uma das que **nós**
 * oferecemos — o `proximoTurno` recusa qualquer outra. Mesmo assim passa pela
 * `reschedule_booking`, que revalida contra a constraint de exclusão: entre
 * oferecer a hora e confirmá-la passam segundos, e nesses segundos alguém pode
 * ter marcado pela página pública.
 *
 * O aviso ao cliente não sai daqui: o gatilho planeia `rescheduled` quando o
 * `start_at` muda. Ver a migration 0042.
 */
export async function remarcarDoCliente(
  client: BookingClient,
  bookingId: string,
  novaHora: string,
): Promise<{ ok: boolean; texto: string; humano?: boolean }> {
  const r = await rescheduleBooking(client, bookingId, new Date(novaHora), {
    reason: 'remarcado pelo cliente no WhatsApp',
    byCustomer: true,
  });

  if (!r.ok) {
    if (r.error.code === 'SLOT_TAKEN') {
      // Esta a pessoa resolve sozinha: escolhe outra hora.
      return { ok: false, texto: 'Essa hora acabou de ser ocupada. Quer que veja outras?' };
    }

    const regra = regraDeAntecedencia(r.error.code, r.error.message);
    if (regra) {
      return {
        ok: false,
        texto: `${regra}. Vou passar a um colega, que trata disto consigo.`,
        humano: true,
      };
    }

    const motivo = motivoDaRecusa(r.error.code);
    return {
      ok: false,
      texto: motivo
        ? `Não mudei: ${motivo}.`
        : 'Não consegui mudar a hora. Vou passar a um colega.',
      humano: !motivo,
    };
  }

  return { ok: true, texto: 'Está mudado. Vai receber a confirmação por aqui.' };
}

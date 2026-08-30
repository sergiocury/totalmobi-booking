import 'server-only';

import { cancelBooking, type BookingClient } from '@totalmobi/database';
import { formatInZone } from '@totalmobi/shared';

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
): Promise<{ texto: string }> {
  const marcacao = await proximaMarcacao(client, tenantId, telefone, agora);

  if (!marcacao) {
    return { texto: 'Não encontrei nenhuma marcação futura no seu número. Quer marcar uma?' };
  }

  const r = await cancelBooking(client, marcacao.id, {
    reason: 'cancelado pelo cliente no WhatsApp',
    byCustomer: true,
  });

  if (!r.ok) {
    // A política da empresa pode recusar — prazo mínimo, por exemplo. Nesse
    // caso quem decide é uma pessoa, não o bot.
    return {
      texto: `Não consegui cancelar ${descreverMarcacao(marcacao)}. Vou pedir a um colega que trate disso.`,
    };
  }

  return {
    texto: `Cancelei ${descreverMarcacao(marcacao)}. Se precisar, é só dizer para marcar outra.`,
  };
}

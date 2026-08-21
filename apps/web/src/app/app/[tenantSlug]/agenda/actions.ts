'use server';

import { revalidatePath } from 'next/cache';

import { normalizePhone } from '@totalmobi/shared';

import { requireRole } from '@/lib/auth/context';

/**
 * As ações da agenda.
 *
 * Todas passam por `requireRole`. Ver a agenda é uma coisa — um profissional vê
 * a dele, e a RLS trata disso —, reorganizá-la é outra: mover a consulta de um
 * colega é decisão de quem gere a casa.
 */

export interface EstadoAgenda {
  ok?: boolean;
  erro?: string;
}

/** Códigos que as funções do M8/M10 levantam, traduzidos para quem está ao balcão. */
function explicar(codigo: string | undefined, mensagem: string): string {
  switch (codigo) {
    case '23P01':
      return 'Já há uma marcação nessa hora com esse profissional.';
    case 'P0003':
      return 'Essa hora está fora do horário de trabalho.';
    case 'P0005':
      return 'Essa marcação não pode ser movida no estado em que está.';
    case '42501':
      return 'Não tem permissão para reorganizar a agenda.';
    default:
      return mensagem || 'Não foi possível concluir a operação.';
  }
}

export async function moverMarcacao(
  tenantId: string,
  tenantSlug: string,
  bookingId: string,
  novoInicio: string,
  novoStaffId: string | null,
): Promise<EstadoAgenda> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para reorganizar a agenda.' };

  const { error } = await guard.value.client.rpc('move_booking', {
    p_booking_id: bookingId,
    p_new_start: novoInicio,
    ...(novoStaffId ? { p_new_staff: novoStaffId } : {}),
  });

  if (error) return { erro: explicar(error.code, error.message) };

  revalidatePath(`/app/${tenantSlug}/agenda`);
  return { ok: true };
}

export async function cancelarMarcacao(
  tenantId: string,
  tenantSlug: string,
  bookingId: string,
  motivo: string,
): Promise<EstadoAgenda> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para cancelar marcações.' };

  const { error } = await guard.value.client.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_reason: motivo,
    p_by_customer: false,
  });

  if (error) return { erro: explicar(error.code, error.message) };

  revalidatePath(`/app/${tenantSlug}/agenda`);
  return { ok: true };
}

export async function confirmarMarcacao(
  tenantId: string,
  tenantSlug: string,
  bookingId: string,
): Promise<EstadoAgenda> {
  const guard = await requireRole(tenantId, 'staff');
  if (!guard.ok) return { erro: 'Não tem permissão.' };

  const { error } = await guard.value.client.rpc('confirm_booking', {
    p_booking_id: bookingId,
  });

  if (error) return { erro: explicar(error.code, error.message) };

  revalidatePath(`/app/${tenantSlug}/agenda`);
  return { ok: true };
}

export interface MarcacaoDaAgenda {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  staff_id: string | null;
  staff_name: string | null;
  staff_color: string | null;
  service_id: string;
  service_name: string;
  service_color: string | null;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  occupies_slot: boolean;
}

/**
 * As marcações de um dia.
 *
 * Existe como ação além do carregamento do servidor porque o Realtime avisa que
 * algo mudou mas não diz o quê com detalhe suficiente para redesenhar — e
 * pedir o dia inteiro outra vez é mais barato e muito menos frágil do que
 * tentar aplicar cada evento à mão.
 */
export async function recarregarDia(
  tenantId: string,
  locationId: string,
  inicio: string,
  fim: string,
): Promise<{ marcacoes?: MarcacaoDaAgenda[]; erro?: string }> {
  const guard = await requireRole(tenantId, 'staff');
  if (!guard.ok) return { erro: 'Sem permissão.' };

  const { data, error } = await guard.value.client.rpc('agenda', {
    p_location_id: locationId,
    p_from: inicio,
    p_to: fim,
  });

  if (error) return { erro: error.message };

  return { marcacoes: data ?? [] };
}

/**
 * Criar uma marcação ao balcão.
 *
 * Passa pela **mesma** `create_booking_atomic` do caminho público. Um `insert`
 * direto seria mais rápido de escrever e saltaria a validação de horário, a
 * deduplicação de cliente e o registo de histórico — e a marcação feita ao
 * telefone é tão real como a feita online.
 *
 * A diferença é o `source: 'admin'` e o facto de a antecedência mínima não se
 * aplicar: quem está ao balcão está a marcar para agora, e é suposto.
 */
export async function criarNaAgenda(
  tenantId: string,
  tenantSlug: string,
  entrada: {
    locationId: string;
    serviceId: string;
    staffId: string | null;
    inicio: string;
    nome: string;
    telefone: string;
    notas?: string;
  },
): Promise<EstadoAgenda> {
  const guard = await requireRole(tenantId, 'staff');
  if (!guard.ok) return { erro: 'Sem permissão para criar marcações.' };

  if (entrada.nome.trim().length < 2) return { erro: 'Escreva o nome do cliente.' };

  const telefone = normalizePhone(entrada.telefone, 'PT');
  if (!telefone.ok) return { erro: 'Número de telemóvel inválido.' };

  const { error } = await guard.value.client.rpc('create_booking_atomic', {
    p_location_id: entrada.locationId,
    p_service_id: entrada.serviceId,
    p_start_at: entrada.inicio,
    p_customer: { firstName: entrada.nome.trim(), phone: telefone.value },
    p_source: 'admin',
    ...(entrada.staffId ? { p_staff_id: entrada.staffId } : {}),
    ...(entrada.notas?.trim() ? { p_notes: entrada.notas.trim() } : {}),
  });

  if (error) return { erro: explicar(error.code, error.message) };

  revalidatePath(`/app/${tenantSlug}/agenda`);
  return { ok: true };
}

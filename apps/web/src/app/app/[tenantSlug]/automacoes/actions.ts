'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { substituir } from '@totalmobi/notifications';

import { requireRole } from '@/lib/auth/context';

export interface EstadoAutomacoes {
  ok?: boolean;
  erro?: string;
}

const regraSchema = z.object({
  type: z.enum([
    'booking_created',
    'booking_confirmed',
    'reminder',
    'cancelled',
    'rescheduled',
    'no_show_followup',
  ]),
  channel: z.enum(['email']),
  // 0 = no momento do acontecimento. Até 30 dias antes.
  offsetMinutes: z.number().int().min(0).max(43200),
});

export async function guardarRegra(
  tenantId: string,
  tenantSlug: string,
  entrada: unknown,
): Promise<EstadoAutomacoes> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para alterar automações.' };

  const parsed = regraSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? 'Pedido inválido.' };

  const { error } = await guard.value.client.from('notification_rules').upsert(
    {
      tenant_id: tenantId,
      type: parsed.data.type,
      channel: parsed.data.channel,
      offset_minutes: parsed.data.offsetMinutes,
      is_active: true,
    },
    { onConflict: 'tenant_id,type,channel,offset_minutes' },
  );

  if (error) return { erro: `Não foi possível guardar: ${error.message}` };

  revalidatePath(`/app/${tenantSlug}/automacoes`);
  return { ok: true };
}

/**
 * Ligar e desligar em vez de apagar.
 *
 * Uma regra apagada leva consigo a razão por que existia. Desligada, fica lá
 * para quem vier a seguir perceber que alguém já pensou nisto — e volta a
 * ligar-se com um toque.
 */
export async function alternarRegra(
  tenantId: string,
  tenantSlug: string,
  regraId: string,
  activa: boolean,
): Promise<EstadoAutomacoes> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para alterar automações.' };

  const { error } = await guard.value.client
    .from('notification_rules')
    .update({ is_active: activa })
    .eq('id', regraId)
    .eq('tenant_id', tenantId);

  if (error) return { erro: `Não foi possível guardar: ${error.message}` };

  revalidatePath(`/app/${tenantSlug}/automacoes`);
  return { ok: true };
}

export async function alterarAntecedencia(
  tenantId: string,
  tenantSlug: string,
  regraId: string,
  minutos: number,
): Promise<EstadoAutomacoes> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para alterar automações.' };

  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 43200) {
    return { erro: 'Antecedência inválida.' };
  }

  const { error } = await guard.value.client
    .from('notification_rules')
    .update({ offset_minutes: minutos })
    .eq('id', regraId)
    .eq('tenant_id', tenantId);

  if (error) return { erro: `Não foi possível guardar: ${error.message}` };

  revalidatePath(`/app/${tenantSlug}/automacoes`);
  return { ok: true };
}

/**
 * Acrescentar um lembrete.
 *
 * Vários lembretes por empresa é o que o M15 traz: 72 h para preparar, 24 h
 * para lembrar, 2 h para apanhar quem se esqueceu. O índice único já os
 * distinguia pelo `offset_minutes`; faltava a interface deixar criar.
 */
export async function acrescentarLembrete(
  tenantId: string,
  tenantSlug: string,
  minutos: number,
): Promise<EstadoAutomacoes> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para alterar automações.' };

  if (!Number.isInteger(minutos) || minutos < 30 || minutos > 43200) {
    return { erro: 'A antecedência tem de estar entre 30 minutos e 30 dias.' };
  }

  const { error } = await guard.value.client.from('notification_rules').insert({
    tenant_id: tenantId,
    type: 'reminder',
    channel: 'email',
    offset_minutes: minutos,
    is_active: true,
  });

  if (error) {
    // O índice único a fazer o seu trabalho: já existe um lembrete a essa hora.
    if (error.code === '23505') return { erro: 'Já existe um lembrete com essa antecedência.' };
    return { erro: `Não foi possível guardar: ${error.message}` };
  }

  revalidatePath(`/app/${tenantSlug}/automacoes`);
  return { ok: true };
}

export async function removerRegra(
  tenantId: string,
  tenantSlug: string,
  regraId: string,
): Promise<EstadoAutomacoes> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Não tem permissão para alterar automações.' };

  const { error } = await guard.value.client
    .from('notification_rules')
    .delete()
    .eq('id', regraId)
    .eq('tenant_id', tenantId);

  if (error) return { erro: `Não foi possível remover: ${error.message}` };

  revalidatePath(`/app/${tenantSlug}/automacoes`);
  return { ok: true };
}

/**
 * Pré-visualizar a mensagem final.
 *
 * Com dados de exemplo, mas pelo **mesmo** compositor que envia a sério. Uma
 * pré-visualização escrita à parte mostra o que o programador imaginou; esta
 * mostra o que sai.
 */
export async function prever(
  tenantId: string,
  tipo: string,
): Promise<{ assunto?: string; corpo?: string; erro?: string }> {
  const guard = await requireRole(tenantId, 'staff');
  if (!guard.ok) return { erro: 'Sem permissão.' };

  // O tipo chega do browser como texto. Validar contra a lista fechada antes de
  // o usar numa consulta — não por causa de SQL (o cliente parametriza), mas
  // porque um tipo inventado devolveria "não há template" em vez de um erro
  // claro, e alguém perderia meia hora a perceber porquê.
  const tipoValido = regraSchema.shape.type.safeParse(tipo);
  if (!tipoValido.success) return { erro: 'Tipo de aviso desconhecido.' };

  const client = guard.value.client;

  const [{ data: template }, { data: tenant }, { data: unidade }] = await Promise.all([
    client
      .from('notification_templates')
      .select('subject, body, tenant_id')
      .eq('type', tipoValido.data)
      .eq('channel', 'email')
      .eq('is_active', true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      // O do tenant ganha ao da plataforma, tal como no envio.
      .order('tenant_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    client.from('tenants').select('display_name').eq('id', tenantId).maybeSingle(),
    client
      .from('locations')
      .select('name, address_line1, city, phone_e164, timezone')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!template) return { erro: 'Não há template para este aviso.' };

  const daqui = new Date(Date.now() + 36 * 3_600_000);

  const dados = {
    customerName: 'Sofia',
    tenantName: tenant?.display_name ?? 'A sua empresa',
    serviceName: 'Limpeza dentária',
    startAt: daqui.toISOString(),
    endAt: new Date(daqui.getTime() + 45 * 60_000).toISOString(),
    timezone: unidade?.timezone ?? 'Europe/Lisbon',
    staffName: 'Dra. Ana Martins',
    locationName: unidade?.name ?? null,
    locationAddress: [unidade?.address_line1, unidade?.city].filter(Boolean).join(', ') || null,
    locationPhone: unidade?.phone_e164 ?? null,
    manageUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/m/exemplo-de-link`,
    locale: 'pt-PT',
  };

  return {
    assunto: substituir(template.subject ?? '', dados),
    corpo: substituir(template.body, dados),
  };
}

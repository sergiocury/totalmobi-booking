'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { uuidSchema, wallTimeSchema, weekdaySchema } from '@totalmobi/shared';

import { requireRole } from '@/lib/auth/context';
import { writeAuditLog } from '@/lib/audit';

/**
 * Horários, exceções e ausências.
 *
 * Um período guarda-se como hora de parede (`HH:mm`) e nunca como instante:
 * "abro às 9" tem de continuar verdadeiro depois da mudança da hora. A
 * conversão acontece no motor, com o fuso da unidade.
 *
 * As ausências são o contrário — umas férias começam num instante concreto —
 * por isso chegam já como `timestamptz`.
 */

export type ScheduleState = { error?: string; ok?: boolean };

const periodoSchema = z
  .object({ startsAt: wallTimeSchema, endsAt: wallTimeSchema })
  .refine((p) => p.startsAt < p.endsAt, {
    message: 'A hora de fim tem de ser depois da de início',
    path: ['endsAt'],
  });

const diaSchema = z.object({
  weekday: weekdaySchema,
  periods: z.array(periodoSchema).max(6, 'No máximo 6 períodos por dia'),
});

/**
 * Substitui o horário semanal inteiro.
 *
 * Apaga e reinsere em vez de reconciliar linha a linha. É mais simples e, para
 * uma tabela com sete dias e meia dúzia de períodos, mais barato do que
 * descobrir o que mudou — e não deixa lixo quando alguém remove um período.
 */
export async function setLocationHours(
  tenantId: string,
  tenantSlug: string,
  locationId: string,
  dias: unknown,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para alterar horários.' };

  const id = uuidSchema.safeParse(locationId);
  const parsed = z.array(diaSchema).safeParse(dias);
  if (!id.success || !parsed.success) {
    return { error: parsed.success ? 'Unidade inválida.' : parsed.error.issues[0]!.message };
  }

  const sobreposto = encontrarSobreposicao(parsed.data);
  if (sobreposto) return { error: sobreposto };

  const client = guard.value.client;

  const { error: erroApagar } = await client
    .from('location_business_hours')
    .delete()
    .eq('location_id', id.data);

  if (erroApagar) return { error: `Não foi possível guardar: ${erroApagar.message}` };

  const linhas = parsed.data.flatMap((dia) =>
    dia.periods.map((p) => ({
      location_id: id.data,
      weekday: dia.weekday,
      opens_at: p.startsAt,
      closes_at: p.endsAt,
    })),
  );

  if (linhas.length > 0) {
    const { error } = await client.from('location_business_hours').insert(linhas);
    if (error) return { error: `Não foi possível guardar: ${error.message}` };
  }

  await writeAuditLog({
    tenantId,
    action: 'location_hours.updated',
    entity: 'location',
    entityId: id.data,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { periodos: linhas.length },
  });

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

export async function setStaffHours(
  tenantId: string,
  tenantSlug: string,
  staffId: string,
  locationId: string,
  dias: unknown,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para alterar horários.' };

  const staff = uuidSchema.safeParse(staffId);
  const location = uuidSchema.safeParse(locationId);
  const parsed = z.array(diaSchema).safeParse(dias);

  if (!staff.success || !location.success || !parsed.success) {
    return { error: parsed.success ? 'Pedido inválido.' : parsed.error.issues[0]!.message };
  }

  const sobreposto = encontrarSobreposicao(parsed.data);
  if (sobreposto) return { error: sobreposto };

  const client = guard.value.client;

  const { error: erroApagar } = await client
    .from('staff_working_hours')
    .delete()
    .eq('staff_id', staff.data)
    .eq('location_id', location.data);

  if (erroApagar) return { error: `Não foi possível guardar: ${erroApagar.message}` };

  const linhas = parsed.data.flatMap((dia) =>
    dia.periods.map((p) => ({
      staff_id: staff.data,
      location_id: location.data,
      weekday: dia.weekday,
      starts_at: p.startsAt,
      ends_at: p.endsAt,
    })),
  );

  if (linhas.length > 0) {
    const { error } = await client.from('staff_working_hours').insert(linhas);
    if (error) return { error: `Não foi possível guardar: ${error.message}` };

    // Dar horário a alguém numa unidade **é** colocá-lo nessa unidade.
    //
    // Sem isto ficavam duas fontes de verdade a discordar: a Ana tinha cinco
    // linhas de horário na Avenida e zero linhas em `staff_locations`, e o
    // motor de disponibilidade não a encontrava. Foi assim que o M7 deu com
    // isto. O `ignoreDuplicates` torna a operação idempotente — guardar o
    // horário duas vezes não é erro.
    const { error: erroLigacao } = await client
      .from('staff_locations')
      .upsert(
        { staff_id: staff.data, location_id: location.data },
        { onConflict: 'staff_id,location_id', ignoreDuplicates: true },
      );

    if (erroLigacao) {
      return { error: `Horário guardado, mas a ligação à unidade falhou: ${erroLigacao.message}` };
    }
  }

  await writeAuditLog({
    tenantId,
    action: 'staff_hours.updated',
    entity: 'staff',
    entityId: staff.data,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { periodos: linhas.length },
  });

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

/**
 * Períodos sobrepostos no mesmo dia.
 *
 * A base de dados não o impede — nada nas constraints diz que 09:00–13:00 e
 * 12:00–18:00 não podem coexistir. E o motor de disponibilidade funde-os sem
 * se queixar, o que faria a interface mostrar um horário que não é o que a
 * pessoa julga ter guardado. Mais vale recusar à entrada.
 */
function encontrarSobreposicao(dias: { weekday: number; periods: { startsAt: string; endsAt: string }[] }[]): string | null {
  const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  for (const dia of dias) {
    const ordenados = [...dia.periods].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    for (let i = 1; i < ordenados.length; i += 1) {
      // `HH:mm` compara-se lexicograficamente — uma das razões para guardar
      // assim em vez de minutos desde a meia-noite.
      if (ordenados[i]!.startsAt < ordenados[i - 1]!.endsAt) {
        return `Períodos sobrepostos em ${NOMES[dia.weekday]}: ${ordenados[i - 1]!.startsAt}–${ordenados[i - 1]!.endsAt} e ${ordenados[i]!.startsAt}–${ordenados[i]!.endsAt}.`;
      }
    }
  }

  return null;
}

// --- Exceções ----------------------------------------------------------------

const excecaoSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    kind: z.enum(['closed', 'open']),
    startsAt: wallTimeSchema.nullish(),
    endsAt: wallTimeSchema.nullish(),
    reason: z.string().max(200).nullish(),
    scope: z.enum(['tenant', 'location', 'staff']),
    targetId: uuidSchema.nullish(),
  })
  .refine((e) => e.kind !== 'open' || (e.startsAt && e.endsAt), {
    message: 'Uma abertura extraordinária precisa de horas',
    path: ['startsAt'],
  })
  .refine((e) => e.scope === 'tenant' || Boolean(e.targetId), {
    message: 'Escolha a unidade ou o profissional',
    path: ['targetId'],
  });

export async function createException(
  tenantId: string,
  tenantSlug: string,
  _previous: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const scope = String(formData.get('scope') ?? 'tenant');

  const parsed = excecaoSchema.safeParse({
    date: String(formData.get('date') ?? ''),
    kind: String(formData.get('kind') ?? 'closed'),
    startsAt: String(formData.get('startsAt') ?? '') || null,
    endsAt: String(formData.get('endsAt') ?? '') || null,
    reason: String(formData.get('reason') ?? '').trim() || null,
    scope,
    targetId: String(formData.get('targetId') ?? '') || null,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await guard.value.client.from('schedule_exceptions').insert({
    tenant_id: tenantId,
    scope_tenant: parsed.data.scope === 'tenant',
    location_id: parsed.data.scope === 'location' ? (parsed.data.targetId ?? null) : null,
    staff_id: parsed.data.scope === 'staff' ? (parsed.data.targetId ?? null) : null,
    date: parsed.data.date,
    kind: parsed.data.kind,
    starts_at: parsed.data.startsAt ?? null,
    ends_at: parsed.data.endsAt ?? null,
    reason: parsed.data.reason ?? null,
    created_by: guard.value.user.id,
  });

  if (error) return { error: `Não foi possível guardar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'schedule_exception.created',
    entity: 'schedule_exception',
    actorType: 'user',
    actorUserId: guard.value.user.id,
    newValues: { date: parsed.data.date, kind: parsed.data.kind, scope: parsed.data.scope },
  });

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

export async function deleteException(
  tenantId: string,
  tenantSlug: string,
  exceptionId: string,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const id = uuidSchema.safeParse(exceptionId);
  if (!id.success) return { error: 'Pedido inválido.' };

  const { error } = await guard.value.client
    .from('schedule_exceptions')
    .delete()
    .eq('id', id.data)
    .eq('tenant_id', tenantId);

  if (error) return { error: `Não foi possível remover: ${error.message}` };

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

// --- Ausências ---------------------------------------------------------------

const ausenciaSchema = z
  .object({
    staffId: uuidSchema,
    startsAt: z.string().min(1, 'Indique o início'),
    endsAt: z.string().min(1, 'Indique o fim'),
    kind: z.enum(['vacation', 'sick_leave', 'holiday', 'block', 'training', 'other']),
    reason: z.string().max(200).nullish(),
  })
  .refine((a) => new Date(a.endsAt) > new Date(a.startsAt), {
    message: 'O fim tem de ser depois do início',
    path: ['endsAt'],
  });

export async function createTimeOff(
  tenantId: string,
  tenantSlug: string,
  _previous: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const parsed = ausenciaSchema.safeParse({
    staffId: String(formData.get('staffId') ?? ''),
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
    kind: String(formData.get('kind') ?? 'vacation'),
    reason: String(formData.get('reason') ?? '').trim() || null,
  });

  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await guard.value.client.from('staff_time_off').insert({
    staff_id: parsed.data.staffId,
    starts_at: new Date(parsed.data.startsAt).toISOString(),
    ends_at: new Date(parsed.data.endsAt).toISOString(),
    kind: parsed.data.kind,
    reason: parsed.data.reason ?? null,
    created_by: guard.value.user.id,
    approved_by: guard.value.user.id,
  });

  if (error) {
    // 23P01 = exclusion_violation, a constraint que impede ausências
    // sobrepostas do mesmo profissional.
    if (error.code === '23P01') {
      return {
        error: 'Já existe uma ausência que se sobrepõe a este período para este profissional.',
      };
    }
    return { error: `Não foi possível guardar: ${error.message}` };
  }

  await writeAuditLog({
    tenantId,
    action: 'time_off.created',
    entity: 'staff',
    entityId: parsed.data.staffId,
    actorType: 'user',
    actorUserId: guard.value.user.id,
    // O motivo NÃO vai para o log: uma baixa médica é informação de saúde,
    // categoria especial do RGPD. O tipo e as datas chegam para auditar.
    newValues: { kind: parsed.data.kind, from: parsed.data.startsAt, to: parsed.data.endsAt },
  });

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

export async function deleteTimeOff(
  tenantId: string,
  tenantSlug: string,
  timeOffId: string,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const id = uuidSchema.safeParse(timeOffId);
  if (!id.success) return { error: 'Pedido inválido.' };

  const { error } = await guard.value.client.from('staff_time_off').delete().eq('id', id.data);

  if (error) return { error: `Não foi possível remover: ${error.message}` };

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

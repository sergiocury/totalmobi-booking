'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { alteracaoDoDia, semAlteracao, uuidSchema, wallTimeSchema, weekdaySchema } from '@totalmobi/shared';

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


// =============================================================================
// Alterar um dia numa semana futura
// =============================================================================

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

const alterarDiaSchema = z.object({
  date: dataSchema,
  /** O horário base efetivo desse dia, tal como a interface o mostrou. */
  base: z.array(periodoSchema).max(6),
  /** O que o utilizador quer que passe a ser. Vazio = não trabalha. */
  desejado: z.array(periodoSchema).max(6),
});

/**
 * "Só neste dia."
 *
 * Grava a **diferença** entre o horário base e o desejado, como exceções com o
 * âmbito do profissional. Porque é a diferença e não uma substituição, ver a
 * nota longa em `packages/shared/src/domain/alterar-dia.ts` — em resumo, o
 * `closed` de dia inteiro ganha sempre por segurança, e essa regra não se troca
 * por conveniência de escrita.
 *
 * Apaga primeiro as exceções que este profissional já tinha nesta data. Sem
 * isso, editar o mesmo dia duas vezes empilharia fechos contraditórios e o
 * resultado dependeria da ordem — que é exatamente o tipo de bug que só aparece
 * em produção, no dia em que alguém corrige um engano.
 */
export async function alterarDiaSo(
  tenantId: string,
  tenantSlug: string,
  staffId: string,
  locationId: string,
  entrada: unknown,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para alterar horários.' };

  const staff = uuidSchema.safeParse(staffId);
  const location = uuidSchema.safeParse(locationId);
  const parsed = alterarDiaSchema.safeParse(entrada);

  if (!staff.success || !location.success || !parsed.success) {
    return { error: parsed.success ? 'Pedido inválido.' : parsed.error.issues[0]!.message };
  }

  const alteracao = alteracaoDoDia(parsed.data.base, parsed.data.desejado);
  const client = guard.value.client;

  const { error: erroApagar } = await client
    .from('schedule_exceptions')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('staff_id', staff.data)
    .eq('date', parsed.data.date);

  if (erroApagar) return { error: `Não foi possível guardar: ${erroApagar.message}` };

  // Voltar ao normal é apagar as exceções e não gravar nada. Uma linha vazia
  // seria uma afirmação sem conteúdo.
  if (semAlteracao(alteracao)) {
    revalidatePath(`/app/${tenantSlug}/horarios`);
    return { ok: true };
  }

  interface LinhaExcecao {
    tenant_id: string;
    location_id: string;
    staff_id: string;
    scope_tenant: boolean;
    date: string;
    kind: 'closed' | 'open';
    starts_at: string | null;
    ends_at: string | null;
  }

  const linhas: LinhaExcecao[] = alteracao.fecharDiaInteiro
    ? [
        {
          tenant_id: tenantId,
          location_id: location.data,
          staff_id: staff.data,
          scope_tenant: false,
          date: parsed.data.date,
          kind: 'closed',
          starts_at: null,
          ends_at: null,
        },
      ]
    : [
        ...alteracao.fechar.map((p): LinhaExcecao => ({
          tenant_id: tenantId,
          location_id: location.data,
          staff_id: staff.data,
          scope_tenant: false,
          date: parsed.data.date,
          kind: 'closed',
          starts_at: p.startsAt,
          ends_at: p.endsAt,
        })),
        ...alteracao.abrir.map((p): LinhaExcecao => ({
          tenant_id: tenantId,
          location_id: location.data,
          staff_id: staff.data,
          scope_tenant: false,
          date: parsed.data.date,
          kind: 'open',
          starts_at: p.startsAt,
          ends_at: p.endsAt,
        })),
      ];

  const { error } = await client.from('schedule_exceptions').insert(linhas);
  if (error) return { error: `Não foi possível guardar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    actorUserId: guard.value.user.id,
    action: 'staff_schedule.day_override',
    entity: 'staff',
    entityId: staff.data,
    actorType: 'user',
    newValues: { date: parsed.data.date, excecoes: linhas.length },
  });

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

const partirDeSchema = z.object({
  /** A partir de que dia o novo padrão vale. `YYYY-MM-DD`. */
  from: dataSchema,
  dias: z.array(diaSchema).max(7),
});

/**
 * "A partir daqui, sempre."
 *
 * Não apaga o passado. Fecha o padrão em vigor com `valid_until` no dia
 * anterior e abre um novo com `valid_from` — que é o que permite responder
 * corretamente a "que horário tinha a Ana em março?" depois de ela mudar de
 * horário em abril.
 *
 * As colunas `valid_from` e `valid_until` existem desde o primeiro dia e o
 * motor já as respeita (`isHoursValidOn`). O que faltava era alguém escrevê-las:
 * das 214 linhas em base, zero as usavam. Era uma capacidade construída e nunca
 * ligada.
 */
export async function definirHorarioAPartirDe(
  tenantId: string,
  tenantSlug: string,
  staffId: string,
  locationId: string,
  entrada: unknown,
): Promise<ScheduleState> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { error: 'Não tem permissão para alterar horários.' };

  const staff = uuidSchema.safeParse(staffId);
  const location = uuidSchema.safeParse(locationId);
  const parsed = partirDeSchema.safeParse(entrada);

  if (!staff.success || !location.success || !parsed.success) {
    return { error: parsed.success ? 'Pedido inválido.' : parsed.error.issues[0]!.message };
  }

  const sobreposto = encontrarSobreposicao(parsed.data.dias);
  if (sobreposto) return { error: sobreposto };

  const client = guard.value.client;
  const vespera = new Date(`${parsed.data.from}T12:00:00Z`);
  vespera.setUTCDate(vespera.getUTCDate() - 1);
  const ate = vespera.toISOString().slice(0, 10);

  // O padrão que estava em vigor passa a acabar na véspera. Só os que ainda não
  // tinham fim — mexer nos que já têm seria reescrever história.
  const { error: erroFechar } = await client
    .from('staff_working_hours')
    .update({ valid_until: ate })
    .eq('staff_id', staff.data)
    .eq('location_id', location.data)
    .is('valid_until', null);

  if (erroFechar) return { error: `Não foi possível guardar: ${erroFechar.message}` };

  // Um padrão que já começava depois desta data seria substituído por este —
  // apaga-se, porque manter dois padrões a começar no mesmo dia é ambíguo.
  const { error: erroLimpar } = await client
    .from('staff_working_hours')
    .delete()
    .eq('staff_id', staff.data)
    .eq('location_id', location.data)
    .gte('valid_from', parsed.data.from);

  if (erroLimpar) return { error: `Não foi possível guardar: ${erroLimpar.message}` };

  const linhas = parsed.data.dias.flatMap((dia) =>
    dia.periods.map((p) => ({
      staff_id: staff.data,
      location_id: location.data,
      weekday: dia.weekday,
      starts_at: p.startsAt,
      ends_at: p.endsAt,
      valid_from: parsed.data.from,
      valid_until: null,
    })),
  );

  if (linhas.length > 0) {
    const { error } = await client.from('staff_working_hours').insert(linhas);
    if (error) return { error: `Não foi possível guardar: ${error.message}` };
  }

  await writeAuditLog({
    tenantId,
    actorUserId: guard.value.user.id,
    action: 'staff_schedule.pattern_from',
    entity: 'staff',
    entityId: staff.data,
    actorType: 'user',
    newValues: { from: parsed.data.from, periodos: linhas.length },
  });

  revalidatePath(`/app/${tenantSlug}/horarios`);
  return { ok: true };
}

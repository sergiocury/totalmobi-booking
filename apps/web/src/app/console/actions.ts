'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createTenantSchema, isReservedSlug, uuidSchema } from '@totalmobi/shared';
import { createServiceClient } from '@totalmobi/database/server';

import { requirePlatformAdmin } from '@/lib/auth/context';
import { writeAuditLog } from '@/lib/audit';

/**
 * Ações da consola da plataforma.
 *
 * DUAS REGRAS QUE VALEM PARA TODAS
 *
 * 1. **`requirePlatformAdmin()` na primeira linha útil.** Estas ações correm
 *    com `service_role`, que contorna a RLS por completo — a base de dados já
 *    não está lá para as travar. A guarda é a única coisa entre um pedido
 *    qualquer e a criação de uma empresa.
 *
 * 2. **Tudo fica no audit log.** Criar, suspender e mexer em funcionalidades
 *    são decisões comerciais com consequências para um cliente que paga. Seis
 *    meses depois, "quem desligou o WhatsApp da Clínica Sorriso e quando" tem
 *    de ter resposta.
 */

export type ActionState = { error?: string; ok?: boolean; tenantId?: string };

const statusSchema = z.enum(['trial', 'active', 'past_due', 'suspended', 'cancelled']);
const featureKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);

export async function createTenant(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: 'Não tem permissão para criar empresas.' };

  const parsed = createTenantSchema.safeParse({
    slug: String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase(),
    displayName: String(formData.get('displayName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    segment: formData.get('segment') || undefined,
    planCode: formData.get('planCode') || undefined,
    defaultTimezone: formData.get('defaultTimezone') || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join('.')}: ${first.message}` : 'Dados inválidos.' };
  }

  // A base de dados também recusa (trigger `tenants_check_slug`), mas apanhar
  // aqui dá uma mensagem que explica em vez de um erro de constraint.
  if (isReservedSlug(parsed.data.slug)) {
    return { error: `O identificador "${parsed.data.slug}" está reservado pela plataforma.` };
  }

  const client = createServiceClient();

  const { data, error } = await client
    .from('tenants')
    .insert({
      slug: parsed.data.slug,
      display_name: parsed.data.displayName,
      email: parsed.data.email,
      segment: parsed.data.segment,
      plan_code: parsed.data.planCode,
      default_timezone: parsed.data.defaultTimezone,
      default_locale: parsed.data.defaultLocale,
      default_currency: parsed.data.defaultCurrency,
      country_code: parsed.data.countryCode,
      status: 'trial',
      created_by: guard.value.user.id,
    })
    .select('id, slug, code')
    .single();

  if (error || !data) {
    // 23505 = violação de unicidade. O slug é o único candidato provável.
    if (error?.code === '23505') {
      return { error: `Já existe uma empresa com o identificador "${parsed.data.slug}".` };
    }
    return { error: `Não foi possível criar a empresa: ${error?.message ?? 'erro desconhecido'}` };
  }

  await writeAuditLog({
    tenantId: data.id,
    action: 'tenant.created',
    entity: 'tenant',
    entityId: data.id,
    actorType: 'platform_admin',
    actorUserId: guard.value.user.id,
    actorLabel: guard.value.user.email,
    newValues: { slug: data.slug, code: data.code, plan: parsed.data.planCode },
    source: 'console',
  });

  revalidatePath('/console');
  return { ok: true, tenantId: data.id };
}

export async function setTenantStatus(
  tenantId: string,
  status: string,
  reason?: string,
): Promise<ActionState> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const id = uuidSchema.safeParse(tenantId);
  const next = statusSchema.safeParse(status);
  if (!id.success || !next.success) return { error: 'Pedido inválido.' };

  const client = createServiceClient();

  const { data: before } = await client
    .from('tenants')
    .select('status, display_name, custom_domain')
    .eq('id', id.data)
    .maybeSingle();

  if (!before) return { error: 'Empresa não encontrada.' };

  // A constraint `tenants_domain_requires_active` recusa suspender uma empresa
  // com domínio próprio ativo. Explicar antes de tentar poupa um erro de
  // constraint que ninguém percebe.
  if (before.custom_domain && (next.data === 'suspended' || next.data === 'cancelled')) {
    return {
      error: `A ${before.display_name} tem o domínio ${before.custom_domain} ativo. Remova o domínio antes de suspender.`,
    };
  }

  const { error } = await client
    .from('tenants')
    .update({
      status: next.data,
      suspended_at: next.data === 'suspended' ? new Date().toISOString() : null,
      suspension_reason: next.data === 'suspended' ? (reason ?? null) : null,
    })
    .eq('id', id.data);

  if (error) return { error: `Não foi possível alterar o estado: ${error.message}` };

  await writeAuditLog({
    tenantId: id.data,
    action: next.data === 'suspended' ? 'tenant.suspended' : 'tenant.status_changed',
    entity: 'tenant',
    entityId: id.data,
    actorType: 'platform_admin',
    actorUserId: guard.value.user.id,
    actorLabel: guard.value.user.email,
    oldValues: { status: before.status },
    newValues: { status: next.data, reason: reason ?? null },
    source: 'console',
  });

  revalidatePath('/console');
  revalidatePath(`/console/${id.data}`);
  return { ok: true };
}

/**
 * Liga, desliga ou devolve ao plano uma funcionalidade.
 *
 * `enabled: null` **apaga** a linha em vez de gravar `false`. São estados
 * diferentes: `false` é "desligado à mão, contra o plano"; ausência é "vale o
 * que o plano disser". Confundi-los faria uma empresa manter-se sem WhatsApp
 * depois de subir para um plano que o inclui.
 */
export async function setTenantFeature(
  tenantId: string,
  featureKey: string,
  enabled: boolean | null,
): Promise<ActionState> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: 'Não tem permissão.' };

  const id = uuidSchema.safeParse(tenantId);
  const key = featureKeySchema.safeParse(featureKey);
  if (!id.success || !key.success) return { error: 'Pedido inválido.' };

  const client = createServiceClient();

  if (enabled === null) {
    await client
      .from('tenant_features')
      .delete()
      .eq('tenant_id', id.data)
      .eq('feature_key', key.data);
  } else {
    const { error } = await client.from('tenant_features').upsert(
      {
        tenant_id: id.data,
        feature_key: key.data,
        enabled,
        created_by: guard.value.user.id,
      },
      { onConflict: 'tenant_id,feature_key' },
    );

    if (error) return { error: `Não foi possível gravar: ${error.message}` };
  }

  await writeAuditLog({
    tenantId: id.data,
    action: 'tenant.feature_changed',
    entity: 'tenant_feature',
    entityId: key.data,
    actorType: 'platform_admin',
    actorUserId: guard.value.user.id,
    actorLabel: guard.value.user.email,
    newValues: { feature: key.data, enabled },
    source: 'console',
  });

  revalidatePath(`/console/${id.data}`);
  return { ok: true };
}

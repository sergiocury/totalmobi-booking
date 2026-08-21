'use server';

import { redirect } from 'next/navigation';

import { uuidSchema } from '@totalmobi/shared';
import { createServiceClient } from '@totalmobi/database/server';

import { requirePlatformAdmin } from '@/lib/auth/context';
import { getViewingTenant, startViewing, stopViewing } from '@/lib/auth/impersonation';
import { writeAuditLog } from '@/lib/audit';

/**
 * Entrar e sair do painel de uma empresa, com registo dos dois momentos.
 *
 * O par início/fim é o que torna o registo útil. Só o início responde a "quem
 * entrou"; o par responde a "durante quanto tempo esteve lá dentro" — que é a
 * pergunta que um cliente faz quando quer saber o que a Totalmobi andou a ver
 * na conta dele.
 */

export async function enterTenant(tenantId: string): Promise<void> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) redirect('/console');

  const id = uuidSchema.safeParse(tenantId);
  if (!id.success) redirect('/console');

  const client = createServiceClient();
  const { data: tenant } = await client
    .from('tenants')
    .select('slug, display_name')
    .eq('id', id.data)
    .maybeSingle();

  if (!tenant) redirect('/console');

  await startViewing(id.data);

  await writeAuditLog({
    tenantId: id.data,
    action: 'platform.tenant_access_started',
    entity: 'tenant',
    entityId: id.data,
    actorType: 'platform_admin',
    actorUserId: guard.value.user.id,
    actorLabel: guard.value.user.email,
    newValues: { tenant: tenant.display_name },
    source: 'console',
  });

  redirect(`/app/${tenant.slug}`);
}

export async function exitTenant(): Promise<void> {
  const guard = await requirePlatformAdmin();
  const viewing = await getViewingTenant();

  if (guard.ok && viewing) {
    const decorridoMs = Date.now() - Date.parse(viewing.startedAt);

    await writeAuditLog({
      tenantId: viewing.tenantId,
      action: 'platform.tenant_access_ended',
      entity: 'tenant',
      entityId: viewing.tenantId,
      actorType: 'platform_admin',
      actorUserId: guard.value.user.id,
      actorLabel: guard.value.user.email,
      newValues: {
        startedAt: viewing.startedAt,
        durationSeconds: Math.round(decorridoMs / 1000),
      },
      source: 'console',
    });
  }

  await stopViewing();
  redirect('/console');
}

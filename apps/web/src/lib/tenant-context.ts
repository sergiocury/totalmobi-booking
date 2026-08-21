import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import type { MemberRole } from '@totalmobi/shared';

import { getAuthContext, requireTenantAccess } from '@/lib/auth/context';
import { resolveTenantIdForAudit } from '@/lib/auth/deny';
import { writeAuditLog } from '@/lib/audit';

/**
 * Resolve o tenant de um URL `/app/<slug>/…` e valida o acesso.
 *
 * Existe para não repetir a mesma sequência de sete passos em cada página do
 * painel. Repetida à mão, mais cedo ou mais tarde uma página esquece-se de um
 * passo — e o passo esquecido é sempre o registo da recusa ou a verificação do
 * estado suspenso.
 *
 * Devolve `null` quando o acesso é negado. Quem chama mostra o ecrã de recusa;
 * o registo já foi escrito aqui.
 */

export interface TenantPageContext {
  tenantId: string;
  tenantSlug: string;
  displayName: string;
  status: string;
  planCode: string;
  defaultTimezone: string;
  role: MemberRole | null;
  isPlatformAdmin: boolean;
  client: Awaited<ReturnType<typeof getAuthContext>> extends null
    ? never
    : NonNullable<Awaited<ReturnType<typeof getAuthContext>>>['client'];
}

export const loadTenantPage = cache(
  async (tenantSlug: string): Promise<TenantPageContext | null> => {
    const context = await getAuthContext();

    if (!context) {
      redirect(`/login?proximo=/app/${tenantSlug}`);
    }

    const { data: tenant } = await context.client
      .from('tenants')
      .select('id, slug, display_name, status, plan_code, default_timezone')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (!tenant) {
      const auditedTenantId = await resolveTenantIdForAudit(tenantSlug);

      await writeAuditLog({
        ...(auditedTenantId ? { tenantId: auditedTenantId } : {}),
        action: 'auth.access_denied',
        entity: 'tenant',
        entityId: auditedTenantId ?? tenantSlug,
        actorType: 'user',
        actorUserId: context.user.id,
        newValues: {
          reason: auditedTenantId ? 'NO_MEMBERSHIP' : 'TENANT_NOT_FOUND',
          path: `/app/${tenantSlug}`,
        },
      });

      return null;
    }

    const access = await requireTenantAccess(tenant.id);

    if (!access.ok) {
      await writeAuditLog({
        tenantId: tenant.id,
        action: 'auth.access_denied',
        entity: 'tenant',
        entityId: tenant.id,
        actorType: 'user',
        actorUserId: context.user.id,
        newValues: { reason: access.error.code, path: `/app/${tenantSlug}` },
      });

      return null;
    }

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      displayName: tenant.display_name,
      status: tenant.status,
      planCode: tenant.plan_code,
      defaultTimezone: tenant.default_timezone,
      role: access.value.role,
      isPlatformAdmin: access.value.isPlatformAdmin,
      client: context.client,
    };
  },
);

/** Pode gerir o catálogo? `manager` chega; `staff` não. */
export function canManage(context: TenantPageContext): boolean {
  return (
    context.isPlatformAdmin || context.role === 'manager' || context.role === 'tenant_admin'
  );
}

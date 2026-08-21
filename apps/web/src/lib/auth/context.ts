import 'server-only';

import { cache } from 'react';

import {
  DomainErrorCode,
  domainError,
  err,
  ok,
  type DomainError,
  type MemberRole,
  type Result,
} from '@totalmobi/shared';
import type { BookingClient } from '@totalmobi/database';

import { getSessionClient } from '@/lib/supabase/server';

/**
 * Contexto de autenticação e autorização de um pedido.
 *
 * Tudo aqui é envolvido em `cache()` do React: dentro do mesmo pedido, dez
 * componentes podem pedir o utilizador e só há uma ida à base de dados. Sem
 * isso, uma página do painel com dez guardas faria dez chamadas idênticas.
 */

export interface AuthUser {
  readonly id: string;
  readonly email: string;
}

export interface TenantAccess {
  readonly tenantId: string;
  readonly role: MemberRole;
  /** Vazio significa todas as unidades do tenant. */
  readonly locationIds: readonly string[];
  readonly staffId: string | null;
}

export interface AuthContext {
  readonly user: AuthUser;
  readonly client: BookingClient;
  readonly isPlatformAdmin: boolean;
  readonly memberships: readonly TenantAccess[];
}

/** Utilizador da sessão, ou `null`. Não decide nada sobre autorização. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const client = await getSessionClient();

  // `getUser()` e não `getSession()`: o primeiro valida o JWT contra o servidor
  // do Supabase, o segundo confia no cookie. Num Server Component, o cookie é
  // input do utilizador e não se confia em input do utilizador.
  const { data, error } = await client.auth.getUser();

  if (error || !data.user?.email) return null;

  return { id: data.user.id, email: data.user.email };
});

/**
 * Contexto completo: quem é, a que tenants pertence, e se é admin da
 * plataforma.
 *
 * As duas leituras seguem por RLS com a sessão do próprio utilizador — nunca
 * com `service_role`. Se as políticas estiverem erradas, isto devolve menos do
 * que devia, e não mais.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const client = await getSessionClient();

  const [membershipResult, adminResult] = await Promise.all([
    client
      .from('memberships')
      .select('tenant_id, role, location_ids, staff_id')
      .is('archived_at', null)
      .not('accepted_at', 'is', null),
    client.rpc('is_platform_admin'),
  ]);

  const memberships: TenantAccess[] = (membershipResult.data ?? []).map((row) => ({
    tenantId: row.tenant_id,
    role: row.role,
    locationIds: row.location_ids ?? [],
    staffId: row.staff_id,
  }));

  return {
    user,
    client,
    isPlatformAdmin: adminResult.data === true,
    memberships,
  };
});

// --- Guardas -----------------------------------------------------------------
//
// Devolvem `Result` em vez de lançar. Uma Server Action que recebe um pedido
// não autorizado tem de responder com uma mensagem útil, não com um stack
// trace — e o compilador obriga a tratar o caso.

export async function requireUser(): Promise<Result<AuthContext, DomainError>> {
  const context = await getAuthContext();

  if (!context) {
    return err(
      domainError(DomainErrorCode.NOT_AUTHENTICATED, 'Pedido sem sessão iniciada'),
    );
  }

  return ok(context);
}

export interface TenantContext extends AuthContext {
  readonly tenantId: string;
  readonly role: MemberRole | null;
  readonly access: TenantAccess | null;
}

/**
 * Exige acesso a um tenant concreto.
 *
 * O administrador de plataforma passa sem membership — é o caso do
 * `/console` e da impersonation. Mas passa com `role: null` e `access: null`,
 * o que obriga quem chama a distinguir "é admin da Totalmobi" de "é membro
 * desta empresa". As duas coisas dão permissões diferentes.
 */
export async function requireTenantAccess(
  tenantId: string,
): Promise<Result<TenantContext, DomainError>> {
  const base = await requireUser();
  if (!base.ok) return base;

  const context = base.value;
  const access = context.memberships.find((m) => m.tenantId === tenantId) ?? null;

  if (!access && !context.isPlatformAdmin) {
    return err(
      domainError(
        DomainErrorCode.NO_MEMBERSHIP,
        `Utilizador ${context.user.id} sem membership no tenant ${tenantId}`,
        { details: { tenantId } },
      ),
    );
  }

  return ok({
    ...context,
    tenantId,
    role: access?.role ?? null,
    access,
  });
}

const ROLE_RANK: Record<MemberRole, number> = { staff: 1, manager: 2, tenant_admin: 3 };

/** Exige um papel mínimo no tenant. O admin de plataforma passa sempre. */
export async function requireRole(
  tenantId: string,
  minimum: MemberRole,
): Promise<Result<TenantContext, DomainError>> {
  const result = await requireTenantAccess(tenantId);
  if (!result.ok) return result;

  const context = result.value;
  if (context.isPlatformAdmin) return ok(context);

  if (!context.role || ROLE_RANK[context.role] < ROLE_RANK[minimum]) {
    return err(
      domainError(
        DomainErrorCode.NOT_AUTHORIZED,
        `Requer ${minimum}; o utilizador é ${context.role ?? 'sem papel'}`,
        { details: { tenantId, required: minimum, actual: context.role } },
      ),
    );
  }

  return ok(context);
}

export async function requirePlatformAdmin(): Promise<Result<AuthContext, DomainError>> {
  const base = await requireUser();
  if (!base.ok) return base;

  if (!base.value.isPlatformAdmin) {
    return err(
      domainError(
        DomainErrorCode.NOT_AUTHORIZED,
        `Utilizador ${base.value.user.id} não é administrador da plataforma`,
      ),
    );
  }

  return base;
}

/**
 * A unidade está dentro do âmbito do utilizador?
 *
 * `location_ids` vazio significa todas as unidades. Um staff com unidades
 * atribuídas só vê essas.
 */
export function canAccessLocation(access: TenantAccess | null, locationId: string): boolean {
  if (!access) return false;
  if (access.locationIds.length === 0) return true;
  return access.locationIds.includes(locationId);
}

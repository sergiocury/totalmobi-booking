import {
  DomainErrorCode,
  domainError,
  err,
  fromPostgresError,
  ok,
  type DomainError,
  type Result,
} from '@totalmobi/shared';

import type { BookingClient } from '../client/anon';
import type {
  LocationRow,
  PublicTenantRow,
  TenantBrandingRow,
  TenantPoliciesRow,
} from '../types/rows';

/**
 * Leitura de tenants.
 *
 * Repare-se no que **não** está aqui: nenhum `.eq('tenant_id', …)` acrescentado
 * à mão para "garantir" o isolamento. O isolamento é da RLS. Filtrar no cliente
 * daria a sensação de segurança sem a ter — e no dia em que alguém escrevesse
 * uma consulta nova sem o filtro, o buraco abria-se em silêncio.
 */

export interface PublicTenantProfile {
  tenant: PublicTenantRow;
  branding: TenantBrandingRow;
  policies: TenantPoliciesRow;
  locations: LocationRow[];
}

/** Perfil público de um tenant, a partir do slug. Usar com o cliente anónimo. */
export async function getPublicTenantBySlug(
  client: BookingClient,
  slug: string,
): Promise<Result<PublicTenantProfile, DomainError>> {
  const { data: tenant, error } = await client
    .from('tenants')
    .select(
      'id, slug, code, display_name, segment, status, plan_code, website, country_code, default_timezone, default_locale, default_currency, custom_domain, archived_at',
    )
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return err(fromPostgresError(error.code, error.message));
  }

  // A RLS já filtrou tenants suspensos e arquivados. Chegar aqui sem linha
  // significa "não existe" ou "não é público" — e a distinção não deve ser
  // revelada a quem pergunta.
  if (!tenant) {
    return err(
      domainError(DomainErrorCode.TENANT_NOT_FOUND, `Tenant não encontrado: ${slug}`, {
        details: { slug },
      }),
    );
  }

  const [brandingResult, policiesResult, locationsResult] = await Promise.all([
    client.from('tenant_branding').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    client.from('tenant_policies').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    client
      .from('locations')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true }),
  ]);

  if (!brandingResult.data || !policiesResult.data) {
    // O trigger `tenants_seed_defaults` cria ambos com o tenant. Não existirem
    // significa que alguém os apagou à mão — é um erro de dados, não um caso
    // de utilização a tratar com um valor por omissão silencioso.
    return err(
      domainError(
        DomainErrorCode.UNEXPECTED,
        `Tenant ${slug} sem branding ou políticas: dados inconsistentes`,
      ),
    );
  }

  return ok({
    tenant,
    branding: brandingResult.data,
    policies: policiesResult.data,
    locations: locationsResult.data ?? [],
  });
}

/** Tenants a que o utilizador da sessão pertence. Usar com o cliente de sessão. */
export async function listMyTenants(
  client: BookingClient,
): Promise<Result<PublicTenantRow[], DomainError>> {
  const { data, error } = await client
    .from('tenants')
    .select(
      'id, slug, code, display_name, segment, status, plan_code, website, country_code, default_timezone, default_locale, default_currency, custom_domain, archived_at',
    )
    .order('display_name', { ascending: true });

  if (error) {
    return err(fromPostgresError(error.code, error.message));
  }

  return ok(data ?? []);
}

/** O utilizador da sessão é administrador da plataforma? */
export async function isPlatformAdmin(client: BookingClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_platform_admin');
  return !error && data === true;
}

/**
 * Funcionalidades ativas de um tenant.
 *
 * `tenant_features` sobrepõe-se a `plan_features`: liga o que o plano não
 * inclui (piloto comercial) e desliga o que incluiria.
 */
export async function getEnabledFeatures(
  client: BookingClient,
  tenantId: string,
  planCode: string,
): Promise<Result<Set<string>, DomainError>> {
  const [planResult, overrideResult] = await Promise.all([
    client.from('plan_features').select('feature_key').eq('plan_code', planCode),
    client.from('tenant_features').select('feature_key, enabled').eq('tenant_id', tenantId),
  ]);

  if (planResult.error) {
    return err(fromPostgresError(planResult.error.code, planResult.error.message));
  }

  const features = new Set<string>((planResult.data ?? []).map((r) => r.feature_key));

  for (const override of overrideResult.data ?? []) {
    if (override.enabled) {
      features.add(override.feature_key);
    } else {
      features.delete(override.feature_key);
    }
  }

  return ok(features);
}

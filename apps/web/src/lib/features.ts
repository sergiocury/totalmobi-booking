import 'server-only';

import { cache } from 'react';

import { describeFeatures, resolveFeatures, type FeatureState } from '@totalmobi/shared';
import { createServiceClient } from '@totalmobi/database/server';

/**
 * Carregamento das funcionalidades de um tenant.
 *
 * Lê com `service_role` de propósito: as funcionalidades de uma empresa não são
 * um segredo dela, são configuração da plataforma, e o `/console` precisa de as
 * ver para todas. A decisão de quem pode chamar isto está nas guardas de quem
 * chama, não aqui.
 *
 * `cache()` do React para que dez componentes na mesma página não façam dez
 * idas à base de dados.
 */

export const getTenantFeatures = cache(async (tenantId: string): Promise<Set<string>> => {
  const client = createServiceClient();

  const { data: tenant } = await client
    .from('tenants')
    .select('plan_code')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant) return new Set();

  const [plan, overrides] = await Promise.all([
    client.from('plan_features').select('feature_key').eq('plan_code', tenant.plan_code),
    client.from('tenant_features').select('feature_key, enabled').eq('tenant_id', tenantId),
  ]);

  return resolveFeatures(
    (plan.data ?? []).map((r) => r.feature_key),
    (overrides.data ?? []).map((r) => ({ featureKey: r.feature_key, enabled: r.enabled })),
  );
});

/**
 * A funcionalidade está ativa para este tenant?
 *
 * **Nunca escrever `if (plan === 'premium')`.** Os planos mudam com a área
 * comercial e as funcionalidades com o produto — e não ao mesmo tempo. Um `if`
 * sobre o nome do plano transforma cada alteração de preçário numa alteração
 * de código.
 */
export async function hasFeature(tenantId: string, feature: string): Promise<boolean> {
  return (await getTenantFeatures(tenantId)).has(feature);
}

/** Estado detalhado, para a consola explicar de onde vem cada valor. */
export const getFeatureStates = cache(async (tenantId: string): Promise<FeatureState[]> => {
  const client = createServiceClient();

  const [{ data: tenant }, { data: allFeatures }] = await Promise.all([
    client.from('tenants').select('plan_code').eq('id', tenantId).maybeSingle(),
    client.from('features').select('key'),
  ]);

  if (!tenant) return [];

  const [plan, overrides] = await Promise.all([
    client.from('plan_features').select('feature_key').eq('plan_code', tenant.plan_code),
    client.from('tenant_features').select('feature_key, enabled').eq('tenant_id', tenantId),
  ]);

  return describeFeatures(
    (allFeatures ?? []).map((f) => f.key),
    (plan.data ?? []).map((r) => r.feature_key),
    (overrides.data ?? []).map((r) => ({ featureKey: r.feature_key, enabled: r.enabled })),
  );
});

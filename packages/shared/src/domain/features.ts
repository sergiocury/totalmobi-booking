import type { FeatureKey } from '../constants';

/**
 * Resolução de funcionalidades por tenant.
 *
 * Duas fontes, com precedências diferentes:
 *
 * · `plan_features`   — o que o plano contratado inclui.
 * · `tenant_features` — sobreposição por empresa. Liga o que o plano não inclui
 *                       (piloto, cortesia comercial) ou desliga o que incluiria
 *                       (cliente que pediu para não ter WhatsApp).
 *
 * A sobreposição ganha sempre, **incluindo quando desliga**. Um `enabled: false`
 * não é o mesmo que "não há linha": é uma decisão explícita de tirar. Tratar os
 * dois casos como iguais faria o produto reativar sozinho aquilo que alguém
 * desligou de propósito.
 *
 * Lógica pura: recebe o que já foi lido da base de dados. Ver
 * `apps/web/src/lib/features.ts` para o carregamento.
 */

export interface FeatureOverride {
  readonly featureKey: string;
  readonly enabled: boolean;
}

export function resolveFeatures(
  planFeatures: readonly string[],
  overrides: readonly FeatureOverride[],
): Set<string> {
  const resolved = new Set<string>(planFeatures);

  for (const override of overrides) {
    if (override.enabled) {
      resolved.add(override.featureKey);
    } else {
      resolved.delete(override.featureKey);
    }
  }

  return resolved;
}

/**
 * Estado de uma funcionalidade, para a consola poder explicar **porquê**.
 *
 * A consola não mostra só um interruptor ligado ou desligado: mostra se o valor
 * vem do plano ou de uma decisão manual. Sem isso, ninguém percebe porque é que
 * dois clientes no mesmo plano têm funcionalidades diferentes — e a resposta
 * fica escondida numa linha de base de dados que só se vê por SQL.
 */
export type FeatureSource = 'plan' | 'override_on' | 'override_off';

export interface FeatureState {
  readonly key: string;
  readonly enabled: boolean;
  readonly source: FeatureSource;
  /** O plano incluiria esta funcionalidade, independentemente da sobreposição? */
  readonly inPlan: boolean;
}

export function describeFeatures(
  allKeys: readonly string[],
  planFeatures: readonly string[],
  overrides: readonly FeatureOverride[],
): FeatureState[] {
  const plan = new Set(planFeatures);
  const byKey = new Map(overrides.map((o) => [o.featureKey, o.enabled]));

  return allKeys.map((key) => {
    const override = byKey.get(key);
    const inPlan = plan.has(key);

    if (override === undefined) {
      return { key, enabled: inPlan, source: 'plan' as const, inPlan };
    }

    return {
      key,
      enabled: override,
      source: override ? ('override_on' as const) : ('override_off' as const),
      inPlan,
    };
  });
}

/** Etiquetas para a consola. Chave desconhecida devolve a própria chave. */
export const FEATURE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  chatbot_ai: 'Chatbot com IA',
  voice: 'Assistente de voz',
  multi_location: 'Múltiplas unidades',
  resources: 'Salas e equipamentos',
  payments: 'Pagamentos',
  advanced_reports: 'Relatórios avançados',
  custom_domain: 'Domínio próprio',
  api_access: 'Acesso à API',
  waitlist: 'Lista de espera',
  group_sessions: 'Sessões de grupo',
  widget: 'Widget para website',
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key;
}

export function isFeatureKey(value: string): value is FeatureKey {
  return value in FEATURE_LABELS;
}

import 'server-only';

import { createServiceClient } from '@totalmobi/database/server';

/**
 * Resolve um slug para `tenant_id`, **apenas para escrever no audit log**.
 *
 * Usa `service_role`, que contorna a RLS. Isso exige justificação, e a
 * justificação é esta: quando a RLS esconde o tenant, a aplicação deixa de
 * saber se o slug existe — e sem isso não consegue distinguir, no registo,
 * «alguém tentou entrar numa empresa que existe e não é dele» de «alguém
 * escreveu um slug ao calhas». A primeira hipótese é a que interessa detetar.
 *
 * As três regras que tornam isto seguro:
 *
 * 1. **Devolve um id e mais nada.** Nem nome, nem estado, nem configuração.
 * 2. **O valor nunca chega ao ecrã.** Vai para o `audit_logs` e morre aí. A
 *    página que o utilizador vê é idêntica exista o tenant ou não — é o que
 *    impede que isto se transforme num verificador de empresas.
 * 3. **Só é chamada no caminho de recusa.** Nunca no caminho normal, onde a
 *    RLS já fez o trabalho como deve ser.
 */
export async function resolveTenantIdForAudit(slug: string): Promise<string | null> {
  try {
    const client = createServiceClient();
    const { data } = await client.from('tenants').select('id').eq('slug', slug).maybeSingle();
    return data?.id ?? null;
  } catch {
    // Um log incompleto é melhor do que uma página que rebenta.
    return null;
  }
}

import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types';
import { CLIENT_OPTIONS } from './config';
import type { BookingClient } from './anon';

/**
 * Cliente com `service_role`. **Contorna a RLS por completo.**
 *
 * `import 'server-only'` no topo é a defesa: se um componente de cliente
 * importar este módulo, o build do Next falha. Não é disciplina humana, é o
 * empacotador a recusar.
 *
 * Regras de uso, sem exceções:
 *
 *  1. Só em webhooks, workers e ações de plataforma que precisem mesmo de ver
 *     através dos tenants.
 *  2. Quem chama valida a autorização à mão. A RLS já não está lá para ajudar —
 *     uma consulta esquecida sem `eq('tenant_id', …)` devolve tudo, de toda a
 *     gente.
 *  3. Nunca para servir um pedido de um utilizador do painel. Nesse caso usa-se
 *     a sessão dele e deixa-se a RLS trabalhar.
 */
export function createServiceClient(): BookingClient {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !serviceKey) {
    throw new Error(
      'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.',
    );
  }

  return createClient<Database, 'booking'>(url, serviceKey, {
    ...CLIENT_OPTIONS,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

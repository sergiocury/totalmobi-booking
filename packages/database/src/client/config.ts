/**
 * Configuração partilhada por todos os clientes Supabase.
 *
 * O `db.schema` é a razão de este ficheiro existir: este projeto vive no schema
 * `booking`, não no `public`. Um cliente que se esqueça disto lê o Totalmobi
 * CMS em silêncio — encontra tabelas, não dá erro, e devolve os dados errados.
 * Por isso nenhum cliente é criado sem passar por aqui.
 */

export const BOOKING_SCHEMA = 'booking' as const;

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function readPublicEnv(): SupabaseEnv {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error(
      'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY. Copiar .env.example para .env.local.',
    );
  }

  return { url, anonKey };
}

export const CLIENT_OPTIONS = {
  db: { schema: BOOKING_SCHEMA },
  global: {
    headers: {
      'x-application-name': 'totalmobi-booking',
    },
  },
} as const;

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types';
import { CLIENT_OPTIONS, readPublicEnv, type SupabaseEnv } from './config';

export type BookingClient = SupabaseClient<Database, 'booking'>;

/**
 * Cliente anónimo, sem sessão.
 *
 * É o cliente da página pública de marcação e do widget — e é o cliente da
 * página pública **mesmo quando o visitante tem sessão iniciada**. A razão está
 * na migration 0006: a `anon` tem privilégio apenas nas colunas públicas de
 * `booking.tenants`, enquanto `authenticated` os tem em todas. Usar a sessão do
 * visitante numa página pública abriria colunas que ali não têm nada que fazer.
 */
export function createAnonClient(env: SupabaseEnv = readPublicEnv()): BookingClient {
  return createClient<Database, 'booking'>(env.url, env.anonKey, {
    ...CLIENT_OPTIONS,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

import {
  createBrowserClient as createSsrBrowserClient,
  createServerClient as createSsrServerClient,
} from '@supabase/ssr';

import type { Database } from '../types/database.types';
import { CLIENT_OPTIONS, readPublicEnv, type SupabaseEnv } from './config';
import type { BookingClient } from './anon';

/**
 * Clientes com sessão do utilizador — o caminho do painel administrativo.
 *
 * A RLS é a defesa principal aqui: o JWT diz quem a pessoa é, e as políticas
 * decidem o que ela vê. Ver SECURITY.md, secção 3, para o motivo de
 * `authenticated` nunca chegar por si só.
 */

export interface CookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: unknown }[]) => void;
}

export function createBrowserClient(env: SupabaseEnv = readPublicEnv()): BookingClient {
  return createSsrBrowserClient<Database, 'booking'>(env.url, env.anonKey, CLIENT_OPTIONS);
}

/**
 * Cliente para Server Components, Server Actions e Route Handlers.
 *
 * O adaptador de cookies é injetado por quem chama (em `apps/web`, a partir de
 * `next/headers`). É o que mantém este pacote independente do Next: quem quiser
 * usá-lo noutro contexto só tem de fornecer o adaptador.
 */
export function createServerClient(
  cookies: CookieAdapter,
  env: SupabaseEnv = readPublicEnv(),
): BookingClient {
  return createSsrServerClient<Database, 'booking'>(env.url, env.anonKey, {
    ...CLIENT_OPTIONS,
    cookies: {
      getAll: cookies.getAll,
      setAll: cookies.setAll as never,
    },
  });
}

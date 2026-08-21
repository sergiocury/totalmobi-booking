import 'server-only';

import { cookies } from 'next/headers';

import { createAnonClient, createServerClient, type BookingClient } from '@totalmobi/database';

/**
 * Ligação entre os cookies do Next e os clientes Supabase do monorepo.
 *
 * `packages/database` não conhece o Next de propósito — recebe um adaptador de
 * cookies. É aqui, e só aqui, que os dois mundos se encontram.
 */

/** Cliente com a sessão do utilizador. RLS ativa: é a defesa principal. */
export async function getSessionClient(): Promise<BookingClient> {
  const cookieStore = await cookies();

  return createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (list) => {
      try {
        for (const cookie of list) {
          cookieStore.set(cookie.name, cookie.value, cookie.options as never);
        }
      } catch {
        // Server Components não podem escrever cookies. Quando a sessão precisa
        // de ser renovada, quem o faz é o middleware — este catch é o caminho
        // esperado, não um erro.
      }
    },
  });
}

/**
 * Cliente público, sem sessão.
 *
 * É o que serve a página pública de marcação, **mesmo quando o visitante tem
 * sessão iniciada**: a `anon` só tem privilégio nas colunas públicas de
 * `booking.tenants`, enquanto `authenticated` os tem em todas.
 */
export function getPublicClient(): BookingClient {
  return createAnonClient();
}

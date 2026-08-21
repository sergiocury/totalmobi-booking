import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isPublicPath, resolveTenant } from '@totalmobi/shared';

/**
 * Proxy: renovação de sessão + resolução de tenant.
 *
 * Chama-se  e não  porque o Next.js 16 depreciou a
 * convenção antiga — o próprio servidor avisa no arranque. O ficheiro é o
 * mesmo conceito: corre antes de cada pedido, no limite da aplicação.
 *
 * O que ele **não** faz, de propósito: decidir se o utilizador pode ver os
 * dados. Isso é da RLS. O middleware é conveniência de navegação — manda para
 * o login quem não tem sessão, e passa o tenant resolvido em cabeçalhos para
 * as páginas não terem de o descobrir outra vez.
 *
 * Se este ficheiro desaparecesse, nenhum dado ficaria exposto: apenas se veria
 * uma página vazia em vez de um redirecionamento. É esse o teste de saber se
 * um proxy está a fazer trabalho a mais.
 */

const PLATFORM_HOSTS = (process.env['NEXT_PUBLIC_BOOKING_DOMAIN'] ?? 'localhost')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const resolution = resolveTenant({
    host: request.headers.get('host') ?? '',
    pathname,
    platformHosts: PLATFORM_HOSTS,
  });

  // Um único objeto de resposta, partilhado com o cliente Supabase: é ele que
  // escreve os cookies renovados. Criar outro pelo caminho perde a renovação e
  // o utilizador é atirado para o login a meio do trabalho.
  let response = NextResponse.next({ request });

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    // Sem configuração não há sessão para renovar. Deixar passar em vez de
    // rebentar: a página /status existe precisamente para dizer o que falta.
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    db: { schema: 'booking' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Renova o token quando está perto de expirar. Tem de ser chamado sempre,
  // mesmo em rotas públicas, senão a sessão morre enquanto a pessoa navega
  // pelo site público antes de entrar no painel.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (resolution.requiresSession && !user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Guardar o destino para devolver a pessoa ao sítio certo depois de entrar.
    loginUrl.searchParams.set('proximo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Passar o tenant resolvido às páginas. São cabeçalhos de pedido, escritos
  // por nós — nunca vêm do cliente, porque `NextResponse.next({ request })`
  // reconstrói o pedido a partir daqui.
  response.headers.set('x-tenant-source', resolution.source);
  if (resolution.identifier) {
    response.headers.set('x-tenant-identifier', resolution.identifier);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo menos ficheiros estáticos e imagens. Os webhooks entram de propósito:
     * não precisam de sessão, mas passar por aqui mantém um só sítio a decidir
     * o que é público.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};

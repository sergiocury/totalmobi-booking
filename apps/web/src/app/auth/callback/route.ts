import { NextResponse, type NextRequest } from 'next/server';

import { getSessionClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

/**
 * Troca o código do magic link / convite por uma sessão.
 *
 * `proximo` só é aceite se for um caminho interno. Um `proximo` absoluto seria
 * um open redirect: bastaria enviar
 * `…/auth/callback?proximo=https://sitio-falso.pt` a alguém para lhe roubar a
 * sessão logo a seguir a entrar.
 */

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/app';
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('proximo'));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  const client = await getSessionClient();
  const { data, error } = await client.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  await writeAuditLog({
    action: 'auth.login',
    entity: 'user',
    entityId: data.user.id,
    actorType: 'user',
    newValues: { method: 'magic_link' },
  });

  return NextResponse.redirect(`${origin}${next}`);
}

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { getSessionClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

/**
 * Confirmação de links gerados por nós — convites e magic links enviados pelo
 * `EmailProvider` próprio.
 *
 * PORQUE EXISTE, SEPARADO DO `/auth/callback`
 *
 * Há dois fluxos de entrada e eles não são intermutáveis:
 *
 * · `/auth/callback` recebe `?code=` — o fluxo **PKCE**, usado quando é a nossa
 *   app a iniciar a autenticação (`signInWithOtp`). O `@supabase/ssr` guarda um
 *   verificador em cookie e troca o código por sessão.
 *
 * · `/auth/confirm` recebe `?token_hash=` — o fluxo de quem **gerou o link pela
 *   API de administração** (`generateLink`). Não há verificador em cookie
 *   nenhum, porque o link foi criado no servidor, possivelmente dias antes.
 *
 * O detalhe que obriga a isto: se apontarmos um link de administração
 * diretamente ao endpoint `/auth/v1/verify` do Supabase, ele redireciona com os
 * tokens no **fragmento** do URL (`#access_token=…`). O fragmento nunca é
 * enviado ao servidor, por isso um Route Handler não o consegue ler — a sessão
 * nunca se estabeleceria, e o convite morria com um erro silencioso.
 *
 * Com `token_hash` + `verifyOtp()` a troca acontece toda no servidor e os
 * cookies são escritos como devem ser. É este o caminho que os convites usam.
 */

const VALID_TYPES = new Set<EmailOtpType>([
  'magiclink',
  'invite',
  'recovery',
  'email_change',
  'signup',
  'email',
]);

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/app';
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type') ?? 'magiclink';
  const next = safeNext(searchParams.get('proximo'));

  if (!tokenHash || !VALID_TYPES.has(rawType as EmailOtpType)) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  const client = await getSessionClient();
  const { data, error } = await client.auth.verifyOtp({
    type: rawType as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    // Expirado, já usado, ou adulterado. A mensagem é a mesma para os três: a
    // diferença só ajudaria quem estivesse a sondar tokens.
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  await writeAuditLog({
    action: 'auth.login',
    entity: 'user',
    entityId: data.user.id,
    actorType: 'user',
    newValues: { method: rawType },
  });

  /*
   * Uma recuperação acaba na página de definir palavra-passe.
   *
   * Este redirecionamento levava toda a gente para `/app`, incluindo quem tinha
   * carregado num link de recuperação. O efeito: pedia-se a recuperação,
   * recebia-se o email, e aterrava-se no painel sem nunca ter sido perguntada
   * uma palavra-passe. A pessoa ficava dentro da conta e sem forma de lá voltar
   * a entrar — porque a palavra-passe continuava a ser a que não sabia.
   *
   * O `proximo` explícito continua a ganhar: quem pediu para ir a um sítio
   * concreto vai lá, e a página de palavra-passe tem um link para o painel para
   * quem afinal não a quer mudar.
   */
  const destino =
    rawType === 'recovery' && !searchParams.get('proximo') ? '/nova-palavra-passe' : next;

  return NextResponse.redirect(`${origin}${destino}`);
}

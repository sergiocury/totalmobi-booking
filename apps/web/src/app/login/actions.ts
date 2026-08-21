'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { emailSchema } from '@totalmobi/shared';

import { getSessionClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

/**
 * Autenticação do painel.
 *
 * Duas notas que valem mais do que o código:
 *
 * 1. **As mensagens de erro nunca dizem se o email existe.** "Credenciais
 *    inválidas" para password errada e para conta inexistente é a mesma frase
 *    de propósito — a diferença transformaria o formulário num verificador de
 *    contas.
 *
 * 2. **O magic link é enviado pelo Supabase e está limitado a 2 emails/hora**
 *    neste projeto (`rate_limit_email_sent: 2`, SMTP interno). Chega para o
 *    Sérgio entrar, não chega para clientes. Os convites a sério passam por
 *    `generateLink()` + Resend — ver `src/lib/invites`.
 */

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Introduza a palavra-passe'),
  proximo: z.string().startsWith('/').max(500).optional(),
});

const magicLinkSchema = z.object({
  email: emailSchema,
  proximo: z.string().startsWith('/').max(500).optional(),
});

export type LoginState = { error?: string; sent?: boolean };

/** Só caminhos internos: um `proximo` para fora seria um open redirect. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export async function signInWithPassword(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    proximo: formData.get('proximo') || undefined,
  });

  if (!parsed.success) {
    return { error: 'Verifique o email e a palavra-passe.' };
  }

  const client = await getSessionClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await writeAuditLog({
      action: 'auth.login_failed',
      entity: 'user',
      actorType: 'system',
      newValues: { email: parsed.data.email, reason: error?.message ?? 'sem utilizador' },
    });
    return { error: 'Credenciais inválidas.' };
  }

  await writeAuditLog({
    action: 'auth.login',
    entity: 'user',
    entityId: data.user.id,
    actorType: 'user',
    newValues: { method: 'password' },
  });

  redirect(safeNext(parsed.data.proximo));
}

export async function sendMagicLink(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get('email'),
    proximo: formData.get('proximo') || undefined,
  });

  if (!parsed.success) {
    return { error: 'Email inválido.' };
  }

  const origin = (await headers()).get('origin') ?? process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const client = await getSessionClient();

  await client.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?proximo=${encodeURIComponent(safeNext(parsed.data.proximo))}`,
      // `disable_signup: true` no projeto já impede contas novas, mas dizê-lo
      // aqui também torna a intenção explícita a quem lê.
      shouldCreateUser: false,
    },
  });

  // Resposta igual haja conta ou não. Ver a nota 1 no topo do ficheiro.
  return { sent: true };
}

export async function signOut(): Promise<void> {
  const client = await getSessionClient();
  const { data } = await client.auth.getUser();

  if (data.user) {
    await writeAuditLog({
      action: 'auth.logout',
      entity: 'user',
      entityId: data.user.id,
      actorType: 'user',
    });
  }

  await client.auth.signOut();
  redirect('/login');
}

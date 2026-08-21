import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

/**
 * Apoio aos testes de RLS contra uma instância Supabase **local**.
 *
 * Nunca contra produção. Estes testes criam e apagam contas de utilizador; o
 * projeto remoto partilha o auth.users com o Totalmobi CMS e tem mais de 14 mil
 * contas reais de clientes.
 *
 * Como obter as chaves locais:
 *
 *     supabase start
 *     supabase status -o env
 *
 * e exportar:
 *
 *     SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_KEY
 *
 * As chaves não são fixadas aqui de propósito: o formato mudou entre versões do
 * CLI, e um valor a mais no repositório é um valor a mais para confundir.
 */

export interface LocalEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export function readLocalEnv(): LocalEnv | null {
  const url = process.env['SUPABASE_TEST_URL'] ?? process.env['SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_TEST_ANON_KEY'] ?? process.env['SUPABASE_ANON_KEY'];
  const serviceKey =
    process.env['SUPABASE_TEST_SERVICE_KEY'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !anonKey || !serviceKey) return null;

  // Rede de segurança: se alguém apontar isto a um projeto remoto por engano,
  // os testes recusam-se a correr em vez de mexerem em contas reais.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?/.test(url)) {
    throw new Error(
      `Os testes de RLS só correm contra uma instância local. Recebido: ${url}.\n` +
        'Correr `supabase start` e usar SUPABASE_TEST_URL=http://127.0.0.1:54321.',
    );
  }

  return { url, anonKey, serviceKey };
}

const OPTIONS = {
  db: { schema: 'booking' as const },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export function serviceClient(env: LocalEnv): SupabaseClient<any, 'booking'> {
  return createClient(env.url, env.serviceKey, OPTIONS);
}

export function anonClient(env: LocalEnv): SupabaseClient<any, 'booking'> {
  return createClient(env.url, env.anonKey, OPTIONS);
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<any, 'booking'>;
}

/** Cria uma conta descartável e devolve um cliente já autenticado com ela. */
export async function createTestUser(env: LocalEnv, label: string): Promise<TestUser> {
  const admin = createClient(env.url, env.serviceKey, {
    ...OPTIONS,
    auth: { ...OPTIONS.auth, autoRefreshToken: false },
  });

  const email = `rls-${label}-${randomUUID()}@totalmobi.test`;
  const password = `Test!${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Não foi possível criar o utilizador de teste: ${error?.message}`);
  }

  const client = createClient(env.url, env.anonKey, OPTIONS);
  const signIn = await client.auth.signInWithPassword({ email, password });

  if (signIn.error) {
    throw new Error(`Não foi possível autenticar o utilizador de teste: ${signIn.error.message}`);
  }

  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(env: LocalEnv, userId: string): Promise<void> {
  const admin = createClient(env.url, env.serviceKey, OPTIONS);
  await admin.auth.admin.deleteUser(userId);
}

/** Cria um tenant descartável e devolve o seu id. */
export async function createTestTenant(env: LocalEnv, slug: string): Promise<string> {
  const service = serviceClient(env);
  const { data, error } = await service
    .from('tenants')
    .insert({
      slug,
      display_name: `Tenant ${slug}`,
      email: `${slug}@totalmobi.test`,
      status: 'active',
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Não foi possível criar o tenant: ${error?.message}`);
  return data.id as string;
}

export async function addMembership(
  env: LocalEnv,
  tenantId: string,
  userId: string,
  role: 'tenant_admin' | 'manager' | 'staff',
): Promise<void> {
  const service = serviceClient(env);
  const { error } = await service.from('memberships').insert({
    tenant_id: tenantId,
    user_id: userId,
    role,
    accepted_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Não foi possível criar o membership: ${error.message}`);
}

export async function deleteTestTenant(env: LocalEnv, tenantId: string): Promise<void> {
  await serviceClient(env).from('tenants').delete().eq('id', tenantId);
}

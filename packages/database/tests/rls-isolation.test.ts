import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addMembership,
  anonClient,
  createTestTenant,
  createTestUser,
  deleteTestTenant,
  deleteTestUser,
  readLocalEnv,
  serviceClient,
  type LocalEnv,
  type TestUser,
} from './helpers/local';

/**
 * Isolamento entre tenants — o teste que mais importa deste projeto.
 *
 * Uma fuga aqui não é um bug: é o fim do negócio. Uma clínica a ler a agenda da
 * clínica concorrente, com nomes e telefones de doentes, é notificação à CNPD em
 * 72 horas e um cliente perdido para sempre.
 *
 * O caso T2 (`utilizador autenticado sem membership`) é o mais importante de
 * todos, e não é hipotético: o auth.users deste projeto Supabase é partilhado
 * com o Totalmobi CMS. Qualquer titular de uma dessas contas obtém um JWT
 * `authenticated` válido contra este projeto sem fazer nada de errado.
 *
 * Já foi verificado em produção a 2026-08-17, com uma conta real do CMS
 * (contato@guariroba.com.br), dentro de uma transação revertida: zero linhas em
 * todas as tabelas. Estes testes reproduzem isso em CI, contra uma base de
 * dados onde se possam criar contas descartáveis.
 */

const env = readLocalEnv();

if (!env) {
  console.warn(
    '\n⚠️  Testes de RLS SALTADOS: não há instância Supabase local configurada.\n' +
      '   supabase start && supabase status -o env\n' +
      '   export SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_KEY\n' +
      '   Estes testes são obrigatórios antes de fechar o Milestone 1.\n',
  );
}

describe.skipIf(!env)('isolamento multi-tenant', () => {
  const e = env as LocalEnv;

  let tenantA: string;
  let tenantB: string;
  let adminA: TestUser;
  let staffA: TestUser;
  let adminB: TestUser;
  /** Conta sem qualquer ligação ao Booking — o utilizador só-CMS. */
  let outsider: TestUser;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);

    tenantA = await createTestTenant(e, `rls-a-${suffix}`);
    tenantB = await createTestTenant(e, `rls-b-${suffix}`);

    [adminA, staffA, adminB, outsider] = await Promise.all([
      createTestUser(e, 'admin-a'),
      createTestUser(e, 'staff-a'),
      createTestUser(e, 'admin-b'),
      createTestUser(e, 'outsider'),
    ]);

    await addMembership(e, tenantA, adminA.id, 'tenant_admin');
    await addMembership(e, tenantA, staffA.id, 'staff');
    await addMembership(e, tenantB, adminB.id, 'tenant_admin');
    // `outsider` fica deliberadamente sem membership nenhum.

    const service = serviceClient(e);
    await service.from('locations').insert([
      {
        tenant_id: tenantA,
        name: 'Unidade A',
        slug: 'unidade-a',
        timezone: 'Europe/Lisbon',
        is_default: true,
      },
      {
        tenant_id: tenantB,
        name: 'Unidade B',
        slug: 'unidade-b',
        timezone: 'America/Sao_Paulo',
        is_default: true,
      },
    ]);
  });

  afterAll(async () => {
    if (!env) return;
    await Promise.all([
      deleteTestTenant(e, tenantA),
      deleteTestTenant(e, tenantB),
    ]);
    await Promise.all(
      [adminA, staffA, adminB, outsider]
        .filter(Boolean)
        .map((u) => deleteTestUser(e, u.id)),
    );
  });

  // ---------------------------------------------------------------------------
  // T2 — o caso crítico deste projeto
  // ---------------------------------------------------------------------------
  describe('utilizador autenticado sem membership (ameaça T2)', () => {
    it('não lê tenant nenhum', async () => {
      const { data, error } = await outsider.client.from('tenants').select('id, slug');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('não lê memberships de ninguém', async () => {
      const { data } = await outsider.client.from('memberships').select('id');
      expect(data ?? []).toEqual([]);
    });

    it('não lê unidades', async () => {
      const { data } = await outsider.client.from('locations').select('id');
      expect(data ?? []).toEqual([]);
    });

    it('não lê registos de auditoria', async () => {
      const { data } = await outsider.client.from('audit_logs').select('id');
      expect(data ?? []).toEqual([]);
    });

    it('não lê branding nem políticas de tenants privados', async () => {
      const branding = await outsider.client
        .from('tenant_branding')
        .select('tenant_id')
        .eq('tenant_id', tenantA);
      expect(branding.data ?? []).toEqual([]);
    });

    it('não consegue promover-se a administrador da plataforma', async () => {
      const { error } = await outsider.client
        .from('platform_admins')
        .insert({ user_id: outsider.id, email: outsider.email });
      expect(error).not.toBeNull();
    });

    it('não consegue criar um membership para si próprio', async () => {
      const { error } = await outsider.client.from('memberships').insert({
        tenant_id: tenantA,
        user_id: outsider.id,
        role: 'tenant_admin',
        accepted_at: new Date().toISOString(),
      });
      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // T1 — fuga entre tenants
  // ---------------------------------------------------------------------------
  describe('membro do tenant A face ao tenant B', () => {
    it('vê apenas o seu tenant', async () => {
      const { data } = await adminA.client.from('tenants').select('id');
      expect(data?.map((r) => r.id)).toEqual([tenantA]);
    });

    it('não vê as unidades do tenant B, mesmo pedindo-as pelo id', async () => {
      const { data } = await adminA.client.from('locations').select('id').eq('tenant_id', tenantB);
      expect(data ?? []).toEqual([]);
    });

    it('não consegue alterar o tenant B', async () => {
      const { data } = await adminA.client
        .from('tenants')
        .update({ display_name: 'Invadido' })
        .eq('id', tenantB)
        .select();
      // A RLS filtra a linha antes do UPDATE: zero linhas afetadas, sem erro.
      // É este `UPDATE 0` silencioso que engana quem testa a olho.
      expect(data ?? []).toEqual([]);

      const check = await serviceClient(e).from('tenants').select('display_name').eq('id', tenantB).single();
      expect(check.data?.display_name).not.toBe('Invadido');
    });

    it('não consegue criar uma unidade no tenant B', async () => {
      const { error } = await adminA.client.from('locations').insert({
        tenant_id: tenantB,
        name: 'Unidade infiltrada',
        slug: 'infiltrada',
        timezone: 'Europe/Lisbon',
      });
      expect(error).not.toBeNull();
    });

    it('não vê os membros do tenant B', async () => {
      const { data } = await adminA.client.from('memberships').select('id').eq('tenant_id', tenantB);
      expect(data ?? []).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // T11 — escalada de privilégios dentro do mesmo tenant
  // ---------------------------------------------------------------------------
  describe('escalada de privilégios', () => {
    it('o staff vê a sua própria linha de membership', async () => {
      const { data } = await staffA.client.from('memberships').select('id, role');
      expect(data).toHaveLength(1);
      expect(data?.[0]?.role).toBe('staff');
    });

    it('o staff não consegue promover-se a tenant_admin', async () => {
      const { data: mine } = await staffA.client.from('memberships').select('id').single();

      const { data, error } = await staffA.client
        .from('memberships')
        .update({ role: 'tenant_admin' })
        .eq('id', mine!.id)
        .select();

      // Ou a RLS filtra a linha (sem política de UPDATE para staff), ou o
      // trigger memberships_guard_role rejeita. Qualquer um serve; o que não
      // pode acontecer é o papel mudar.
      expect(error !== null || (data ?? []).length === 0).toBe(true);

      const check = await serviceClient(e)
        .from('memberships')
        .select('role')
        .eq('id', mine!.id)
        .single();
      expect(check.data?.role).toBe('staff');
    });

    it('o staff não vê os registos de auditoria do tenant', async () => {
      // audit_logs é só para administradores: contém alterações de configuração
      // e de acessos.
      const { data } = await staffA.client.from('audit_logs').select('id');
      expect(data ?? []).toEqual([]);
    });

    it('o administrador do tenant vê os registos de auditoria do seu tenant', async () => {
      const { data, error } = await adminA.client.from('audit_logs').select('id, tenant_id');
      expect(error).toBeNull();
      // Os triggers de membership já escreveram pelo menos duas entradas.
      expect((data ?? []).length).toBeGreaterThan(0);
      expect((data ?? []).every((r) => r.tenant_id === tenantA)).toBe(true);
    });

    it('ninguém consegue apagar um registo de auditoria', async () => {
      const { data: logs } = await adminA.client.from('audit_logs').select('id').limit(1);
      const { data, error } = await adminA.client
        .from('audit_logs')
        .delete()
        .eq('id', logs![0]!.id)
        .select();
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Visitante anónimo — o que a página pública consegue ver
  // ---------------------------------------------------------------------------
  describe('visitante anónimo', () => {
    it('lê os tenants ativos, para a página pública funcionar', async () => {
      const { data, error } = await anonClient(e).from('tenants').select('id, slug, display_name');
      expect(error).toBeNull();
      expect(data?.some((r) => r.id === tenantA)).toBe(true);
    });

    it('não lê as colunas privadas do tenant', async () => {
      // A `anon` não tem privilégio de coluna em `email`, `tax_id` nem
      // `suspension_reason`. Pedi-las tem de dar erro, não `null`.
      const { error } = await anonClient(e).from('tenants').select('email, tax_id');
      expect(error).not.toBeNull();
    });

    it('não lê memberships', async () => {
      const { data, error } = await anonClient(e).from('memberships').select('id');
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it('não lê audit_logs', async () => {
      const { data, error } = await anonClient(e).from('audit_logs').select('id');
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it('não lê a lista de administradores da plataforma', async () => {
      const { data, error } = await anonClient(e).from('platform_admins').select('user_id');
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it('não escreve nada', async () => {
      const { error } = await anonClient(e).from('tenants').insert({
        slug: `anon-${randomUUID().slice(0, 8)}`,
        display_name: 'Criado por anónimo',
      });
      expect(error).not.toBeNull();
    });

    it('deixa de ver o tenant assim que ele é suspenso', async () => {
      await serviceClient(e)
        .from('tenants')
        .update({ status: 'suspended', suspended_at: new Date().toISOString() })
        .eq('id', tenantB);

      const { data } = await anonClient(e).from('tenants').select('id').eq('id', tenantB);
      expect(data ?? []).toEqual([]);

      const locations = await anonClient(e).from('locations').select('id').eq('tenant_id', tenantB);
      expect(locations.data ?? []).toEqual([]);

      await serviceClient(e)
        .from('tenants')
        .update({ status: 'active', suspended_at: null })
        .eq('id', tenantB);
    });
  });

  // ---------------------------------------------------------------------------
  // Sanidade do schema
  // ---------------------------------------------------------------------------
  describe('sanidade do schema', () => {
    it('as funções de autorização não entram em recursão', async () => {
      // A política de `memberships` chama funções que leem `memberships`. Se o
      // dono das funções SECURITY DEFINER não contornasse a RLS, isto rebentava
      // com "infinite recursion detected in policy for relation memberships".
      const { error } = await adminA.client.from('memberships').select('id, role, tenant_id');
      expect(error).toBeNull();
    });

    it('current_tenant_ids devolve exatamente os tenants do utilizador', async () => {
      const { data, error } = await adminA.client.rpc('current_tenant_ids');
      expect(error).toBeNull();
      expect(data).toEqual([tenantA]);
    });

    it('current_tenant_ids devolve vazio para quem não é membro', async () => {
      const { data } = await outsider.client.rpc('current_tenant_ids');
      expect(data ?? []).toEqual([]);
    });

    it('is_platform_admin é falso para toda a gente neste teste', async () => {
      for (const user of [adminA, staffA, outsider]) {
        const { data } = await user.client.rpc('is_platform_admin');
        expect(data).toBe(false);
      }
    });
  });
});

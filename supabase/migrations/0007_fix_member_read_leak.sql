-- =============================================================================
-- 0007 — Corrige fuga entre tenants nas políticas de leitura de `authenticated`
-- Totalmobi Booking · Milestone 1
--
-- O QUE ESTAVA MAL
--
-- As políticas `*_member_read` de `locations`, `tenant_branding` e
-- `tenant_policies` criadas na 0006 terminavam com uma cláusula extra:
--
--     or (select booking.is_tenant_public(tenant_id))
--
-- A intenção era deixar um utilizador com sessão iniciada ver também a página
-- pública de outra empresa. O efeito real era outro: **qualquer membro de
-- qualquer tenant passava a ver as unidades e o branding de todos os tenants
-- ativos da plataforma.**
--
-- Apanhado ao correr a verificação de RLS contra a base de dados a sério: o
-- administrador da Clínica Sorriso via 1 unidade do Studio Bella.
--
-- PORQUE É QUE ISTO IMPORTA MAIS DO QUE PARECE
--
-- Nenhuma das linhas expostas era secreta — morada e cores de marca já são
-- públicas para o visitante anónimo. O problema é outro, e é estrutural: o
-- painel administrativo confia na RLS para o isolamento. Está escrito, com
-- todas as letras, em packages/database/src/repositories/tenants.ts:
--
--     «Repare-se no que NÃO está aqui: nenhum .eq('tenant_id', …) acrescentado
--      à mão para "garantir" o isolamento. O isolamento é da RLS.»
--
-- Com a cláusula extra, essa promessa era falsa. Um `select * from locations`
-- no painel devolveria linhas de outras empresas, e a primeira consulta nova
-- que alguém escrevesse sem filtro explícito misturava tenants em silêncio.
--
-- A CORREÇÃO
--
-- O caminho público é servido **sempre** pelo cliente anónimo, mesmo quando o
-- visitante tem sessão — é decisão de arquitetura, está em
-- packages/database/src/client/anon.ts e no cabeçalho da 0006. A `anon` tem as
-- suas próprias políticas, que continuam intactas. Logo, as políticas de
-- `authenticated` não precisam do caminho público — e não o podem ter.
-- =============================================================================

drop policy if exists locations_member_read on booking.locations;

create policy locations_member_read on booking.locations
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

drop policy if exists tenant_branding_member_read on booking.tenant_branding;

create policy tenant_branding_member_read on booking.tenant_branding
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

drop policy if exists tenant_policies_member_read on booking.tenant_policies;

create policy tenant_policies_member_read on booking.tenant_policies
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Guarda permanente
-- -----------------------------------------------------------------------------
-- `is_tenant_public()` existe para as políticas de `anon` e só para essas.
-- Se voltar a aparecer numa política de `authenticated`, esta verificação falha
-- a migration em vez de deixar a fuga entrar outra vez sem ninguém reparar.

do $$
declare v text;
begin
  select string_agg(policyname, ', ') into v
  from pg_policies
  where schemaname = 'booking'
    and 'authenticated' = any (roles)
    and coalesce(qual, '') like '%is_tenant_public%';

  if v is not null then
    raise exception
      'Política de `authenticated` a usar is_tenant_public(): %. '
      'Isso mistura tenants no painel — o caminho público usa o cliente anon. '
      'Ver migration 0007.', v;
  end if;

  raise notice 'RLS: nenhuma política de authenticated depende do caminho público';
end $$;

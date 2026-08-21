-- =============================================================================
-- 0006 — Políticas RLS e privilégios
-- Totalmobi Booking · Milestone 1
--
-- Todas as tabelas já têm RLS ativa e FORCE desde a migration que as criou.
-- Até aqui isso significou "negar tudo". Esta migration abre, uma a uma, as
-- portas estritamente necessárias.
--
-- DUAS REGRAS QUE GOVERNAM ESTE FICHEIRO
--
-- 1. `authenticated` NUNCA é, por si só, autorização. O auth.users deste
--    projeto é partilhado com o Totalmobi CMS. Toda a política de leitura de
--    dados de negócio passa por booking.memberships.
--
--    E nunca `or booking.is_tenant_public(...)` numa política de authenticated:
--    isso mistura tenants no painel. Já aconteceu; ver migration 0007.
--
-- 2. As funções de autorização são sempre chamadas na forma
--    `x = any ((select booking.f())::uuid[])`, sem referência a colunas da linha.
--    Assim o planeador avalia-as UMA vez por query (InitPlan). Escrever
--    `booking.f(tenant_id)` faria correr a função uma vez POR LINHA — com
--    200 mil marcações, a diferença é entre milissegundos e segundos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Função de apoio: o tenant é publicamente visível?
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER de propósito. Usada dentro de políticas de outras tabelas,
-- evita depender de a `anon` ter privilégio de coluna em booking.tenants e
-- evita cadeias de RLS a avaliar RLS.
create or replace function booking.is_tenant_public(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select exists (
    select 1 from booking.tenants
    where id = p_tenant
      and status in ('trial','active','past_due')
      and archived_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- EXECUTE nas funções
-- -----------------------------------------------------------------------------
-- Por omissão o PostgreSQL dá EXECUTE a PUBLIC em cada função nova. Isso é
-- inaceitável nas funções SECURITY DEFINER de escrita: qualquer visitante
-- anónimo poderia chamá-las.

revoke execute on function booking.write_audit_log(
  uuid, booking.actor_type, text, text, text, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function booking.write_audit_log(
  uuid, booking.actor_type, text, text, text, jsonb, jsonb, text, text
) to service_role;

-- As de leitura são necessárias para avaliar as próprias políticas.
grant execute on function booking.current_tenant_ids()            to authenticated, service_role;
grant execute on function booking.admin_tenant_ids()              to authenticated, service_role;
grant execute on function booking.manager_tenant_ids()            to authenticated, service_role;
grant execute on function booking.is_platform_admin()             to authenticated, service_role;
grant execute on function booking.current_role_in(uuid)           to authenticated, service_role;
grant execute on function booking.has_tenant_role(uuid, booking.member_role[])
                                                                  to authenticated, service_role;
grant execute on function booking.is_tenant_public(uuid)          to anon, authenticated, service_role;
grant execute on function booking.is_valid_timezone(text)         to anon, authenticated, service_role;

-- =============================================================================
-- PLANOS E FUNCIONALIDADES — catálogo público (página de preços)
-- =============================================================================

grant select on booking.plans         to anon, authenticated;
grant select on booking.features      to anon, authenticated;
grant select on booking.plan_features to anon, authenticated;
grant all    on booking.plans, booking.features, booking.plan_features to service_role;

create policy plans_public_read on booking.plans
  for select to anon, authenticated using (is_public);

create policy features_public_read on booking.features
  for select to anon, authenticated using (true);

create policy plan_features_public_read on booking.plan_features
  for select to anon, authenticated using (true);

-- tenant_features não é público: revelaria o que cada cliente contratou.
grant select on booking.tenant_features to authenticated;
grant all    on booking.tenant_features to service_role;

create policy tenant_features_member_read on booking.tenant_features
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );
-- Sem políticas de escrita: alterar funcionalidades é ação de plataforma,
-- feita no servidor com service_role depois de validar is_platform_admin().

-- =============================================================================
-- TENANTS
-- =============================================================================
--
-- Nota de desenho: `anon` recebe SELECT apenas nas COLUNAS públicas. É por isso
-- que a página pública é sempre servida com o cliente anónimo, mesmo quando o
-- visitante por acaso tem sessão iniciada — o caminho `authenticated` dá acesso
-- a todas as colunas (email, NIF, motivo de suspensão) e existe só para membros.

grant select (
  id, slug, code, display_name, segment, status, plan_code,
  website, country_code, default_timezone, default_locale, default_currency,
  custom_domain, archived_at
) on booking.tenants to anon;

grant select, update on booking.tenants to authenticated;
grant all on booking.tenants to service_role;
grant usage on sequence booking.tenant_code_seq to service_role;

create policy tenants_public_read on booking.tenants
  for select to anon
  using (status in ('trial','active','past_due') and archived_at is null);

create policy tenants_member_read on booking.tenants
  for select to authenticated
  using (
    id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy tenants_admin_update on booking.tenants
  for update to authenticated
  using (
    id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- Sem INSERT nem DELETE para authenticated: criar e apagar empresas é ação de
-- plataforma. Passa por service_role, num Server Action que valida
-- is_platform_admin() antes de tocar na base de dados.

-- -----------------------------------------------------------------------------
-- Branding — tudo aqui é público por natureza
-- -----------------------------------------------------------------------------

grant select on booking.tenant_branding to anon;
grant select, update on booking.tenant_branding to authenticated;
grant all on booking.tenant_branding to service_role;

create policy tenant_branding_public_read on booking.tenant_branding
  for select to anon
  using ((select booking.is_tenant_public(tenant_id)));

create policy tenant_branding_member_read on booking.tenant_branding
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
    or (select booking.is_tenant_public(tenant_id))
  );

create policy tenant_branding_admin_write on booking.tenant_branding
  for update to authenticated
  using (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Políticas de agendamento — o cliente final tem de as poder ler
-- -----------------------------------------------------------------------------
-- "Pode cancelar até 24 h antes" é informação que a página pública mostra antes
-- de a pessoa marcar. Esconder isto seria hostil e não protege nada.

grant select on booking.tenant_policies to anon;
grant select, update on booking.tenant_policies to authenticated;
grant all on booking.tenant_policies to service_role;

create policy tenant_policies_public_read on booking.tenant_policies
  for select to anon
  using ((select booking.is_tenant_public(tenant_id)));

create policy tenant_policies_member_read on booking.tenant_policies
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
    or (select booking.is_tenant_public(tenant_id))
  );

create policy tenant_policies_admin_write on booking.tenant_policies
  for update to authenticated
  using (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- =============================================================================
-- PLATFORM ADMINS
-- =============================================================================
-- Leitura: só a própria linha, ou tudo se já se for admin da plataforma. É o
-- que permite ao painel saber "posso entrar no /console?" sem revelar a lista.
--
-- Escrita: NENHUMA política, para papel nenhum, incluindo o próprio. Promover
-- alguém a administrador da Totalmobi exige SQL direto no dashboard. Não é
-- excesso de zelo: num projeto com auth partilhado, uma política de escrita
-- mal escrita aqui seria o fim.

grant select on booking.platform_admins to authenticated;
grant all    on booking.platform_admins to service_role;

create policy platform_admins_self_read on booking.platform_admins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select booking.is_platform_admin())
  );

-- =============================================================================
-- MEMBERSHIPS
-- =============================================================================

grant select, insert, update, delete on booking.memberships to authenticated;
grant all on booking.memberships to service_role;

-- Ver as suas próprias linhas. Deliberadamente sem chamar nenhuma função que
-- leia memberships: é o caminho de leitura mais quente do sistema e o que tem
-- de continuar a funcionar mesmo que algo corra mal nas funções auxiliares.
create policy memberships_self_read on booking.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_manager_read on booking.memberships
  for select to authenticated
  using (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy memberships_admin_insert on booking.memberships
  for insert to authenticated
  with check (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- O trigger memberships_guard_role bloqueia, por dentro, alterações de `role` e
-- de `tenant_id` por quem não é administrador. A RLS não consegue exprimir
-- "podes editar a linha mas não esta coluna"; o trigger consegue.
create policy memberships_admin_update on booking.memberships
  for update to authenticated
  using (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy memberships_admin_delete on booking.memberships
  for delete to authenticated
  using (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- =============================================================================
-- LOCATIONS
-- =============================================================================

grant select on booking.locations to anon;
grant select, insert, update, delete on booking.locations to authenticated;
grant all on booking.locations to service_role;

create policy locations_public_read on booking.locations
  for select to anon
  using (
    is_active
    and archived_at is null
    and (select booking.is_tenant_public(tenant_id))
  );

create policy locations_member_read on booking.locations
  for select to authenticated
  using (
    tenant_id = any ((select booking.current_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
    or (is_active and archived_at is null and (select booking.is_tenant_public(tenant_id)))
  );

create policy locations_manager_write on booking.locations
  for update to authenticated
  using (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  )
  with check (
    tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy locations_admin_insert on booking.locations
  for insert to authenticated
  with check (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

create policy locations_admin_delete on booking.locations
  for delete to authenticated
  using (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- =============================================================================
-- AUDIT LOGS
-- =============================================================================
-- Só leitura, e só para administradores do tenant. A escrita passa por
-- booking.write_audit_log(), que é SECURITY DEFINER — não há INSERT direto.
-- Não existem políticas de UPDATE nem de DELETE: o log é append-only, e um log
-- que se possa editar não é um log.

grant select on booking.audit_logs to authenticated;
grant all    on booking.audit_logs to service_role;

create policy audit_logs_admin_read on booking.audit_logs
  for select to authenticated
  using (
    tenant_id = any ((select booking.admin_tenant_ids())::uuid[])
    or (select booking.is_platform_admin())
  );

-- =============================================================================
-- RESERVED SLUGS
-- =============================================================================
-- Consultada por trigger em contexto de definer. Ninguém precisa de a ler pela
-- API: sem grants e sem políticas.

grant select on booking.reserved_slugs to service_role;

-- =============================================================================
-- Verificação: as funções de autorização conseguem mesmo escapar à RLS
-- =============================================================================
--
-- As políticas de `booking.memberships` chamam funções que LEEM
-- `booking.memberships`. Isso só não é uma recursão infinita porque as funções
-- são SECURITY DEFINER e o seu dono contorna a RLS.
--
-- `FORCE ROW LEVEL SECURITY` retira ao dono da tabela a isenção habitual; o que
-- resta a salvar-nos é o atributo BYPASSRLS do papel. Se um dia estas migrations
-- forem aplicadas por um papel sem esse atributo, o sintoma seria
-- «infinite recursion detected in policy for relation "memberships"» a meio de
-- um pedido de um cliente — não aqui, e sem pista nenhuma sobre a causa.
--
-- Mais vale falhar agora, com o motivo escrito.

do $$
declare
  v_owner  name;
  v_bypass boolean;
begin
  select r.rolname, r.rolbypassrls
    into v_owner, v_bypass
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles r     on r.oid = p.proowner
  where n.nspname = 'booking' and p.proname = 'current_tenant_ids';

  if v_owner is null then
    raise exception 'booking.current_tenant_ids() não existe: a migration 0004 não foi aplicada';
  end if;

  if not v_bypass and not pg_has_role(v_owner, 'pg_read_all_data', 'usage') then
    raise exception
      'O papel % é dono das funções de autorização mas não tem BYPASSRLS. '
      'As políticas de booking.memberships vão entrar em recursão infinita. '
      'Aplicar as migrations como `postgres` (que no Supabase tem BYPASSRLS).',
      v_owner;
  end if;

  raise notice 'RLS: funções de autorização detidas por % (bypassrls=%)', v_owner, v_bypass;
end $$;

-- =============================================================================
-- Verificação: nenhuma tabela deste schema pode ficar sem RLS
-- =============================================================================
-- Corre no fim de cada aplicação das migrations. Se alguém acrescentar uma
-- tabela e se esquecer da RLS, esta migration falha em vez de deixar a tabela
-- exposta na Data API — que neste projeto tem "expose new tables" ligado.

do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ')
  into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'booking'
    and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if v_missing is not null then
    raise exception 'Tabelas sem ENABLE/FORCE ROW LEVEL SECURITY: %', v_missing;
  end if;
end $$;

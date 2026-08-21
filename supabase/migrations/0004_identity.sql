-- =============================================================================
-- 0004 — Identidade: platform_admins, memberships e funções de autorização
-- Totalmobi Booking · Milestone 1
--
-- ⚠️ LER ANTES DE MEXER
--
-- O auth.users deste projeto Supabase é PARTILHADO com o Totalmobi CMS.
-- São 15 contas reais hoje (medido a 2026-08-17) e a crescer: as 10.836 linhas
-- de public.tot_users são uma whitelist de emails com direito a registar-se,
-- não contas. Qualquer titular de uma dessas contas obtém um JWT válido com
-- role = authenticated contra este projeto — sem ataque nenhum, é o
-- funcionamento normal do Supabase Auth. Uma conta de fora já basta para
-- tornar `authenticated` inútil como sinal de autorização.
--
-- Consequência: `authenticated` significa "é uma pessoa", NÃO significa "pode
-- ver isto". Toda a autorização passa por booking.memberships.
-- Ver SECURITY.md, secção 3.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Administradores da plataforma (Totalmobi)
-- -----------------------------------------------------------------------------
-- Não é um member_role: o super admin não pertence a tenant nenhum. Modelá-lo
-- como membership obrigaria a criar uma linha por cada tenant novo, e um
-- esquecimento tornar-se-ia num buraco de acesso silencioso.

create table booking.platform_admins (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  email           text not null check (email = lower(email)),
  full_name       text,
  can_impersonate boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

comment on table booking.platform_admins is
  'Administradores da Totalmobi. SEM políticas de escrita, nem para o próprio: acrescentar um admin exige SQL direto no dashboard. Mesmo padrão deliberado de golf.operador no projeto da ABGS.';

-- -----------------------------------------------------------------------------
-- Membros de um tenant
-- -----------------------------------------------------------------------------

create table booking.memberships (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references booking.tenants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          booking.member_role not null,

  -- staff_id ganha a FK para booking.staff no Milestone 5, quando essa tabela
  -- existir. Fica como uuid solto até lá, deliberadamente.
  staff_id      uuid,

  -- Vazio significa todas as unidades. Preenchido restringe a essas.
  location_ids  uuid[] not null default '{}',

  invited_by    uuid references auth.users(id) on delete set null,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  archived_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (tenant_id, user_id)
);

comment on table booking.memberships is
  'Única fonte de autorização dentro de um tenant. Um JWT authenticated sem linha aqui não vê absolutamente nada.';

create index memberships_user_idx
  on booking.memberships (user_id)
  where archived_at is null and accepted_at is not null;

create index memberships_tenant_idx
  on booking.memberships (tenant_id)
  where archived_at is null;

create trigger memberships_touch before update on booking.memberships
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Funções de autorização
-- -----------------------------------------------------------------------------
--
-- Todas são STABLE + SECURITY DEFINER + search_path fixo:
--
--  · SECURITY DEFINER porque precisam de ler `memberships` contornando a RLS da
--    própria `memberships` — sem isso, a política de `memberships` chamaria uma
--    função que lê `memberships`, e a recursão seria infinita.
--  · search_path fixo porque uma função SECURITY DEFINER sem ele pode ser
--    sequestrada por quem consiga criar objetos num schema pesquisado antes.
--  · STABLE para que o planeador as possa avaliar uma vez por query (InitPlan)
--    em vez de uma vez por linha.

create or replace function booking.current_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select coalesce(array_agg(tenant_id), '{}'::uuid[])
  from booking.memberships
  where user_id = auth.uid()
    and archived_at is null
    and accepted_at is not null;
$$;

comment on function booking.current_tenant_ids() is
  'Tenants a que o utilizador da sessão pertence. Usar SEMPRE como (SELECT booking.current_tenant_ids()) nas políticas, para o planeador a avaliar uma só vez.';

create or replace function booking.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select exists (
    select 1 from booking.platform_admins where user_id = auth.uid()
  );
$$;

create or replace function booking.has_tenant_role(
  p_tenant uuid,
  p_roles  booking.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select exists (
    select 1
    from booking.memberships
    where tenant_id = p_tenant
      and user_id = auth.uid()
      and role = any (p_roles)
      and archived_at is null
      and accepted_at is not null
  );
$$;

create or replace function booking.current_role_in(p_tenant uuid)
returns booking.member_role
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select role
  from booking.memberships
  where tenant_id = p_tenant
    and user_id = auth.uid()
    and archived_at is null
    and accepted_at is not null
  limit 1;
$$;

-- Tenants onde o utilizador é administrador. Serve as políticas de escrita, no
-- mesmo formato de array que current_tenant_ids(), pela mesma razão de plano.
create or replace function booking.admin_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select coalesce(array_agg(tenant_id), '{}'::uuid[])
  from booking.memberships
  where user_id = auth.uid()
    and role = 'tenant_admin'
    and archived_at is null
    and accepted_at is not null;
$$;

-- Tenants onde o utilizador pode gerir a operação (admin ou manager).
create or replace function booking.manager_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select coalesce(array_agg(tenant_id), '{}'::uuid[])
  from booking.memberships
  where user_id = auth.uid()
    and role in ('tenant_admin','manager')
    and archived_at is null
    and accepted_at is not null;
$$;

-- -----------------------------------------------------------------------------
-- Guarda contra escalada de privilégios
-- -----------------------------------------------------------------------------
-- A política de UPDATE de memberships deixa um tenant_admin editar linhas do
-- seu tenant. Isso, sozinho, permitiria a um admin promover-se... o que é
-- inofensivo (já é admin). O que NÃO pode acontecer é um staff ou manager
-- alterar o próprio papel, e é isso que este trigger impede — a RLS sozinha não
-- consegue exprimir "podes editar a linha mas não esta coluna".

create or replace function booking.tg_memberships_guard_role()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  if new.role is distinct from old.role then
    if not (booking.is_platform_admin()
            or booking.has_tenant_role(old.tenant_id, array['tenant_admin']::booking.member_role[])) then
      raise exception 'Só um administrador do tenant pode alterar papéis'
        using errcode = '42501';
    end if;
  end if;

  -- O tenant_id nunca muda: mover um membro entre empresas seria uma fuga.
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Um membro não pode ser movido entre tenants'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger memberships_guard_role
  before update on booking.memberships
  for each row execute function booking.tg_memberships_guard_role();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.platform_admins enable row level security;
alter table booking.platform_admins force  row level security;
alter table booking.memberships     enable row level security;
alter table booking.memberships     force  row level security;

-- =============================================================================
-- 0005 — Unidades e registo de auditoria
-- Totalmobi Booking · Milestone 1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Unidades / localizações
-- -----------------------------------------------------------------------------

create table booking.locations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references booking.tenants(id) on delete cascade,

  name          text not null check (length(trim(name)) >= 2),
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  address_line1 text,
  address_line2 text,
  postal_code   text,
  city          text,
  country_code  char(2) not null default 'PT' check (country_code ~ '^[A-Z]{2}$'),

  -- O fuso vive AQUI, não no tenant. Uma rede pode ter Lisboa e São Paulo, e
  -- todo o motor de disponibilidade parte deste valor.
  timezone      text not null check (booking.is_valid_timezone(timezone)),

  phone_e164    text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_phone_e164 text check (whatsapp_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email         text check (email is null or email = lower(email)),

  latitude      numeric(9,6)  check (latitude  between -90  and 90),
  longitude     numeric(9,6)  check (longitude between -180 and 180),

  is_active     boolean not null default true,
  is_default    boolean not null default false,
  sort_order    int not null default 0,
  archived_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (tenant_id, slug)
);

comment on column booking.locations.timezone is
  'IANA. É a fonte de verdade para toda a aritmética de horários do tenant.';

-- Exatamente uma unidade por omissão por tenant.
create unique index locations_one_default_idx
  on booking.locations (tenant_id)
  where is_default and archived_at is null;

create index locations_tenant_active_idx
  on booking.locations (tenant_id)
  where is_active and archived_at is null;

create trigger locations_touch before update on booking.locations
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
-- É o único sítio do schema onde um sequencial é melhor do que um uuid: a ordem
-- dos eventos importa, e ler um log por ordem de inserção tem de ser barato.

create table booking.audit_logs (
  id            bigint generated always as identity primary key,

  -- NULL em ações de plataforma que não pertencem a nenhum tenant.
  tenant_id     uuid references booking.tenants(id) on delete cascade,

  actor_type    booking.actor_type not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  -- Rótulo do ator no momento do evento. Guardado para o log continuar legível
  -- depois de a conta ser apagada ou o cliente anonimizado.
  actor_label   text,

  action        text not null,      -- booking.created, membership.role_changed, …
  entity        text not null,      -- booking, membership, tenant, …
  entity_id     text,

  old_values    jsonb,
  new_values    jsonb,

  source        text,               -- public_web, whatsapp, admin, system, …
  ip            inet,
  user_agent    text,
  request_id    text,

  created_at    timestamptz not null default now()
);

comment on table booking.audit_logs is
  'Append-only. Não existem políticas de UPDATE nem DELETE, para papel nenhum. Nunca guardar aqui dados pessoais além do actor_label.';

create index audit_logs_tenant_time_idx  on booking.audit_logs (tenant_id, created_at desc);
create index audit_logs_entity_idx       on booking.audit_logs (tenant_id, entity, entity_id);
create index audit_logs_actor_idx        on booking.audit_logs (actor_user_id, created_at desc);

-- Escrita de auditoria a partir de qualquer contexto, incluindo funções que já
-- correm como SECURITY DEFINER. Não devolve nada de útil ao chamador de
-- propósito: o log nunca deve influenciar a lógica de negócio.
create or replace function booking.write_audit_log(
  p_tenant_id  uuid,
  p_actor_type booking.actor_type,
  p_action     text,
  p_entity     text,
  p_entity_id  text default null,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_source     text default null,
  p_actor_label text default null
)
returns bigint
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id bigint;
begin
  insert into booking.audit_logs (
    tenant_id, actor_type, actor_user_id, actor_label,
    action, entity, entity_id, old_values, new_values, source
  ) values (
    p_tenant_id, p_actor_type, auth.uid(), p_actor_label,
    p_action, p_entity, p_entity_id, p_old_values, p_new_values, p_source
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Alterações a membros são das mais sensíveis do sistema: registam-se sempre,
-- independentemente do caminho de código que as provocou.
create or replace function booking.tg_memberships_audit()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform booking.write_audit_log(
      new.tenant_id, 'user', 'membership.created', 'membership', new.id::text,
      null, jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform booking.write_audit_log(
      new.tenant_id, 'user', 'membership.role_changed', 'membership', new.id::text,
      jsonb_build_object('role', old.role), jsonb_build_object('role', new.role)
    );
  elsif tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null then
    perform booking.write_audit_log(
      new.tenant_id, 'user', 'membership.archived', 'membership', new.id::text,
      null, jsonb_build_object('user_id', new.user_id)
    );
  end if;

  return new;
end;
$$;

create trigger memberships_audit
  after insert or update on booking.memberships
  for each row execute function booking.tg_memberships_audit();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.locations  enable row level security;
alter table booking.locations  force  row level security;
alter table booking.audit_logs enable row level security;
alter table booking.audit_logs force  row level security;

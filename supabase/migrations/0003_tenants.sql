-- =============================================================================
-- 0003 — Tenants, branding e políticas
-- Totalmobi Booking · Milestone 1
-- =============================================================================

create sequence if not exists booking.tenant_code_seq start with 1;

create table booking.tenants (
  id                uuid primary key default gen_random_uuid(),

  -- Identificador no URL público: booking.totalmobi.pt/{slug}
  slug              text not null unique
                      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 50),
  -- Código legível para suporte e faturação; alinha com a convenção TOT0xx do CMS.
  code              text not null unique
                      default 'TMB' || lpad(nextval('booking.tenant_code_seq')::text, 4, '0'),

  legal_name        text,
  display_name      text not null check (length(trim(display_name)) >= 2),
  segment           text not null default 'other',

  status            booking.tenant_status not null default 'trial',
  plan_code         text not null default 'basic'
                      references booking.plans(code) on delete restrict,

  email             text check (email = lower(email) and email like '%@%'),
  phone_e164        text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_phone_e164 text check (whatsapp_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  website           text,

  tax_id            text,
  country_code      char(2) not null default 'PT' check (country_code ~ '^[A-Z]{2}$'),

  -- Valores por omissão para unidades novas. A verdade operacional é a da
  -- location: uma rede pode ter Lisboa e São Paulo.
  default_timezone  text not null default 'Europe/Lisbon'
                      check (booking.is_valid_timezone(default_timezone)),
  default_locale    text not null default 'pt-PT'
                      check (default_locale in ('pt-PT','pt-BR','en')),
  default_currency  char(3) not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),

  custom_domain     text unique
                      check (custom_domain is null or custom_domain = lower(custom_domain)),

  trial_ends_at     timestamptz,
  suspended_at      timestamptz,
  suspension_reason text,
  archived_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,

  -- Um tenant suspenso ou cancelado não pode ficar com um domínio próprio
  -- ativo a apontar para uma página que já não deve servir ninguém.
  constraint tenants_domain_requires_active
    check (custom_domain is null or status in ('trial','active','past_due'))
);

comment on table booking.tenants is
  'Empresa cliente. Fronteira de isolamento de dados: nenhuma consulta atravessa tenants.';

-- Slugs que colidiriam com rotas da aplicação ou subdomínios da infraestrutura.
-- Espelha RESERVED_SLUGS em packages/shared/src/schemas/tenant.ts — se um lado
-- mudar, o outro tem de mudar. O teste `reserved-slugs` verifica isso.
create table booking.reserved_slugs (
  slug text primary key
);

insert into booking.reserved_slugs (slug) values
  ('admin'),('api'),('app'),('auth'),('booking'),('console'),('dashboard'),
  ('docs'),('help'),('login'),('logout'),('m'),('privacy'),('public'),
  ('settings'),('signup'),('status'),('support'),('terms'),('totalmobi'),
  ('widget'),('www')
on conflict do nothing;

create or replace function booking.tg_tenants_check_slug()
returns trigger
language plpgsql
set search_path = booking, pg_catalog
as $$
begin
  if exists (select 1 from booking.reserved_slugs where slug = new.slug) then
    raise exception 'O identificador "%" está reservado pela plataforma', new.slug
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tenants_check_slug
  before insert or update of slug on booking.tenants
  for each row execute function booking.tg_tenants_check_slug();

create trigger tenants_touch before update on booking.tenants
  for each row execute function booking.touch_updated_at();

create index tenants_status_idx on booking.tenants (status) where archived_at is null;

-- -----------------------------------------------------------------------------
-- Branding (white-label) — 1:1 com o tenant
-- -----------------------------------------------------------------------------

create table booking.tenant_branding (
  tenant_id         uuid primary key references booking.tenants(id) on delete cascade,
  logo_url          text,
  favicon_url       text,
  hero_image_url    text,
  primary_color     text not null default '#0B5FFF' check (primary_color ~* '^#[0-9a-f]{6}$'),
  secondary_color   text not null default '#101828' check (secondary_color ~* '^#[0-9a-f]{6}$'),
  background_color  text not null default '#FFFFFF' check (background_color ~* '^#[0-9a-f]{6}$'),
  text_color        text not null default '#101828' check (text_color ~* '^#[0-9a-f]{6}$'),
  font_family       text not null default 'system'
                      check (font_family in ('system','inter','geist','dm-sans','source-serif')),
  border_radius     text not null default 'md'
                      check (border_radius in ('none','sm','md','lg','full')),
  public_headline   text,
  public_subheadline text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table booking.tenant_branding is
  'Personalização visual. O contraste WCAG é validado na aplicação antes de gravar: a marca do cliente não pode tornar o produto inacessível.';

create trigger tenant_branding_touch before update on booking.tenant_branding
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Políticas de agendamento — 1:1 com o tenant
-- -----------------------------------------------------------------------------

create table booking.tenant_policies (
  tenant_id                 uuid primary key references booking.tenants(id) on delete cascade,

  cancellation_min_hours    int  not null default 24  check (cancellation_min_hours between 0 and 720),
  reschedule_min_hours      int  not null default 24  check (reschedule_min_hours   between 0 and 720),
  min_advance_minutes       int  not null default 60  check (min_advance_minutes    between 0 and 43200),
  max_advance_days          int  not null default 90  check (max_advance_days       between 1 and 730),
  slot_granularity_minutes  int  not null default 15  check (slot_granularity_minutes between 5 and 120),

  require_confirmation      boolean not null default false,
  allow_customer_reschedule boolean not null default true,
  allow_customer_cancel     boolean not null default true,
  require_email             boolean not null default false,
  require_notes             boolean not null default false,

  -- Retenção de dados pessoais. O mínimo da plataforma é 12 meses; o valor
  -- por omissão (60) cobre o prazo fiscal habitual. Ver SECURITY.md, secção 11.
  data_retention_months     int not null default 60 check (data_retention_months between 12 and 120),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger tenant_policies_touch before update on booking.tenant_policies
  for each row execute function booking.touch_updated_at();

-- Branding e políticas por omissão nascem com o tenant: nunca há um tenant sem
-- configuração, e a aplicação nunca tem de tratar o caso "ainda não existe".
create or replace function booking.tg_tenants_seed_defaults()
returns trigger
language plpgsql
set search_path = booking, pg_catalog
as $$
begin
  insert into booking.tenant_branding (tenant_id) values (new.id)
    on conflict do nothing;
  insert into booking.tenant_policies (tenant_id) values (new.id)
    on conflict do nothing;
  return new;
end;
$$;

create trigger tenants_seed_defaults
  after insert on booking.tenants
  for each row execute function booking.tg_tenants_seed_defaults();

-- FK que ficou pendente em 0002, agora que booking.tenants existe.
alter table booking.tenant_features
  add constraint tenant_features_tenant_fk
  foreign key (tenant_id) references booking.tenants(id) on delete cascade;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.tenants         enable row level security;
alter table booking.tenants         force  row level security;
alter table booking.tenant_branding enable row level security;
alter table booking.tenant_branding force  row level security;
alter table booking.tenant_policies enable row level security;
alter table booking.tenant_policies force  row level security;
alter table booking.reserved_slugs  enable row level security;
alter table booking.reserved_slugs  force  row level security;

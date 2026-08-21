-- =============================================================================
-- 0009 — Catálogo: categorias, serviços e equipa
-- Totalmobi Booking · Milestone 5
--
-- É aqui que o produto deixa de ser infraestrutura e passa a ter o que a
-- empresa vende: quanto tempo demora, quanto custa, e quem o faz.
--
-- Duas ideias governam este ficheiro:
--
-- 1. **Nada se apaga, arquiva-se.** Um serviço com marcações no histórico não
--    pode desaparecer — a agenda de dezembro deixaria de fazer sentido. O
--    `archived_at` tira-o das listas e mantém-no legível.
-- 2. **Preço e duração podem variar por profissional.** A sénior leva mais caro
--    e demora menos. Sem isso, uma clínica com dois níveis de preço precisaria
--    de dois serviços duplicados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorias de serviço
-- -----------------------------------------------------------------------------
-- Só para agrupar na página pública e no painel. Não condicionam regra nenhuma.

create table booking.service_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references booking.tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) >= 1),
  description text,
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index service_categories_tenant_idx
  on booking.service_categories (tenant_id, sort_order)
  where archived_at is null;

create trigger service_categories_touch before update on booking.service_categories
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Serviços
-- -----------------------------------------------------------------------------

create table booking.services (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references booking.tenants(id) on delete cascade,
  category_id           uuid references booking.service_categories(id) on delete set null,

  name                  text not null check (length(trim(name)) >= 2),
  slug                  text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description           text,

  -- Duração e buffers. O buffer é tempo que o profissional fica ocupado sem
  -- estar com o cliente: preparar a sala, desinfetar, escrever notas. Entra no
  -- cálculo de disponibilidade (M7) e no `blocked_range` da marcação (M8).
  duration_minutes      int not null check (duration_minutes between 5 and 1440),
  buffer_before_minutes int not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes  int not null default 0 check (buffer_after_minutes  between 0 and 240),

  price                 numeric(12,2) check (price >= 0),
  promo_price           numeric(12,2) check (promo_price >= 0),
  currency              char(3) check (currency ~ '^[A-Z]{3}$'),

  -- 1 = marcação individual. Acima disso é aula ou workshop, e a disponibilidade
  -- passa a contar vagas em vez de bloquear o profissional (ver DATABASE.md §8).
  capacity              int not null default 1 check (capacity >= 1),

  is_active             boolean not null default true,
  bookable_online       boolean not null default true,
  requires_confirmation boolean not null default false,

  color                 text check (color is null or color ~* '^#[0-9a-f]{6}$'),
  image_url             text,
  sort_order            int not null default 0,

  -- NULL significa "herda do tenant". A resolução é
  -- coalesce(serviço, tenant, plataforma) — uma limpeza dentária e uma cirurgia
  -- não podem ter a mesma antecedência de cancelamento.
  min_advance_minutes    int check (min_advance_minutes between 0 and 43200),
  max_advance_days       int check (max_advance_days between 1 and 730),
  cancellation_min_hours int check (cancellation_min_hours between 0 and 720),
  reschedule_min_hours   int check (reschedule_min_hours between 0 and 720),

  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (tenant_id, slug),

  -- Um preço promocional acima do normal não é promoção nenhuma.
  constraint services_promo_below_price
    check (promo_price is null or price is null or promo_price <= price)
);

comment on column booking.services.capacity is
  'Vagas por sessão. 1 = individual; acima disso é turma e a disponibilidade conta vagas.';

create index services_tenant_active_idx
  on booking.services (tenant_id, sort_order)
  where archived_at is null and is_active;

create index services_bookable_idx
  on booking.services (tenant_id)
  where archived_at is null and is_active and bookable_online;

create trigger services_touch before update on booking.services
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Profissionais
-- -----------------------------------------------------------------------------

create table booking.staff (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references booking.tenants(id) on delete cascade,

  -- Opcional de propósito: nem todo o profissional tem conta. Um cabeleireiro
  -- pequeno tem três pessoas na agenda e um só login.
  user_id               uuid references auth.users(id) on delete set null,

  full_name             text not null check (length(trim(full_name)) >= 2),
  photo_url             text,
  job_title             text,
  bio                   text,
  email                 text check (email is null or email = lower(email)),
  phone_e164            text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),

  is_active             boolean not null default true,
  accepts_online_booking boolean not null default true,

  -- Cor no calendário. Distinguir profissionais por cor é o que torna a vista
  -- de semana legível de relance.
  calendar_color        text check (calendar_color is null or calendar_color ~* '^#[0-9a-f]{6}$'),

  -- Desempata quando o cliente escolhe "qualquer profissional": maior primeiro.
  priority              int not null default 0,

  -- Quantas marcações em paralelo. Acima de 1 é para quem supervisiona vários
  -- clientes ao mesmo tempo (ginásio, estética com máquinas).
  concurrent_capacity   int not null default 1 check (concurrent_capacity >= 1),

  -- NULL = usa o fuso da unidade. Só se preenche para quem trabalha remoto
  -- noutro fuso.
  timezone              text check (timezone is null or booking.is_valid_timezone(timezone)),

  sort_order            int not null default 0,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A mesma conta não pode ser dois profissionais na mesma empresa.
  unique (tenant_id, user_id)
);

create index staff_tenant_active_idx
  on booking.staff (tenant_id, sort_order)
  where archived_at is null and is_active;

create index staff_bookable_idx
  on booking.staff (tenant_id)
  where archived_at is null and is_active and accepts_online_booking;

create trigger staff_touch before update on booking.staff
  for each row execute function booking.touch_updated_at();

-- A FK que ficou pendente na 0004: agora que booking.staff existe, liga-se o
-- membership ao profissional. `on delete set null` porque arquivar um
-- profissional não pode tirar o acesso à conta de quem o geria.
alter table booking.memberships
  add constraint memberships_staff_fk
  foreign key (staff_id) references booking.staff(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Quem faz o quê
-- -----------------------------------------------------------------------------

create table booking.staff_services (
  staff_id                  uuid not null references booking.staff(id) on delete cascade,
  service_id                uuid not null references booking.services(id) on delete cascade,

  -- Sobreposições por profissional. NULL = o valor do serviço.
  duration_minutes_override int check (duration_minutes_override between 5 and 1440),
  price_override            numeric(12,2) check (price_override >= 0),

  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),

  primary key (staff_id, service_id)
);

create index staff_services_service_idx on booking.staff_services (service_id) where is_active;

-- -----------------------------------------------------------------------------
-- Quem trabalha onde
-- -----------------------------------------------------------------------------

create table booking.staff_locations (
  staff_id    uuid not null references booking.staff(id) on delete cascade,
  location_id uuid not null references booking.locations(id) on delete cascade,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),

  primary key (staff_id, location_id)
);

create index staff_locations_location_idx on booking.staff_locations (location_id);

-- -----------------------------------------------------------------------------
-- Guarda contra ligações entre tenants diferentes
-- -----------------------------------------------------------------------------
-- As tabelas de ligação não têm `tenant_id` — a informação está nas pontas. Sem
-- esta verificação, uma escrita com `service_role` poderia associar a Dra. Ana
-- da Clínica Sorriso a um serviço do Studio Bella, e nenhuma constraint daria
-- por isso. A RLS não chega aqui: o `service_role` contorna-a.

create or replace function booking.tg_assert_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_staff_tenant  uuid;
  v_other_tenant  uuid;
begin
  select tenant_id into v_staff_tenant from booking.staff where id = new.staff_id;

  if tg_table_name = 'staff_services' then
    select tenant_id into v_other_tenant from booking.services where id = new.service_id;
  else
    select tenant_id into v_other_tenant from booking.locations where id = new.location_id;
  end if;

  if v_staff_tenant is distinct from v_other_tenant then
    raise exception
      'Ligação entre empresas diferentes recusada: staff pertence a % e o alvo a %',
      v_staff_tenant, v_other_tenant
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger staff_services_same_tenant
  before insert or update on booking.staff_services
  for each row execute function booking.tg_assert_same_tenant();

create trigger staff_locations_same_tenant
  before insert or update on booking.staff_locations
  for each row execute function booking.tg_assert_same_tenant();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.service_categories enable row level security;
alter table booking.service_categories force  row level security;
alter table booking.services           enable row level security;
alter table booking.services           force  row level security;
alter table booking.staff              enable row level security;
alter table booking.staff              force  row level security;
alter table booking.staff_services     enable row level security;
alter table booking.staff_services     force  row level security;
alter table booking.staff_locations    enable row level security;
alter table booking.staff_locations    force  row level security;

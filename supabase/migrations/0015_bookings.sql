-- =============================================================================
-- 0015 — Clientes, marcações e sessões de grupo
-- =============================================================================
--
-- A tabela que dá nome ao produto. Tudo o que veio antes existe para que estas
-- linhas possam ser escritas com segurança.
--
-- A GARANTIA CENTRAL
--
-- Duas pessoas não podem marcar o mesmo horário com o mesmo profissional. Isso
-- **não** se garante lendo antes de escrever: entre o `select` e o `insert`
-- cabe outra transação, e num dia de campanha cabem dezenas. Garante-se com uma
-- constraint de exclusão, que é o PostgreSQL a serializar por nós.
--
--   EXCLUDE USING gist (staff_id WITH =, blocked_range WITH &&)
--
-- Quem chegar em segundo lugar leva `23P01`. A aplicação traduz isso para
-- `SLOT_TAKEN` e mostra as horas alternativas. Não há retry, não há lock
-- aplicacional, não há fila.
--
-- O CLIENTE É POR EMPRESA
--
-- A Maria da clínica e a Maria do cabeleireiro são duas linhas, ainda que sejam
-- a mesma pessoa com o mesmo número. Uma tabela global de pessoas seria uma
-- fuga entre empresas por construção.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create table if not exists booking.customers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references booking.tenants(id) on delete cascade,

  first_name          text not null check (length(trim(first_name)) >= 1),
  last_name           text,

  -- E.164 sempre. Guardar "912 345 678" torna impossível deduplicar, e a
  -- deduplicação é o que evita ter a mesma pessoa três vezes na base.
  phone_e164          text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_phone_e164 text check (whatsapp_phone_e164 is null or whatsapp_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email               text check (email is null or email = lower(email)),

  locale              text default 'pt-PT',
  timezone            text check (timezone is null or booking.is_valid_timezone(timezone)),
  birth_date          date,

  notes               text,
  tags                text[] not null default '{}',

  is_blocked          boolean not null default false,
  blocked_reason      text,

  -- RGPD: o direito ao apagamento não pode destruir a contabilidade. Anonimizar
  -- substitui os dados pessoais e **preserva** as marcações.
  anonymized_at       timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Sem forma nenhuma de contacto não há como confirmar nem lembrar.
  constraint customers_needs_contact check (
    phone_e164 is not null or email is not null or anonymized_at is not null
  )
);

-- A deduplicação vive aqui, não no código da aplicação. Duas marcações feitas
-- ao mesmo tempo pelo mesmo número não podem criar dois clientes.
create unique index if not exists customers_tenant_phone_uk
  on booking.customers (tenant_id, phone_e164)
  where phone_e164 is not null and anonymized_at is null;

create unique index if not exists customers_tenant_email_uk
  on booking.customers (tenant_id, email)
  where email is not null and anonymized_at is null;

create index if not exists customers_tenant_idx on booking.customers (tenant_id);

create trigger customers_touch before update on booking.customers
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Consentimentos
-- -----------------------------------------------------------------------------
-- Consentimento é um registo de eventos, não uma coluna booleana. A pergunta
-- que o RGPD faz é "prove que ela consentiu, quando e como" — e um `true` não
-- prova nada.
do $$ begin
  create type booking.consent_purpose as enum
    ('reminders','marketing','terms','privacy_policy');
exception when duplicate_object then null; end $$;

create table if not exists booking.customer_consents (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references booking.customers(id) on delete cascade,
  purpose     booking.consent_purpose not null,
  granted     boolean not null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  source      booking.booking_source not null,
  ip          inet,
  evidence    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists customer_consents_customer_idx
  on booking.customer_consents (customer_id, purpose);

-- -----------------------------------------------------------------------------
-- Sessões de grupo
-- -----------------------------------------------------------------------------
-- Uma aula de dez pessoas não pode usar constraint de exclusão: o objetivo é
-- precisamente permitir dez marcações no mesmo intervalo. A garantia é outra —
-- o `UPDATE` do contador serializa os concorrentes e o `CHECK` recusa o
-- décimo primeiro. Ver 0017.
create table if not exists booking.group_sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references booking.tenants(id) on delete cascade,
  location_id   uuid not null references booking.locations(id) on delete restrict,
  service_id    uuid not null references booking.services(id) on delete restrict,
  staff_id      uuid references booking.staff(id) on delete restrict,

  start_at      timestamptz not null,
  end_at        timestamptz not null,
  blocked_range tstzrange not null,

  capacity      int not null check (capacity >= 1),
  booked_count  int not null default 0,
  is_cancelled  boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint group_sessions_time_order check (end_at > start_at),
  constraint group_capacity_not_exceeded check (booked_count <= capacity),
  constraint group_count_not_negative   check (booked_count >= 0)
);

create index if not exists group_sessions_lookup_idx
  on booking.group_sessions (service_id, start_at) where not is_cancelled;

create trigger group_sessions_touch before update on booking.group_sessions
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Marcações
-- -----------------------------------------------------------------------------
create table if not exists booking.bookings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references booking.tenants(id) on delete cascade,
  location_id           uuid not null references booking.locations(id) on delete restrict,
  customer_id           uuid not null references booking.customers(id) on delete restrict,
  service_id            uuid not null references booking.services(id) on delete restrict,
  staff_id              uuid references booking.staff(id) on delete restrict,
  group_session_id      uuid references booking.group_sessions(id) on delete restrict,

  start_at              timestamptz not null,
  end_at                timestamptz not null,

  -- O fuso **em vigor à data da marcação**, não o atual da unidade. Se a
  -- clínica mudar de fuso, as marcações antigas continuam a saber em que hora
  -- local foram feitas.
  timezone              text not null,

  buffer_before_minutes int not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes  int not null default 0 check (buffer_after_minutes  >= 0),

  -- Mantido por trigger. Não pode ser coluna gerada: `timestamptz + interval` é
  -- STABLE, não IMMUTABLE, por causa do horário de verão. Ver DATABASE.md §7.2.
  blocked_range         tstzrange not null,

  -- Esta pode ser gerada: comparação de enums é imutável.
  occupies_slot         boolean generated always as (
                          status in ('pending','awaiting_confirmation','confirmed',
                                     'checked_in','in_progress','completed')
                        ) stored,

  status                booking.booking_status not null default 'pending',
  source                booking.booking_source not null,
  rescheduled_from_id   uuid references booking.bookings(id) on delete set null,

  price                 numeric(12,2) check (price >= 0),
  currency              char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),

  notes                 text,            -- escrito pelo cliente
  internal_notes        text,            -- nunca visível ao cliente
  cancellation_reason   text,

  -- A mesma chave duas vezes dá a mesma marcação, não duas. É o que torna
  -- seguro repetir um pedido que deu timeout.
  idempotency_key       text,
  external_reference    text,

  created_by            uuid references auth.users(id) on delete set null,
  confirmed_at          timestamptz,
  checked_in_at         timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  no_show_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint bookings_time_order check (end_at > start_at),
  constraint bookings_staff_or_group check (staff_id is not null or group_session_id is not null)
);

create unique index if not exists bookings_idempotency_uk
  on booking.bookings (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists bookings_agenda_idx
  on booking.bookings (location_id, start_at) where occupies_slot;

create index if not exists bookings_staff_idx
  on booking.bookings (staff_id, start_at) where occupies_slot;

create index if not exists bookings_customer_idx
  on booking.bookings (customer_id, start_at desc);

create trigger bookings_touch before update on booking.bookings
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- O trigger que calcula o intervalo bloqueado
-- -----------------------------------------------------------------------------
create or replace function booking.tg_bookings_set_range()
returns trigger
language plpgsql
set search_path = booking, pg_catalog
as $$
begin
  -- `[)` — semiaberto. Uma marcação das 10:00 às 10:30 e outra das 10:30 às
  -- 11:00 **não** se sobrepõem. Com `[]` estariam em conflito e metade da
  -- agenda ficava por preencher.
  new.blocked_range := tstzrange(
    new.start_at - make_interval(mins => new.buffer_before_minutes),
    new.end_at   + make_interval(mins => new.buffer_after_minutes),
    '[)'
  );
  return new;
end;
$$;

create trigger bookings_set_range
  before insert or update of start_at, end_at, buffer_before_minutes, buffer_after_minutes
  on booking.bookings
  for each row execute function booking.tg_bookings_set_range();

create or replace function booking.tg_group_sessions_set_range()
returns trigger
language plpgsql
set search_path = booking, pg_catalog
as $$
begin
  new.blocked_range := tstzrange(new.start_at, new.end_at, '[)');
  return new;
end;
$$;

create trigger group_sessions_set_range
  before insert or update of start_at, end_at
  on booking.group_sessions
  for each row execute function booking.tg_group_sessions_set_range();

-- -----------------------------------------------------------------------------
-- A constraint que impede o duplo agendamento
-- -----------------------------------------------------------------------------
-- É esta linha que faz o produto funcionar. Tudo o resto é conveniência.
--
-- As aulas de grupo ficam de fora do predicado de propósito: dez pessoas na
-- mesma sessão de pilates ocupam o mesmo intervalo e isso é o correto.
do $$ begin
  alter table booking.bookings
    add constraint bookings_no_staff_overlap
    exclude using gist (staff_id with =, blocked_range with &&)
    where (occupies_slot and staff_id is not null and group_session_id is null);
exception when duplicate_object then null; end $$;

-- O professor também não pode dar duas aulas ao mesmo tempo.
do $$ begin
  alter table booking.group_sessions
    add constraint group_sessions_no_staff_overlap
    exclude using gist (staff_id with =, blocked_range with &&)
    where (not is_cancelled and staff_id is not null);
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Histórico
-- -----------------------------------------------------------------------------
-- `audit_logs` responde a "quem mexeu nisto". Isto responde a "o que aconteceu
-- a esta marcação" — que é a pergunta que o cliente faz ao telefone.
create table if not exists booking.booking_events (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references booking.bookings(id) on delete cascade,
  tenant_id    uuid not null references booking.tenants(id) on delete cascade,

  from_status  booking.booking_status,
  to_status    booking.booking_status not null,

  actor_type   booking.actor_type not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason       text,
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now()
);

create index if not exists booking_events_booking_idx
  on booking.booking_events (booking_id, created_at);

-- -----------------------------------------------------------------------------
-- Acesso do cliente sem conta
-- -----------------------------------------------------------------------------
-- A promessa é marcar em menos de 60 segundos sem criar conta. Para depois
-- cancelar ou remarcar, o cliente precisa de provar que é ele — e a prova é um
-- token de uso limitado enviado para o contacto que ele próprio deu.
--
-- Guarda-se o **hash**, nunca o token. Quem ler a base de dados não consegue
-- gerar links de acesso às marcações dos outros.
create table if not exists booking.access_tokens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references booking.tenants(id) on delete cascade,
  booking_id  uuid references booking.bookings(id) on delete cascade,
  customer_id uuid not null references booking.customers(id) on delete cascade,

  token_hash  text not null unique,
  purpose     text not null check (purpose in ('manage_booking','confirm','review')),

  expires_at  timestamptz not null,
  used_at     timestamptz,
  uses        int not null default 0,
  max_uses    int not null default 10 check (max_uses >= 1),

  created_at  timestamptz not null default now()
);

create index if not exists access_tokens_booking_idx
  on booking.access_tokens (booking_id);

-- -----------------------------------------------------------------------------
-- RLS: ligada antes de qualquer política, como sempre
-- -----------------------------------------------------------------------------
-- "Automatically expose new tables" está ligado neste projeto. Uma tabela sem
-- RLS fica exposta na API no momento em que é criada.
alter table booking.customers          enable row level security;
alter table booking.customers          force  row level security;
alter table booking.customer_consents  enable row level security;
alter table booking.customer_consents  force  row level security;
alter table booking.group_sessions     enable row level security;
alter table booking.group_sessions     force  row level security;
alter table booking.bookings           enable row level security;
alter table booking.bookings           force  row level security;
alter table booking.booking_events     enable row level security;
alter table booking.booking_events     force  row level security;
alter table booking.access_tokens      enable row level security;
alter table booking.access_tokens      force  row level security;

comment on table booking.bookings is
  'Marcações. O isolamento entre empresas é da RLS; a ausência de duplo agendamento é da constraint de exclusão.';
comment on column booking.bookings.blocked_range is
  'Intervalo ocupado, buffers incluídos. Mantido por trigger — timestamptz + interval não é IMMUTABLE.';
comment on column booking.bookings.timezone is
  'O fuso em vigor à data da marcação, não o atual da unidade.';

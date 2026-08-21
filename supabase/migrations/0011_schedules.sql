-- =============================================================================
-- 0011 — Horários, exceções e ausências
-- Totalmobi Booking · Milestone 6
--
-- É daqui que o motor de disponibilidade (M7) tira tudo. Quatro fontes, com
-- precedências diferentes:
--
--   schedule_exceptions (kind='closed')   ← ganha sempre
--     > staff_time_off
--     > schedule_exceptions (kind='open')
--     > staff_working_hours ∩ location_business_hours
--
-- A ordem não é arbitrária: um feriado tem de fechar a clínica mesmo que
-- alguém tenha marcado uma abertura extraordinária nesse dia, e as férias de
-- um profissional têm de valer mesmo que a unidade esteja aberta.
--
-- HORA LOCAL, NÃO INSTANTE
--
-- Os horários recorrentes guardam-se como `time` + `weekday`, nunca como
-- `timestamptz`. "Abro às 9" é uma afirmação sobre o relógio de parede e tem de
-- continuar verdadeira depois da mudança da hora — se fosse guardada como
-- instante, a clínica passava a abrir às 8 ou às 10 duas vezes por ano.
--
-- As ausências são o contrário: umas férias começam num instante concreto, por
-- isso são `timestamptz`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Horário de funcionamento da unidade
-- -----------------------------------------------------------------------------
-- Várias linhas por dia = vários períodos. É assim que se exprime o fecho para
-- almoço: 09:00–13:00 e 14:00–19:00 são duas linhas de segunda-feira.

create table booking.location_business_hours (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references booking.locations(id) on delete cascade,

  -- 0 = domingo, para bater com EXTRACT(DOW) do PostgreSQL e com o
  -- `weekdayInZone()` de packages/shared.
  weekday     smallint not null check (weekday between 0 and 6),

  opens_at    time not null,
  closes_at   time not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint location_hours_order check (opens_at < closes_at)
);

create index location_business_hours_lookup_idx
  on booking.location_business_hours (location_id, weekday);

create trigger location_business_hours_touch before update on booking.location_business_hours
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Horário de trabalho do profissional
-- -----------------------------------------------------------------------------

create table booking.staff_working_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references booking.staff(id) on delete cascade,
  location_id uuid not null references booking.locations(id) on delete cascade,

  weekday     smallint not null check (weekday between 0 and 6),
  starts_at   time not null,
  ends_at     time not null,

  -- Validade. Permite "a partir de setembro passo a trabalhar às sextas" sem
  -- apagar o horário antigo — que é o que explica as marcações de agosto.
  valid_from  date,
  valid_until date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint staff_hours_order check (starts_at < ends_at),
  constraint staff_hours_validity check (valid_until is null or valid_from is null or valid_from <= valid_until)
);

create index staff_working_hours_lookup_idx
  on booking.staff_working_hours (staff_id, weekday);

create index staff_working_hours_location_idx
  on booking.staff_working_hours (location_id, weekday);

create trigger staff_working_hours_touch before update on booking.staff_working_hours
  for each row execute function booking.touch_updated_at();

-- O profissional tem de trabalhar numa unidade onde está colocado. Sem isto,
-- uma escrita com `service_role` podia dar-lhe horário numa unidade de outra
-- empresa — e nenhuma constraint daria por isso.
create or replace function booking.tg_working_hours_check_tenant()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_staff_tenant    uuid;
  v_location_tenant uuid;
begin
  select tenant_id into v_staff_tenant    from booking.staff     where id = new.staff_id;
  select tenant_id into v_location_tenant from booking.locations where id = new.location_id;

  if v_staff_tenant is distinct from v_location_tenant then
    raise exception 'Horário entre empresas diferentes recusado: staff em % e unidade em %',
      v_staff_tenant, v_location_tenant
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger staff_working_hours_same_tenant
  before insert or update on booking.staff_working_hours
  for each row execute function booking.tg_working_hours_check_tenant();

-- -----------------------------------------------------------------------------
-- Exceções: feriados, fechos e aberturas extraordinárias
-- -----------------------------------------------------------------------------
-- Aplicam-se a um de três níveis. Exatamente um dos `*_id` é preenchido —
-- imposto por CHECK, porque uma exceção "de toda a gente e de ninguém" seria
-- impossível de resolver no motor.

do $$ begin
  create type booking.exception_kind as enum ('closed', 'open');
exception when duplicate_object then null; end $$;

create table booking.schedule_exceptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references booking.tenants(id) on delete cascade,

  -- Âmbito: um destes três, e só um.
  scope_tenant   boolean not null default false,
  location_id    uuid references booking.locations(id) on delete cascade,
  staff_id       uuid references booking.staff(id) on delete cascade,

  date        date not null,
  kind        booking.exception_kind not null,

  -- NULL nos dois = o dia inteiro. Com horas = só aquele intervalo.
  starts_at   time,
  ends_at     time,

  reason      text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,

  constraint schedule_exception_scope check (
    (scope_tenant and location_id is null and staff_id is null)
    or (not scope_tenant and location_id is not null and staff_id is null)
    or (not scope_tenant and location_id is null and staff_id is not null)
  ),

  -- Ou o dia inteiro, ou um intervalo completo. Meia definição não se resolve.
  constraint schedule_exception_hours check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and starts_at < ends_at)
  ),

  -- Uma abertura extraordinária sem horas seria "aberto o dia todo, das
  -- nenhuma às nenhuma" — não diz nada ao motor.
  constraint schedule_exception_open_needs_hours check (
    kind <> 'open' or starts_at is not null
  )
);

create index schedule_exceptions_date_idx on booking.schedule_exceptions (tenant_id, date);
create index schedule_exceptions_location_idx on booking.schedule_exceptions (location_id, date)
  where location_id is not null;
create index schedule_exceptions_staff_idx on booking.schedule_exceptions (staff_id, date)
  where staff_id is not null;

-- -----------------------------------------------------------------------------
-- Ausências: férias, baixas, formações, bloqueios
-- -----------------------------------------------------------------------------
-- Ao contrário dos horários, estas são instantes concretos: umas férias começam
-- numa data e hora, não num dia da semana.

create table booking.staff_time_off (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references booking.staff(id) on delete cascade,

  starts_at   timestamptz not null,
  ends_at     timestamptz not null,

  -- `tstzrange(timestamptz, timestamptz, text)` É imutável — ao contrário de
  -- `timestamptz + interval`, que é STABLE por causa do DST e por isso não
  -- pode entrar numa coluna gerada (ver a nota em DATABASE.md §7.2).
  -- Aqui as duas pontas são dadas, logo a coluna gerada funciona.
  period      tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

  kind        booking.time_off_kind not null default 'vacation',
  reason      text,
  is_all_day  boolean not null default true,

  approved_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,

  constraint time_off_order check (ends_at > starts_at),

  -- O mesmo profissional não pode ter duas ausências sobrepostas. Não é
  -- pedantismo: sobrepostas, ninguém sabe qual é a razão real da falta, e o
  -- relatório de assiduidade conta o mesmo dia duas vezes.
  constraint staff_time_off_no_overlap
    exclude using gist (staff_id with =, period with &&)
);

create index staff_time_off_lookup_idx on booking.staff_time_off using gist (staff_id, period);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table booking.location_business_hours enable row level security;
alter table booking.location_business_hours force  row level security;
alter table booking.staff_working_hours     enable row level security;
alter table booking.staff_working_hours     force  row level security;
alter table booking.schedule_exceptions     enable row level security;
alter table booking.schedule_exceptions     force  row level security;
alter table booking.staff_time_off          enable row level security;
alter table booking.staff_time_off          force  row level security;

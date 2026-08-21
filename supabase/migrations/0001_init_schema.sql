-- =============================================================================
-- 0001 — Schema, extensões, enums e utilitários
-- Totalmobi Booking · Milestone 1
--
-- O schema `booking` vive no mesmo projeto Supabase que o Totalmobi CMS
-- (ulpsaxhocvezcohbndpz). O `public` é do CMS (tabelas `tot_*`) e NUNCA é
-- tocado por estas migrations.
-- =============================================================================

create schema if not exists booking;

comment on schema booking is
  'Totalmobi Booking — SaaS multi-tenant de agendamento. Isolado do schema public, que pertence ao Totalmobi CMS.';

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
-- btree_gist permite pôr um uuid com operador `=` dentro de um índice GiST ao
-- lado de um range com `&&`. Sem ele a constraint de exclusão que impede o
-- double booking (Milestone 8) não é sequer criável. Fica aqui para que a
-- migration que a cria não dependa de nenhum passo manual.
create extension if not exists btree_gist;

-- Nota deliberada: NÃO se usa `citext`. A sua localização varia entre projetos
-- Supabase (schema `extensions` vs `public`) e resolver o tipo por search_path
-- é uma fonte de falhas silenciosas. Em vez disso: colunas `text` normalizadas
-- para minúsculas à entrada, com CHECK a garanti-lo e índices únicos normais.

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

do $$ begin
  create type booking.tenant_status as enum
    ('trial','active','past_due','suspended','cancelled');
exception when duplicate_object then null; end $$;

-- `super_admin` não está aqui de propósito: não é um papel dentro de um tenant.
-- Vive em booking.platform_admins. Ver DATABASE.md, secção 4.2.
do $$ begin
  create type booking.member_role as enum
    ('tenant_admin','manager','staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.actor_type as enum
    ('user','customer','system','bot','platform_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.booking_status as enum
    ('pending','awaiting_confirmation','confirmed','checked_in','in_progress',
     'completed','cancelled_customer','cancelled_business','no_show','rescheduled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.booking_source as enum
    ('public_web','widget','whatsapp','voice','admin','api','import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.notification_channel as enum
    ('whatsapp','email','sms','push');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.notification_type as enum
    ('booking_created','booking_confirmed','reminder','cancelled','rescheduled',
     'changed_by_business','follow_up','waitlist_offer','no_show_followup');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.notification_status as enum
    ('pending','processing','sent','delivered','read','failed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.conversation_channel as enum
    ('whatsapp','web_chat','instagram','messenger','voice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.conversation_state as enum
    ('NEW','IDENTIFYING_INTENT','SELECTING_LOCATION','SELECTING_SERVICE',
     'SELECTING_STAFF','SELECTING_DATE','SELECTING_SLOT',
     'COLLECTING_CUSTOMER_DATA','CONFIRMING','BOOKED','MANAGING_BOOKING',
     'WAITING_HUMAN','HUMAN','BOT_RESUMED','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.message_direction as enum ('inbound','outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.webhook_status as enum
    ('received','processing','processed','failed','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.time_off_kind as enum
    ('vacation','sick_leave','holiday','block','training','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.resource_kind as enum
    ('room','chair','equipment','vehicle','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking.waitlist_status as enum
    ('active','offered','converted','expired','cancelled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

create or replace function booking.touch_updated_at()
returns trigger
language plpgsql
set search_path = booking, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function booking.touch_updated_at() is
  'Trigger BEFORE UPDATE: mantém updated_at. Aplicado a todas as tabelas de negócio.';

-- Validação de fuso horário IANA ao nível da base de dados.
-- Um fuso inválido numa location faz o motor de disponibilidade calcular horas
-- erradas em silêncio; mais vale recusar à entrada.
create or replace function booking.is_valid_timezone(p_timezone text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_dummy timestamptz;
begin
  if p_timezone is null then
    return false;
  end if;
  v_dummy := timestamptz '2000-01-01 00:00:00Z' at time zone p_timezone;
  return true;
exception when others then
  return false;
end;
$$;

comment on function booking.is_valid_timezone(text) is
  'True se o texto for um identificador IANA reconhecido por este servidor.';

-- -----------------------------------------------------------------------------
-- Grants de schema
-- -----------------------------------------------------------------------------
-- USAGE apenas. Os privilégios de tabela são atribuídos um a um, na migration
-- de políticas — nunca `grant all`.
grant usage on schema booking to anon, authenticated, service_role;

-- Sem privilégios por omissão para objetos futuros: cada tabela nova tem de
-- receber grants explícitos, o que obriga a pensar em quem a pode ler.
alter default privileges in schema booking revoke all on tables from anon, authenticated;

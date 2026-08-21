-- =============================================================================
-- 0020 — Toda a transição escreve também no audit log
-- =============================================================================
--
-- `booking_events` e `audit_logs` respondem a perguntas diferentes, e é por
-- isso que existem os dois:
--
--   • `booking_events` — "o que aconteceu a **esta marcação**". É a pergunta
--     que o cliente faz ao telefone, e a que o balcão precisa de responder.
--   • `audit_logs`     — "o que se passou **nesta empresa**". É a pergunta de
--     quem investiga, e atravessa marcações, horários e permissões.
--
-- Escrever só num deles deixa sempre uma das perguntas sem resposta: um evento
-- de marcação não aparece na revisão de segurança, e uma linha de auditoria não
-- reconstrói o historial de um cliente.
-- =============================================================================

create or replace function booking.confirm_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare v_b record;
begin
  select * into v_b from booking.bookings where id = p_booking_id;
  if not found then raise exception 'Marcação inexistente' using errcode = 'P0002'; end if;

  if not (v_b.tenant_id = any ((select booking.current_tenant_ids())::uuid[])
          or booking.is_platform_admin()) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if v_b.status not in ('pending','awaiting_confirmation') then
    raise exception 'Só se confirma o que está pendente (estado atual: %)', v_b.status
      using errcode = 'P0005';
  end if;

  update booking.bookings set status = 'confirmed', confirmed_at = now()
   where id = p_booking_id;

  insert into booking.booking_events (booking_id, tenant_id, from_status, to_status, actor_type, actor_user_id, reason)
  values (p_booking_id, v_b.tenant_id, v_b.status, 'confirmed', 'user', auth.uid(), p_reason);

  perform booking.write_audit_log(
    v_b.tenant_id, 'user', 'booking.confirmed', 'booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed'));

  return jsonb_build_object('bookingId', p_booking_id, 'status', 'confirmed');
end;
$$;

create or replace function booking.cancel_booking(
  p_booking_id uuid,
  p_reason     text default null,
  p_by_customer boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_b      record;
  v_policy record;
  v_novo   booking.booking_status;
  v_ator   booking.actor_type;
begin
  select * into v_b from booking.bookings where id = p_booking_id;
  if not found then raise exception 'Marcação inexistente' using errcode = 'P0002'; end if;

  if not p_by_customer
     and not (v_b.tenant_id = any ((select booking.current_tenant_ids())::uuid[])
              or booking.is_platform_admin()) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if v_b.status in ('cancelled_customer','cancelled_business','completed','no_show') then
    raise exception 'A marcação já está em %', v_b.status using errcode = 'P0005';
  end if;

  select * into v_policy from booking.tenant_policies where tenant_id = v_b.tenant_id;

  -- A política de cancelamento vale para o cliente, não para a empresa. Uma
  -- clínica tem sempre de poder cancelar — é ela que fecha por doença do
  -- profissional, e nesse dia a antecedência é zero.
  if p_by_customer and not v_policy.allow_customer_cancel then
    raise exception 'Esta empresa não permite cancelamento pelo cliente' using errcode = 'P0006';
  end if;

  if p_by_customer
     and v_b.start_at < now() + make_interval(hours => v_policy.cancellation_min_hours) then
    raise exception 'O cancelamento exige % horas de antecedência', v_policy.cancellation_min_hours
      using errcode = 'P0006';
  end if;

  v_novo := case when p_by_customer then 'cancelled_customer'::booking.booking_status
                 else 'cancelled_business'::booking.booking_status end;
  v_ator := case when p_by_customer then 'customer'::booking.actor_type
                 else 'user'::booking.actor_type end;

  update booking.bookings
     set status = v_novo, cancelled_at = now(), cancellation_reason = p_reason
   where id = p_booking_id;

  -- Libertar a vaga da turma. Sem isto, uma aula ficava cheia de desistências.
  if v_b.group_session_id is not null then
    update booking.group_sessions
       set booked_count = greatest(booked_count - 1, 0)
     where id = v_b.group_session_id;
  end if;

  insert into booking.booking_events (booking_id, tenant_id, from_status, to_status, actor_type, actor_user_id, reason)
  values (p_booking_id, v_b.tenant_id, v_b.status, v_novo, v_ator, auth.uid(), p_reason);

  perform booking.write_audit_log(
    v_b.tenant_id, v_ator, 'booking.cancelled', 'booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status),
    jsonb_build_object('status', v_novo, 'reason', p_reason));

  return jsonb_build_object('bookingId', p_booking_id, 'status', v_novo);
end;
$$;

create or replace function booking.reschedule_booking(
  p_booking_id uuid,
  p_new_start  timestamptz,
  p_new_staff  uuid default null,
  p_reason     text default null,
  p_by_customer boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_b       record;
  v_policy  record;
  v_staff   uuid;
  v_duracao int;
  v_end     timestamptz;
  v_novo    uuid;
  v_ator    booking.actor_type;
begin
  select * into v_b from booking.bookings where id = p_booking_id;
  if not found then raise exception 'Marcação inexistente' using errcode = 'P0002'; end if;

  if not p_by_customer
     and not (v_b.tenant_id = any ((select booking.current_tenant_ids())::uuid[])
              or booking.is_platform_admin()) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if not v_b.occupies_slot then
    raise exception 'Não se remarca uma marcação em %', v_b.status using errcode = 'P0005';
  end if;

  if v_b.group_session_id is not null then
    raise exception 'Aulas de grupo não se remarcam: cancela-se e inscreve-se noutra'
      using errcode = 'P0005';
  end if;

  select * into v_policy from booking.tenant_policies where tenant_id = v_b.tenant_id;

  if p_by_customer and not v_policy.allow_customer_reschedule then
    raise exception 'Esta empresa não permite remarcação pelo cliente' using errcode = 'P0006';
  end if;

  if p_by_customer
     and v_b.start_at < now() + make_interval(hours => v_policy.reschedule_min_hours) then
    raise exception 'A remarcação exige % horas de antecedência', v_policy.reschedule_min_hours
      using errcode = 'P0006';
  end if;

  v_ator := case when p_by_customer then 'customer'::booking.actor_type
                 else 'user'::booking.actor_type end;

  v_staff := coalesce(p_new_staff, v_b.staff_id);
  v_duracao := extract(epoch from (v_b.end_at - v_b.start_at))::int / 60;
  v_end := p_new_start + make_interval(mins => v_duracao);

  if not booking.is_within_working_hours(v_staff, v_b.location_id, p_new_start, v_end) then
    raise exception 'A nova hora está fora do horário de trabalho' using errcode = 'P0003';
  end if;

  -- A antiga sai primeiro. Sem isto, remarcar para meia hora depois colidiria
  -- com a própria marcação que se está a mover.
  update booking.bookings
     set status = 'rescheduled', cancelled_at = now(), cancellation_reason = p_reason
   where id = p_booking_id;

  insert into booking.bookings (
    tenant_id, location_id, customer_id, service_id, staff_id,
    start_at, end_at, timezone, buffer_before_minutes, buffer_after_minutes,
    status, source, notes, rescheduled_from_id, price, currency, created_by
  )
  select
    v_b.tenant_id, v_b.location_id, v_b.customer_id, v_b.service_id, v_staff,
    p_new_start, v_end, v_b.timezone, v_b.buffer_before_minutes, v_b.buffer_after_minutes,
    v_b.status, v_b.source, v_b.notes, p_booking_id, v_b.price, v_b.currency, auth.uid()
  returning id into v_novo;

  insert into booking.booking_events (booking_id, tenant_id, from_status, to_status, actor_type, actor_user_id, reason, metadata)
  values
    (p_booking_id, v_b.tenant_id, v_b.status, 'rescheduled', v_ator, auth.uid(), p_reason,
     jsonb_build_object('novaMarcacao', v_novo)),
    (v_novo, v_b.tenant_id, null, v_b.status, v_ator, auth.uid(), p_reason,
     jsonb_build_object('marcacaoAnterior', p_booking_id));

  perform booking.write_audit_log(
    v_b.tenant_id, v_ator, 'booking.rescheduled', 'booking', p_booking_id::text,
    jsonb_build_object('startAt', v_b.start_at, 'staffId', v_b.staff_id),
    jsonb_build_object('startAt', p_new_start, 'staffId', v_staff, 'novaMarcacao', v_novo));

  return jsonb_build_object('bookingId', v_novo, 'anterior', p_booking_id,
                            'startAt', p_new_start, 'endAt', v_end);
end;
$$;

-- A criação também, e por trigger em vez de à mão: assim vale para as marcações
-- criadas pelo balcão com um `insert` direto, não só para as que passam pela
-- função. Um audit log que só regista o caminho feliz não serve para investigar
-- nada.
create or replace function booking.tg_bookings_audit_insert()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  perform booking.write_audit_log(
    new.tenant_id,
    case when auth.uid() is null then 'customer'::booking.actor_type
         else 'user'::booking.actor_type end,
    'booking.created', 'booking', new.id::text,
    null,
    jsonb_build_object('startAt', new.start_at, 'staffId', new.staff_id,
                       'serviceId', new.service_id, 'status', new.status),
    new.source::text);
  return null;
end;
$$;

drop trigger if exists bookings_audit_insert on booking.bookings;
create trigger bookings_audit_insert
  after insert on booking.bookings
  for each row execute function booking.tg_bookings_audit_insert();

revoke execute on function booking.confirm_booking(uuid, text) from public;
grant  execute on function booking.confirm_booking(uuid, text) to authenticated, service_role;
revoke execute on function booking.cancel_booking(uuid, text, boolean) from public;
grant  execute on function booking.cancel_booking(uuid, text, boolean) to authenticated, service_role;
revoke execute on function booking.reschedule_booking(uuid, timestamptz, uuid, text, boolean) from public;
grant  execute on function booking.reschedule_booking(uuid, timestamptz, uuid, text, boolean) to authenticated, service_role;

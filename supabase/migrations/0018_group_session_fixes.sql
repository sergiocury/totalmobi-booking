-- =============================================================================
-- 0018 — Duas correções que o teste de concorrência expôs
-- =============================================================================
--
-- O teste "dez inscrições numa turma de cinco" passou à primeira: cinco
-- aceites, cinco recusadas. Mas mostrou duas coisas erradas que só se veem
-- olhando para as respostas.
--
-- 1. **`vagasRestantes` dizia 4 às cinco inscrições.** O contador era lido
--    antes do `UPDATE`, portanto valia sempre 0 e a conta dava sempre `5-0-1`.
--    Os cinco clientes recebiam "restam 4 vagas" ao mesmo tempo. Corrige-se
--    lendo o valor **que o próprio `UPDATE` devolve** — que é o único correto,
--    porque é o que a linha tem depois de a transação a ter bloqueado.
--
-- 2. **A recusa devolvia o erro cru do `CHECK` a um visitante anónimo**,
--    incluindo `Failing row contains (...)` com a linha toda. Não é uma fuga
--    grave — são ids que o cliente já tinha —, mas expor constraints internas
--    numa API pública é como devolver stack traces: dá ao atacante o mapa da
--    casa e ao utilizador uma mensagem que ele não percebe.
--
-- A garantia de concorrência não muda: continua a ser o `UPDATE` a serializar
-- e o `CHECK` a recusar. Só se passa a apanhar a recusa e a traduzi-la.
-- =============================================================================

create or replace function booking.join_group_session(
  p_session_id      uuid,
  p_customer        jsonb,
  p_source          booking.booking_source,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_sessao   record;
  v_customer uuid;
  v_booking  uuid;
  v_tz       text;
  v_ocupadas int;
begin
  select * into v_sessao from booking.group_sessions
   where id = p_session_id and not is_cancelled;

  if not found then
    raise exception 'Sessão indisponível' using errcode = 'P0002';
  end if;

  if not booking.can_read_availability(v_sessao.tenant_id) then
    raise exception 'Sessão indisponível' using errcode = 'P0002';
  end if;

  if v_sessao.start_at < now() then
    raise exception 'Essa sessão já começou' using errcode = 'P0003';
  end if;

  select timezone into v_tz from booking.locations where id = v_sessao.location_id;

  v_customer := booking.upsert_customer(
    v_sessao.tenant_id,
    p_customer->>'firstName', p_customer->>'lastName',
    p_customer->>'phone',     p_customer->>'email'
  );

  -- A mesma pessoa não se inscreve duas vezes na mesma aula. Sem isto, dois
  -- toques no botão davam dois lugares ocupados pela mesma pessoa — e numa
  -- turma de cinco isso é 20% da sala.
  if exists (
    select 1 from booking.bookings b
    where b.group_session_id = p_session_id
      and b.customer_id = v_customer
      and b.occupies_slot
  ) then
    raise exception 'Já está inscrito nesta sessão' using errcode = 'P0007';
  end if;

  -- Esta linha é a serialização: quem chegar depois espera aqui. E o valor
  -- devolvido é o único contador de confiança — o que a linha tem agora.
  begin
    update booking.group_sessions
       set booked_count = booked_count + 1
     where id = p_session_id
    returning booked_count into v_ocupadas;
  exception
    when check_violation then
      raise exception 'A sessão está cheia' using errcode = 'P0008';
  end;

  insert into booking.bookings (
    tenant_id, location_id, customer_id, service_id, staff_id, group_session_id,
    start_at, end_at, timezone, status, source, idempotency_key, created_by
  ) values (
    v_sessao.tenant_id, v_sessao.location_id, v_customer, v_sessao.service_id,
    v_sessao.staff_id, p_session_id,
    v_sessao.start_at, v_sessao.end_at, v_tz, 'confirmed', p_source,
    p_idempotency_key, auth.uid()
  )
  returning id into v_booking;

  insert into booking.booking_events (booking_id, tenant_id, from_status, to_status, actor_type)
  values (v_booking, v_sessao.tenant_id, null, 'confirmed',
          case when auth.uid() is null then 'customer'::booking.actor_type
               else 'user'::booking.actor_type end);

  return jsonb_build_object(
    'bookingId',      v_booking,
    'customerId',     v_customer,
    'lugar',          v_ocupadas,
    'vagasRestantes', v_sessao.capacity - v_ocupadas
  );
end;
$$;

grant execute on function booking.join_group_session(uuid, jsonb, booking.booking_source, text)
  to anon, authenticated, service_role;

comment on function booking.join_group_session(uuid, jsonb, booking.booking_source, text) is
  'Inscrição numa aula. A concorrência resolve-se pelo UPDATE do contador, não por constraint de exclusão — dez pessoas na mesma aula é o objetivo.';

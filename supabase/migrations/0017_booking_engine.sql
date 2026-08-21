-- =============================================================================
-- 0017 — O motor transacional
-- =============================================================================
--
-- Aqui não se lê para depois escrever. Lê-se *e* escreve-se na mesma
-- transação, e quem perder a corrida leva `23P01` da constraint de exclusão.
--
-- POR QUE É QUE ISTO NÃO PODE VIVER NO TYPESCRIPT
--
-- Um `create_booking` em TypeScript teria de: verificar disponibilidade,
-- decidir, e inserir. Entre a verificação e a inserção há uma janela — de
-- milissegundos, mas suficiente. Num anúncio de campanha, dezenas de pessoas
-- carregam no mesmo slot no mesmo segundo. A janela deixa de ser teórica.
--
-- A ÚNICA GARANTIA QUE INTERESSA
--
--   insert ... → 23P01 → SLOT_TAKEN → "essa hora acabou de ser ocupada, veja estas"
--
-- Não há retry, não há lock aplicacional, não há fila. O PostgreSQL serializa.
--
-- O QUE ESTA VALIDAÇÃO **NÃO** É
--
-- `is_within_working_hours()` responde sim/não sobre um intervalo concreto. Não
-- gera slots, não conhece grelhas nem antecedência — isso é do motor em
-- TypeScript, e continua a ser o único sítio onde essa lógica vive.
--
-- Existe porque o caminho público aceita pedidos de qualquer pessoa. Sem ela,
-- bastava um `POST` à mão para marcar às 3 da manhã de domingo. É uma guarda de
-- fronteira, não uma segunda implementação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A guarda de fronteira
-- -----------------------------------------------------------------------------
create or replace function booking.is_within_working_hours(
  p_staff_id    uuid,
  p_location_id uuid,
  p_start_at    timestamptz,
  p_end_at      timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_tz       text;
  v_tenant   uuid;
  v_data     date;
  v_weekday  int;
begin
  select timezone, tenant_id into v_tz, v_tenant
    from booking.locations where id = p_location_id;

  if v_tz is null then return false; end if;

  -- O dia é o dia **local da unidade**. Uma marcação às 00:30 de Lisboa
  -- pertence ao dia anterior em UTC, e usar UTC aqui daria o horário errado
  -- duas vezes por dia.
  v_data := (p_start_at at time zone v_tz)::date;
  v_weekday := extract(dow from v_data)::int;

  -- 1. Ausência do profissional ganha a tudo.
  if exists (
    select 1 from booking.staff_time_off t
    where t.staff_id = p_staff_id
      and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    return false;
  end if;

  -- 2. Fecho por exceção — dia inteiro ou faixa horária, em qualquer âmbito.
  if exists (
    select 1 from booking.schedule_exceptions e
    where e.tenant_id = v_tenant
      and e.date = v_data
      and e.kind = 'closed'
      and (e.scope_tenant or e.location_id = p_location_id or e.staff_id = p_staff_id)
      and (
        e.starts_at is null
        or tstzrange(
             ((e.date + e.starts_at) at time zone v_tz),
             ((e.date + e.ends_at)   at time zone v_tz), '[)'
           ) && tstzrange(p_start_at, p_end_at, '[)')
      )
  ) then
    return false;
  end if;

  -- 3. Abertura extraordinária: se uma exceção `open` cobre o intervalo, chega.
  if exists (
    select 1 from booking.schedule_exceptions e
    where e.tenant_id = v_tenant
      and e.date = v_data
      and e.kind = 'open'
      and e.starts_at is not null
      and (e.scope_tenant or e.location_id = p_location_id or e.staff_id = p_staff_id)
      and tstzrange(
            ((e.date + e.starts_at) at time zone v_tz),
            ((e.date + e.ends_at)   at time zone v_tz), '[)'
          ) @> tstzrange(p_start_at, p_end_at, '[)')
  ) then
    return true;
  end if;

  -- 4. O caso normal: um período do profissional **e** um da unidade que,
  --    juntos, contenham o intervalo todo.
  return exists (
    select 1
    from booking.staff_working_hours w
    join booking.location_business_hours h
      on h.location_id = w.location_id and h.weekday = w.weekday
    where w.staff_id = p_staff_id
      and w.location_id = p_location_id
      and w.weekday = v_weekday
      and (w.valid_from  is null or w.valid_from  <= v_data)
      and (w.valid_until is null or w.valid_until >= v_data)
      and tstzrange(
            ((v_data + greatest(w.starts_at, h.opens_at))  at time zone v_tz),
            ((v_data + least(w.ends_at,     h.closes_at))  at time zone v_tz), '[)'
          ) @> tstzrange(p_start_at, p_end_at, '[)')
  );
end;
$$;

comment on function booking.is_within_working_hours(uuid, uuid, timestamptz, timestamptz) is
  'Guarda de fronteira: o intervalo cabe no horário? Não gera slots — isso é do motor em TypeScript.';

-- -----------------------------------------------------------------------------
-- Deduplicação de clientes
-- -----------------------------------------------------------------------------
-- A mesma pessoa a marcar duas vezes não pode virar dois clientes. A chave é o
-- telefone em E.164 dentro do tenant; o email serve de segunda tentativa.
create or replace function booking.upsert_customer(
  p_tenant_id uuid,
  p_first_name text,
  p_last_name  text,
  p_phone      text,
  p_email      text,
  p_locale     text default 'pt-PT'
)
returns uuid
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id uuid;
  v_email text := lower(nullif(trim(p_email), ''));
  v_phone text := nullif(trim(p_phone), '');
begin
  if v_phone is null and v_email is null then
    raise exception 'É preciso telefone ou email' using errcode = '22023';
  end if;

  if v_phone is not null then
    select id into v_id from booking.customers
     where tenant_id = p_tenant_id and phone_e164 = v_phone and anonymized_at is null;
  end if;

  if v_id is null and v_email is not null then
    select id into v_id from booking.customers
     where tenant_id = p_tenant_id and email = v_email and anonymized_at is null;
  end if;

  if v_id is not null then
    -- Atualiza-se o que estava em falta, nunca se apaga o que já lá estava:
    -- quem marca pelo WhatsApp dá o primeiro nome, e isso não pode deitar
    -- fora o apelido que já se sabia.
    update booking.customers set
      first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
      last_name  = coalesce(nullif(trim(p_last_name),  ''), last_name),
      phone_e164 = coalesce(phone_e164, v_phone),
      email      = coalesce(email, v_email)
    where id = v_id;

    return v_id;
  end if;

  insert into booking.customers (tenant_id, first_name, last_name, phone_e164, email, locale)
  values (p_tenant_id, coalesce(nullif(trim(p_first_name), ''), 'Cliente'),
          nullif(trim(p_last_name), ''), v_phone, v_email, coalesce(p_locale, 'pt-PT'))
  -- Duas marcações simultâneas do mesmo número: o índice único trava a segunda
  -- e devolve-se a linha que a primeira criou.
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    if v_phone is not null then
      select id into v_id from booking.customers
       where tenant_id = p_tenant_id and phone_e164 = v_phone and anonymized_at is null;
    else
      select id into v_id from booking.customers
       where tenant_id = p_tenant_id and email = v_email and anonymized_at is null;
    end if;
  end if;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Token de acesso do cliente sem conta
-- -----------------------------------------------------------------------------
-- Devolve o token em claro **uma única vez**. Na base fica só o SHA-256.
create or replace function booking.issue_access_token(
  p_tenant_id   uuid,
  p_booking_id  uuid,
  p_customer_id uuid,
  p_purpose     text default 'manage_booking',
  p_valid_days  int  default 180
)
returns text
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_token text;
begin
  -- Dois UUID v4 dão ~244 bits de aleatoriedade. Chega, e evita depender da
  -- extensão pgcrypto só para ter `gen_random_bytes`.
  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  insert into booking.access_tokens
    (tenant_id, booking_id, customer_id, token_hash, purpose, expires_at)
  values
    (p_tenant_id, p_booking_id, p_customer_id,
     encode(sha256(v_token::bytea), 'hex'), p_purpose, now() + make_interval(days => p_valid_days));

  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Criar marcação
-- -----------------------------------------------------------------------------
create or replace function booking.create_booking_atomic(
  p_location_id     uuid,
  p_service_id      uuid,
  p_start_at        timestamptz,
  p_customer        jsonb,
  p_source          booking.booking_source,
  p_staff_id        uuid default null,
  p_notes           text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_tenant     uuid;
  v_tz         text;
  v_service    record;
  v_policy     record;
  v_customer   uuid;
  v_staff      uuid;
  v_duracao    int;
  v_end        timestamptz;
  v_status     booking.booking_status;
  v_booking    uuid;
  v_token      text;
  v_candidatos uuid[];
  v_existente  record;
begin
  -- 1. Idempotência primeiro. Repetir um pedido que deu timeout tem de ser
  --    seguro, e "seguro" quer dizer devolver a mesma marcação, não criar outra.
  if p_idempotency_key is not null then
    select b.id, b.status into v_existente
      from booking.bookings b
      join booking.locations l on l.id = b.location_id
     where l.id = p_location_id and b.idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object('bookingId', v_existente.id, 'status', v_existente.status,
                                'idempotent', true);
    end if;
  end if;

  select tenant_id, timezone into v_tenant, v_tz
    from booking.locations
   where id = p_location_id and is_active and archived_at is null;

  if v_tenant is null or not booking.can_read_availability(v_tenant) then
    raise exception 'Unidade indisponível' using errcode = 'P0002';
  end if;

  select * into v_service from booking.services
   where id = p_service_id and tenant_id = v_tenant and is_active and bookable_online;

  if not found then
    raise exception 'Serviço indisponível' using errcode = 'P0002';
  end if;

  select * into v_policy from booking.tenant_policies where tenant_id = v_tenant;

  -- 2. Antecedência. O motor já filtra isto, mas o motor é uma sugestão —
  --    quem chama a função pode não ter passado por ele.
  if p_start_at < now() + make_interval(mins => v_policy.min_advance_minutes) then
    raise exception 'Fora da antecedência mínima de % minutos', v_policy.min_advance_minutes
      using errcode = 'P0003';
  end if;

  if p_start_at > now() + make_interval(days => v_policy.max_advance_days) then
    raise exception 'Fora do horizonte de % dias', v_policy.max_advance_days
      using errcode = 'P0003';
  end if;

  -- 3. Quem atende. Sem profissional indicado, tenta-se cada um dos que prestam
  --    o serviço — é a jornada "primeiro disponível".
  if p_staff_id is not null then
    v_candidatos := array[p_staff_id];
  else
    select coalesce(array_agg(st.id order by st.sort_order, st.full_name), '{}'::uuid[])
      into v_candidatos
      from booking.staff st
      join booking.staff_services ss on ss.staff_id = st.id and ss.is_active
     where st.tenant_id = v_tenant
       and ss.service_id = p_service_id
       and st.is_active
       and st.accepts_online_booking;
  end if;

  if array_length(v_candidatos, 1) is null then
    raise exception 'Nenhum profissional presta este serviço' using errcode = 'P0002';
  end if;

  -- 4. O cliente, antes de tentar inserir. Se a hora estiver ocupada perde-se a
  --    linha do cliente — e isso é preferível ao contrário: um cliente a mais é
  --    ruído, uma marcação órfã é um bug.
  v_customer := booking.upsert_customer(
    v_tenant,
    p_customer->>'firstName',
    p_customer->>'lastName',
    p_customer->>'phone',
    p_customer->>'email',
    coalesce(p_customer->>'locale', 'pt-PT')
  );

  if exists (select 1 from booking.customers where id = v_customer and is_blocked) then
    raise exception 'Cliente bloqueado' using errcode = 'P0004';
  end if;

  v_status := case
    when v_service.requires_confirmation or v_policy.require_confirmation
      then 'awaiting_confirmation'::booking.booking_status
    else 'pending'::booking.booking_status
  end;

  -- 5. Tentar, por ordem, até um entrar. O `23P01` de um candidato não é erro:
  --    é a informação de que aquele está ocupado.
  foreach v_staff in array v_candidatos loop
    v_duracao := coalesce(
      (select ss.duration_minutes_override from booking.staff_services ss
        where ss.staff_id = v_staff and ss.service_id = p_service_id),
      v_service.duration_minutes
    );
    v_end := p_start_at + make_interval(mins => v_duracao);

    if not booking.is_within_working_hours(v_staff, p_location_id, p_start_at, v_end) then
      continue;
    end if;

    begin
      insert into booking.bookings (
        tenant_id, location_id, customer_id, service_id, staff_id,
        start_at, end_at, timezone,
        buffer_before_minutes, buffer_after_minutes,
        status, source, price, currency, notes, idempotency_key, created_by
      ) values (
        v_tenant, p_location_id, v_customer, p_service_id, v_staff,
        p_start_at, v_end, v_tz,
        v_service.buffer_before_minutes, v_service.buffer_after_minutes,
        v_status, p_source,
        coalesce(v_service.promo_price, v_service.price), v_service.currency,
        nullif(trim(p_notes), ''), p_idempotency_key, auth.uid()
      )
      returning id into v_booking;

      exit;
    exception
      when exclusion_violation then
        -- Ocupado. Passa ao seguinte; se não houver seguinte, o `23P01` sai
        -- lá fora e a aplicação traduz para SLOT_TAKEN.
        if v_staff = v_candidatos[array_length(v_candidatos, 1)] then
          raise;
        end if;
    end;
  end loop;

  if v_booking is null then
    raise exception 'Sem disponibilidade para esta hora'
      using errcode = '23P01';
  end if;

  insert into booking.booking_events (booking_id, tenant_id, from_status, to_status, actor_type, metadata)
  values (v_booking, v_tenant, null, v_status,
          case when auth.uid() is null then 'customer'::booking.actor_type
               else 'user'::booking.actor_type end,
          jsonb_build_object('source', p_source));

  v_token := booking.issue_access_token(v_tenant, v_booking, v_customer);

  return jsonb_build_object(
    'bookingId',  v_booking,
    'customerId', v_customer,
    'staffId',    v_staff,
    'startAt',    p_start_at,
    'endAt',      v_end,
    'status',     v_status,
    'accessToken', v_token,
    'idempotent', false
  );
end;
$$;

comment on function booking.create_booking_atomic(uuid, uuid, timestamptz, jsonb, booking.booking_source, uuid, text, text) is
  'Cria uma marcação numa transação. O 23P01 da constraint de exclusão é a garantia de que ninguém marca duas vezes o mesmo horário.';

-- -----------------------------------------------------------------------------
-- Inscrição numa sessão de grupo
-- -----------------------------------------------------------------------------
-- Aqui não há constraint de exclusão — o objetivo é precisamente permitir dez
-- marcações no mesmo intervalo. A garantia é o `UPDATE` do contador, que
-- bloqueia a linha e serializa os concorrentes, mais o `CHECK` que recusa o
-- décimo primeiro.
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
begin
  select * into v_sessao from booking.group_sessions
   where id = p_session_id and not is_cancelled;

  if not found then
    raise exception 'Sessão indisponível' using errcode = 'P0002';
  end if;

  if not booking.can_read_availability(v_sessao.tenant_id) then
    raise exception 'Sessão indisponível' using errcode = 'P0002';
  end if;

  select timezone into v_tz from booking.locations where id = v_sessao.location_id;

  v_customer := booking.upsert_customer(
    v_sessao.tenant_id,
    p_customer->>'firstName', p_customer->>'lastName',
    p_customer->>'phone',     p_customer->>'email'
  );

  -- Esta linha é a serialização. Quem chegar depois espera aqui, e o CHECK
  -- recusa quando a turma encher.
  update booking.group_sessions
     set booked_count = booked_count + 1
   where id = p_session_id;

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

  return jsonb_build_object('bookingId', v_booking, 'customerId', v_customer,
                            'vagasRestantes', v_sessao.capacity - v_sessao.booked_count - 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- Transições de estado
-- -----------------------------------------------------------------------------
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

  update booking.bookings
     set status = 'confirmed', confirmed_at = now()
   where id = p_booking_id;

  insert into booking.booking_events (booking_id, tenant_id, from_status, to_status, actor_type, actor_user_id, reason)
  values (p_booking_id, v_b.tenant_id, v_b.status, 'confirmed', 'user', auth.uid(), p_reason);

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
  values (p_booking_id, v_b.tenant_id, v_b.status, v_novo,
          case when p_by_customer then 'customer'::booking.actor_type else 'user'::booking.actor_type end,
          auth.uid(), p_reason);

  return jsonb_build_object('bookingId', p_booking_id, 'status', v_novo);
end;
$$;

-- Remarcar é criar e ligar, não editar.
--
-- Editar `start_at` apagaria a informação de que houve uma remarcação, e essa
-- informação é o que permite responder a "esta pessoa já desmarcou três vezes".
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
    (p_booking_id, v_b.tenant_id, v_b.status, 'rescheduled',
     case when p_by_customer then 'customer'::booking.actor_type else 'user'::booking.actor_type end,
     auth.uid(), p_reason, jsonb_build_object('novaMarcacao', v_novo)),
    (v_novo, v_b.tenant_id, null, v_b.status,
     case when p_by_customer then 'customer'::booking.actor_type else 'user'::booking.actor_type end,
     auth.uid(), p_reason, jsonb_build_object('marcacaoAnterior', p_booking_id));

  return jsonb_build_object('bookingId', v_novo, 'anterior', p_booking_id,
                            'startAt', p_new_start, 'endAt', v_end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- Por omissão o PostgreSQL dá EXECUTE a PUBLIC. Nas funções de escrita isso é
-- inaceitável — revoga-se e dá-se só a quem precisa.
revoke execute on function booking.upsert_customer(uuid, text, text, text, text, text) from public;
revoke execute on function booking.issue_access_token(uuid, uuid, uuid, text, int) from public;
grant  execute on function booking.upsert_customer(uuid, text, text, text, text, text) to service_role;
grant  execute on function booking.issue_access_token(uuid, uuid, uuid, text, int) to service_role;

grant execute on function booking.is_within_working_hours(uuid, uuid, timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- Estas são o caminho público: o consumidor marca sem conta.
grant execute on function booking.create_booking_atomic(uuid, uuid, timestamptz, jsonb, booking.booking_source, uuid, text, text)
  to anon, authenticated, service_role;
grant execute on function booking.join_group_session(uuid, jsonb, booking.booking_source, text)
  to anon, authenticated, service_role;

-- Estas não: confirmar e cancelar em nome da empresa exige sessão.
revoke execute on function booking.confirm_booking(uuid, text) from public;
grant  execute on function booking.confirm_booking(uuid, text) to authenticated, service_role;

revoke execute on function booking.cancel_booking(uuid, text, boolean) from public;
grant  execute on function booking.cancel_booking(uuid, text, boolean) to authenticated, service_role;

revoke execute on function booking.reschedule_booking(uuid, timestamptz, uuid, text, boolean) from public;
grant  execute on function booking.reschedule_booking(uuid, timestamptz, uuid, text, boolean) to authenticated, service_role;

-- =============================================================================
-- 0027 — Planear pelo acontecimento, não por todas as regras
-- =============================================================================
--
-- A 0024 percorria **todas** as regras ativas do tenant sempre que uma marcação
-- era criada. Resultado: uma marcação nova gerava também o job de
-- `cancelled` — a mensagem "a sua marcação foi cancelada", agendada para o
-- instante em que a pessoa acabou de marcar.
--
-- Não chegou a sair um email errado porque o teste apanhou a contagem antes
-- disso (esperava 2 jobs, apareceram 3). Mas em produção teria saído no minuto
-- seguinte, e é o género de erro que faz perder um cliente para sempre.
--
-- A correção é dizer à função **que tipos** planear. O que decide isso é o
-- acontecimento:
--
--   criada           → confirmação + lembrete
--   confirmada       → aviso de confirmação
--   cancelada        → aviso de cancelamento
--   mudou de hora    → aviso de alteração + lembrete novo
--
-- O `plan_notifications(uuid)` de um argumento continua a existir, mas passa a
-- significar "planeia o que é do ciclo normal" em vez de "planeia tudo".
-- =============================================================================

create or replace function booking.plan_notifications(
  p_booking_id uuid,
  p_types      booking.notification_type[] default array['booking_created','reminder']::booking.notification_type[]
)
returns int
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_b       record;
  v_regra   record;
  v_quando  timestamptz;
  v_criados int := 0;
begin
  select b.*, c.email, c.phone_e164, c.first_name, c.locale
    into v_b
    from booking.bookings b
    join booking.customers c on c.id = b.customer_id
   where b.id = p_booking_id;

  if not found then
    return 0;
  end if;

  -- Uma marcação que já não ocupa a agenda só pode gerar avisos de fim de
  -- ciclo. Sem esta distinção, cancelar uma marcação não conseguiria enviar o
  -- email de cancelamento — que é precisamente quando é preciso.
  if not v_b.occupies_slot
     and not (p_types && array['cancelled','rescheduled']::booking.notification_type[]) then
    return 0;
  end if;

  for v_regra in
    select * from booking.notification_rules
     where tenant_id = v_b.tenant_id
       and is_active
       and type = any (p_types)
  loop
    if v_regra.channel = 'email' and v_b.email is null then continue; end if;
    if v_regra.channel in ('whatsapp', 'sms') and v_b.phone_e164 is null then continue; end if;

    v_quando := case
      when v_regra.offset_minutes = 0 then now()
      else v_b.start_at - make_interval(mins => v_regra.offset_minutes)
    end;

    if v_quando < now() - interval '5 minutes' then continue; end if;

    insert into booking.notification_jobs
      (tenant_id, booking_id, customer_id, channel, type, scheduled_for, payload)
    values (
      v_b.tenant_id, p_booking_id, v_b.customer_id, v_regra.channel, v_regra.type, v_quando,
      jsonb_build_object('locale', coalesce(v_b.locale, 'pt-PT'), 'target', v_regra.target)
    )
    on conflict do nothing;

    if found then v_criados := v_criados + 1; end if;
  end loop;

  return v_criados;
end;
$$;

-- -----------------------------------------------------------------------------
-- O trigger passa a dizer o que aconteceu
-- -----------------------------------------------------------------------------
create or replace function booking.tg_bookings_notifications()
returns trigger
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform booking.plan_notifications(
      new.id, array['booking_created','reminder']::booking.notification_type[]);
    return new;
  end if;

  -- Deixou de ocupar a agenda. `rescheduled` tem aviso próprio, mais abaixo:
  -- dizer "cancelada" a quem só mudou de hora seria assustar sem motivo.
  if old.occupies_slot and not new.occupies_slot then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação em ' || new.status::text
     where booking_id = new.id and status = 'pending';

    if new.status::text like 'cancelled%' then
      perform booking.plan_notifications(
        new.id, array['cancelled']::booking.notification_type[]);
    end if;

    return new;
  end if;

  if new.status = 'confirmed' and old.status is distinct from new.status then
    perform booking.plan_notifications(
      new.id, array['booking_confirmed']::booking.notification_type[]);
  end if;

  -- Mudou de hora: os lembretes antigos apontam para a hora errada.
  if new.start_at is distinct from old.start_at then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação movida'
     where booking_id = new.id and status = 'pending' and type = 'reminder';

    perform booking.plan_notifications(
      new.id, array['rescheduled','reminder']::booking.notification_type[]);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_notifications on booking.bookings;
create trigger bookings_notifications
  after insert or update of status, start_at on booking.bookings
  for each row execute function booking.tg_bookings_notifications();

revoke execute on function booking.plan_notifications(uuid, booking.notification_type[]) from public;
grant  execute on function booking.plan_notifications(uuid, booking.notification_type[]) to service_role;

-- A assinatura antiga fica sem uso e sem grant; remove-se para não haver duas
-- versões a divergir.
drop function if exists booking.plan_notifications(uuid);

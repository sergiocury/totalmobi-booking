-- =============================================================================
-- 0030 — Automações: vários lembretes, confirmação com origem, falta avisada
-- =============================================================================
--
-- O M12 deixou a fila a funcionar com três avisos. Falta o que a torna útil ao
-- balcão:
--
--   1. **Vários lembretes.** 72 h para preparar, 24 h para lembrar, 2 h para
--      apanhar quem se esqueceu. A tabela já suportava (o índice único inclui o
--      `offset_minutes`); faltava o resto do sistema saber disso.
--   2. **Saber de onde veio a confirmação.** "Confirmou" não chega. Confirmou
--      **quando**, **por que canal**, e **a partir de que mensagem** — é o que
--      permite responder a "eu confirmei!" com um facto em vez de uma opinião.
--   3. **Avisar quem faltou.** Uma falta sem seguimento é uma consulta perdida
--      e um cliente que provavelmente não volta.
--
-- SOBRE "24 HORAS ANTES, NA HORA LOCAL DA UNIDADE"
--
-- A antecedência é em **tempo absoluto**: `start_at - interval`. Para uma
-- consulta às 10:00 de terça, o lembrete sai às 10:00 de segunda — na hora
-- local da unidade, porque `start_at` é um instante e a hora local sai da
-- conversão.
--
-- A única altura em que absoluto e hora-de-parede divergem é a madrugada da
-- mudança do relógio: 24 h absolutas antes das 10:00 de domingo (já com a hora
-- nova) são as 11:00 de sábado. Está certo assim — o lembrete é "um dia antes
-- de acontecer", não "à mesma hora do dia anterior". Uma regra de hora de
-- parede ("na véspera às 18:00") é outra coisa e teria de ser modelada como
-- tal.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Confirmar, e registar de onde veio
-- -----------------------------------------------------------------------------
create or replace function booking.confirm_by_token(
  p_token  text,
  p_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id uuid;
  v_b  record;
  v_ultimo_lembrete record;
begin
  v_id := booking.resolve_token(p_token, true);

  if v_id is null then
    raise exception 'Link inválido ou expirado' using errcode = 'P0002';
  end if;

  select * into v_b from booking.bookings where id = v_id;

  if v_b.status not in ('pending', 'awaiting_confirmation') then
    raise exception 'Esta marcação já não está pendente' using errcode = 'P0005';
  end if;

  -- Qual foi a mensagem que provocou isto? A última enviada antes de agora.
  -- É o que transforma "confirmou" em "confirmou a partir do lembrete das
  -- 10:03 de ontem, por email".
  select id, type, channel, sent_at
    into v_ultimo_lembrete
    from booking.notification_jobs
   where booking_id = v_id and status = 'sent'
   order by sent_at desc nulls last
   limit 1;

  update booking.bookings
     set status = 'confirmed', confirmed_at = now()
   where id = v_id;

  insert into booking.booking_events
    (booking_id, tenant_id, from_status, to_status, actor_type, reason, metadata)
  values (
    v_id, v_b.tenant_id, v_b.status, 'confirmed', 'customer',
    'confirmada pelo cliente',
    jsonb_strip_nulls(jsonb_build_object(
      'origem',          coalesce(p_origem, 'link'),
      'confirmadaEm',    now(),
      'mensagemDeOrigem', v_ultimo_lembrete.id,
      'tipoDaMensagem',  v_ultimo_lembrete.type,
      'canalDaMensagem', v_ultimo_lembrete.channel,
      'mensagemEnviadaEm', v_ultimo_lembrete.sent_at
    ))
  );

  return jsonb_build_object('status', 'confirmed');
end;
$$;

-- A assinatura de um argumento deixa de existir para não haver duas versões.
drop function if exists booking.confirm_by_token(text);

revoke execute on function booking.confirm_by_token(text, text) from public;
grant  execute on function booking.confirm_by_token(text, text)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Quem faltou
-- -----------------------------------------------------------------------------
-- `no_show` não passa por `occupies_slot` — a marcação deixa de ocupar a agenda
-- e o trigger antigo tratava-a como um cancelamento qualquer, cancelando os
-- jobs pendentes e mais nada. Faltava o seguimento.
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

  if old.occupies_slot and not new.occupies_slot then
    update booking.notification_jobs
       set status = 'cancelled', error = 'marcação em ' || new.status::text
     where booking_id = new.id and status = 'pending';

    if new.status::text like 'cancelled%' then
      perform booking.plan_notifications(
        new.id, array['cancelled']::booking.notification_type[]);
    end if;

    -- Uma falta é a única transição em que se escreve a alguém **depois** da
    -- hora. O `offset_minutes` da regra conta a partir de `start_at`, que já
    -- passou — por isso a `plan_notifications` recusaria o job por estar
    -- atrasado. Daí o agendamento explícito para daqui a pouco.
    if new.status = 'no_show' then
      perform booking.plan_no_show_followup(new.id);
    end if;

    return new;
  end if;

  if new.status = 'confirmed' and old.status is distinct from new.status then
    perform booking.plan_notifications(
      new.id, array['booking_confirmed']::booking.notification_type[]);
  end if;

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

-- -----------------------------------------------------------------------------
-- O seguimento de uma falta
-- -----------------------------------------------------------------------------
-- Escrever no minuto seguinte a alguém que faltou soa a cobrança. Duas horas
-- depois soa a preocupação — e é essa a diferença entre recuperar o cliente e
-- perdê-lo.
create or replace function booking.plan_no_show_followup(p_booking_id uuid)
returns int
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_b     record;
  v_regra record;
  v_n     int := 0;
begin
  select b.*, c.email, c.phone_e164
    into v_b
    from booking.bookings b
    join booking.customers c on c.id = b.customer_id
   where b.id = p_booking_id;

  if not found then return 0; end if;

  for v_regra in
    select * from booking.notification_rules
     where tenant_id = v_b.tenant_id and is_active and type = 'no_show_followup'
  loop
    if v_regra.channel = 'email' and v_b.email is null then continue; end if;
    if v_regra.channel in ('whatsapp','sms') and v_b.phone_e164 is null then continue; end if;

    insert into booking.notification_jobs
      (tenant_id, booking_id, customer_id, channel, type, scheduled_for, payload)
    values (
      v_b.tenant_id, p_booking_id, v_b.customer_id, v_regra.channel, 'no_show_followup',
      -- O `offset_minutes` conta **depois** da hora nesta regra, ao contrário
      -- de todas as outras. Está documentado no ecrã de automações.
      now() + make_interval(mins => greatest(v_regra.offset_minutes, 60)),
      jsonb_build_object('locale', 'pt-PT')
    )
    on conflict do nothing;

    if found then v_n := v_n + 1; end if;
  end loop;

  return v_n;
end;
$$;

revoke execute on function booking.plan_no_show_followup(uuid) from public;
grant  execute on function booking.plan_no_show_followup(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Templates que faltavam
-- -----------------------------------------------------------------------------
insert into booking.notification_templates (tenant_id, type, channel, locale, subject, body)
values
  (null, 'no_show_followup', 'email', 'pt-PT',
   'Sentimos a sua falta — {{tenantName}}',
   E'Olá {{customerName}},\n\n'
   'Não conseguimos recebê-lo hoje para {{serviceName}}. Acontece.\n\n'
   'Se quiser remarcar, é por aqui:\n{{manageUrl}}\n\n'
   'E se preferir falar connosco, ligue{{telefoneFrase}}.\n\n'
   '{{tenantName}}'),

  (null, 'changed_by_business', 'email', 'pt-PT',
   'A sua marcação foi alterada — {{tenantName}}',
   E'Olá {{customerName}},\n\n'
   'Tivemos de alterar a sua marcação de {{serviceName}}. A nova hora é:\n\n'
   '{{quando}}\n'
   '{{staffLinha}}'
   '{{locationName}}{{locationAddress}}\n\n'
   'Se não lhe der jeito, avise-nos por aqui:\n{{manageUrl}}\n\n'
   'As nossas desculpas pelo incómodo.\n{{tenantName}}')
on conflict do nothing;

comment on function booking.confirm_by_token(text, text) is
  'Confirma a partir do link e regista a origem: canal, momento, e qual a mensagem enviada que a provocou.';
comment on function booking.plan_no_show_followup(uuid) is
  'Único caso em que o offset conta DEPOIS da hora da marcação. Mínimo de 60 minutos: escrever logo a seguir soa a cobrança.';

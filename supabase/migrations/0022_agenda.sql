-- =============================================================================
-- 0022 — A agenda do balcão
-- =============================================================================
--
-- Duas funções e uma linha de configuração. A linha é a mais fácil de esquecer
-- e a que dá o "porque é que o Realtime não funciona".
--
-- MOVER NÃO É REMARCAR
--
-- Parecem a mesma coisa e não são:
--
--   • `reschedule_booking()` — **o cliente mudou de ideias**. Cria uma marcação
--     nova, liga-a à antiga e deixa as duas no histórico. É o que permite
--     responder a "esta pessoa já desmarcou três vezes".
--
--   • `move_booking()` — **o balcão está a corrigir a agenda**. A Rita arrasta
--     a consulta das 10 para as 11 porque o médico atrasou-se. É a mesma
--     marcação, o mesmo cliente, o mesmo compromisso: muda a hora e escreve-se
--     um evento. Criar uma marcação nova a cada arrasto encheria o histórico
--     de ruído e faria a estatística de remarcações mentir.
--
-- A revalidação é a mesma nos dois casos, e não é opcional. Arrastar para cima
-- de outra marcação tem de falhar **na base de dados**, não no browser: o
-- browser tem uma fotografia de há segundos, e nesses segundos o WhatsApp pode
-- ter marcado ali.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A consulta da agenda
-- -----------------------------------------------------------------------------
-- Projeção mínima, uma chamada. O calendário de uma semana com cinco
-- profissionais são centenas de linhas, e trazer `select *` significaria
-- arrastar notas internas e motivos de cancelamento para o browser de quem só
-- quer ver blocos coloridos.
--
-- `SECURITY INVOKER` de propósito, ao contrário da `availability_dataset`:
-- aqui quem chama **tem** sessão, e a RLS já sabe distinguir um `manager` (vê
-- tudo) de um `staff` (vê a agenda dele). Repetir essa decisão dentro da função
-- seria escrevê-la duas vezes.
create or replace function booking.agenda(
  p_location_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
returns table (
  id            uuid,
  start_at      timestamptz,
  end_at        timestamptz,
  status        booking.booking_status,
  source        booking.booking_source,
  staff_id      uuid,
  staff_name    text,
  staff_color   text,
  service_id    uuid,
  service_name  text,
  service_color text,
  customer_id   uuid,
  customer_name text,
  customer_phone text,
  notes         text,
  occupies_slot boolean
)
language sql
stable
security invoker
set search_path = booking, pg_catalog
as $$
  select
    b.id, b.start_at, b.end_at, b.status, b.source,
    b.staff_id, st.full_name, st.calendar_color,
    b.service_id, sv.name, sv.color,
    b.customer_id,
    trim(c.first_name || ' ' || coalesce(c.last_name, '')),
    c.phone_e164,
    b.notes,
    b.occupies_slot
  from booking.bookings b
  left join booking.staff     st on st.id = b.staff_id
  join      booking.services  sv on sv.id = b.service_id
  join      booking.customers c  on c.id  = b.customer_id
  where b.location_id = p_location_id
    and b.start_at < p_to
    and b.end_at   > p_from
  order by b.start_at, st.full_name;
$$;

comment on function booking.agenda(uuid, timestamptz, timestamptz) is
  'Marcações de um intervalo, com projeção mínima. SECURITY INVOKER: a RLS é que decide se quem chama vê tudo ou só a sua agenda.';

grant execute on function booking.agenda(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Mover uma marcação
-- -----------------------------------------------------------------------------
create or replace function booking.move_booking(
  p_booking_id uuid,
  p_new_start  timestamptz,
  p_new_staff  uuid default null,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_b       record;
  v_staff   uuid;
  v_duracao int;
  v_end     timestamptz;
begin
  select * into v_b from booking.bookings where id = p_booking_id;
  if not found then raise exception 'Marcação inexistente' using errcode = 'P0002'; end if;

  -- Mover a agenda é trabalho de quem a gere. Um profissional pode ver a sua
  -- agenda e não pode reorganizar a da casa.
  if not (v_b.tenant_id = any ((select booking.manager_tenant_ids())::uuid[])
          or booking.is_platform_admin()) then
    raise exception 'Sem permissão para reorganizar a agenda' using errcode = '42501';
  end if;

  if not v_b.occupies_slot then
    raise exception 'Não se move uma marcação em %', v_b.status using errcode = 'P0005';
  end if;

  if v_b.group_session_id is not null then
    raise exception 'Uma inscrição em aula move-se movendo a aula' using errcode = 'P0005';
  end if;

  v_staff := coalesce(p_new_staff, v_b.staff_id);
  -- A duração é a que a marcação tem, não a que o serviço tem hoje. Se o preço
  -- ou a duração do serviço mudaram depois, o compromisso já assumido com o
  -- cliente não muda por arrastá-lo dez minutos.
  v_duracao := extract(epoch from (v_b.end_at - v_b.start_at))::int / 60;
  v_end := p_new_start + make_interval(mins => v_duracao);

  if not booking.is_within_working_hours(v_staff, v_b.location_id, p_new_start, v_end) then
    raise exception 'Fora do horário de trabalho' using errcode = 'P0003';
  end if;

  -- O `update` dispara o trigger do `blocked_range` e volta a passar pela
  -- constraint de exclusão. Se lá estiver outra marcação, sai `23P01` — o
  -- mesmo erro que o caminho público leva, traduzido para SLOT_TAKEN.
  update booking.bookings
     set start_at = p_new_start,
         end_at   = v_end,
         staff_id = v_staff
   where id = p_booking_id;

  insert into booking.booking_events
    (booking_id, tenant_id, from_status, to_status, actor_type, actor_user_id, reason, metadata)
  values
    (p_booking_id, v_b.tenant_id, v_b.status, v_b.status, 'user', auth.uid(),
     coalesce(p_reason, 'movida na agenda'),
     jsonb_build_object('de', v_b.start_at, 'para', p_new_start,
                        'staffAnterior', v_b.staff_id, 'staffNovo', v_staff));

  perform booking.write_audit_log(
    v_b.tenant_id, 'user', 'booking.moved', 'booking', p_booking_id::text,
    jsonb_build_object('startAt', v_b.start_at, 'staffId', v_b.staff_id),
    jsonb_build_object('startAt', p_new_start, 'staffId', v_staff));

  return jsonb_build_object('bookingId', p_booking_id, 'startAt', p_new_start, 'endAt', v_end,
                            'staffId', v_staff);
end;
$$;

comment on function booking.move_booking(uuid, timestamptz, uuid, text) is
  'Move uma marcação mantendo a identidade. Para uma remarcação pedida pelo cliente usar reschedule_booking, que cria linha nova e liga as duas.';

revoke execute on function booking.move_booking(uuid, timestamptz, uuid, text) from public;
grant  execute on function booking.move_booking(uuid, timestamptz, uuid, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- Sem esta linha o Realtime não emite nada e ninguém percebe porquê: não há
-- erro, não há aviso, simplesmente não chega evento nenhum.
--
-- Só a `bookings` entra. A RLS continua a valer — o Supabase filtra os eventos
-- por política —, mas quanto menos tabelas replicarem, menos há a filtrar.
do $$ begin
  alter publication supabase_realtime add table booking.bookings;
exception when duplicate_object then null; end $$;

-- `replica identity full` faz o evento de UPDATE trazer também os valores
-- antigos. É o que permite ao calendário saber de onde é que a marcação saiu, e
-- não só onde está agora — sem isso, um bloco movido aparecia no destino sem
-- desaparecer da origem até ao recarregamento seguinte.
alter table booking.bookings replica identity full;

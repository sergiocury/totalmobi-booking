-- =============================================================================
-- 0014 — A presença numa unidade lê-se do horário, não da atribuição
-- =============================================================================
--
-- A 0013 exigia uma linha em `booking.staff_locations` para considerar que um
-- profissional atende numa unidade. Parecia óbvio. Está errado, e a prova
-- apareceu no primeiro pedido feito com dados reais: a Ana Martins tinha cinco
-- linhas de horário na unidade da Avenida e **zero** linhas de atribuição.
-- O dataset devolveu `staff: []` e o motor não tinha ninguém para calcular.
--
-- Duas fontes de verdade que podem discordar são uma fonte de bugs, e esta
-- discordava por omissão: o ecrã de horários do M6 gravava o horário sem criar
-- a ligação. Corrigem-se as duas pontas:
--
--   • aqui, a presença passa a deduzir-se do horário — quem tem horário numa
--     unidade trabalha nessa unidade, por definição;
--   • no ecrã de horários, gravar passa a criar também a atribuição, para que
--     o registo administrativo fique certo para os outros ecrãs.
--
-- `staff_locations` continua a existir e a fazer sentido: é onde se declara a
-- unidade principal de alguém e onde se atribui quem ainda não tem horário.
-- Deixa é de ser o que a agenda consulta.
--
-- A 0013 não é editada. Foi aplicada, e uma migration aplicada é história.
-- =============================================================================

create or replace function booking.availability_dataset(
  p_location_id uuid,
  p_service_id  uuid,
  p_from        date,
  p_to          date,
  p_staff_id    uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_tenant   uuid;
  v_timezone text;
  v_dataset  jsonb;
begin
  -- Um intervalo aberto seria um convite a pedir cinco anos de agenda de uma
  -- vez. 92 dias cobrem o trimestre que qualquer calendário mostra.
  if p_to < p_from then
    raise exception 'Intervalo invertido: % a %', p_from, p_to using errcode = '22023';
  end if;

  if p_to - p_from > 92 then
    raise exception 'Intervalo demasiado longo: % dias (máximo 92)', p_to - p_from
      using errcode = '22023';
  end if;

  select l.tenant_id, l.timezone
    into v_tenant, v_timezone
    from booking.locations l
   where l.id = p_location_id
     and l.is_active
     and l.archived_at is null;

  -- Unidade inexistente e unidade sem autorização dão a **mesma** resposta.
  -- Distinguir as duas transformaria isto num verificador de empresas.
  if v_tenant is null or not booking.can_read_availability(v_tenant) then
    return null;
  end if;

  select jsonb_build_object(
    'tenantId',  v_tenant,
    'timezone',  v_timezone,
    'from',      p_from,
    'to',        p_to,

    'service', (
      select jsonb_build_object(
        'id',                    s.id,
        'name',                  s.name,
        'durationMinutes',       s.duration_minutes,
        'bufferBeforeMinutes',   s.buffer_before_minutes,
        'bufferAfterMinutes',    s.buffer_after_minutes,
        'capacity',              s.capacity,
        'requiresConfirmation',  s.requires_confirmation
      )
      from booking.services s
      where s.id = p_service_id
        and s.tenant_id = v_tenant
        and s.is_active
        and s.bookable_online
    ),

    'policy', (
      select jsonb_build_object(
        'slotGranularityMinutes', p.slot_granularity_minutes,
        'minAdvanceMinutes',      p.min_advance_minutes,
        'maxAdvanceDays',         p.max_advance_days
      )
      from booking.tenant_policies p
      where p.tenant_id = v_tenant
    ),

    'locationHours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'weekday',  h.weekday,
               'startsAt', to_char(h.opens_at,  'HH24:MI'),
               'endsAt',   to_char(h.closes_at, 'HH24:MI')
             ) order by h.weekday, h.opens_at)
      from booking.location_business_hours h
      where h.location_id = p_location_id
    ), '[]'::jsonb),

    -- Exceções de âmbito empresa ou unidade. As do próprio profissional vão
    -- dentro de cada um, mais abaixo.
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date',     e.date,
               'kind',     e.kind,
               'startsAt', to_char(e.starts_at, 'HH24:MI'),
               'endsAt',   to_char(e.ends_at,   'HH24:MI')
             ) order by e.date)
      from booking.schedule_exceptions e
      where e.tenant_id = v_tenant
        and e.date between p_from and p_to
        and (e.scope_tenant or e.location_id = p_location_id)
    ), '[]'::jsonb),

    'staff', coalesce((
      select jsonb_agg(pessoa order by pessoa->>'fullName')
      from (
        select jsonb_build_object(
          'staffId',  st.id,
          'fullName', st.full_name,
          'photoUrl', st.photo_url,

          -- A duração pode ser diferente por profissional: a mesma consulta
          -- pode levar 30 min com quem tem 20 anos de casa e 45 com quem
          -- entrou o mês passado.
          'durationMinutes', coalesce(ss.duration_minutes_override, sv.duration_minutes),

          'workingHours', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'weekday',    w.weekday,
                     'startsAt',   to_char(w.starts_at, 'HH24:MI'),
                     'endsAt',     to_char(w.ends_at,   'HH24:MI'),
                     'validFrom',  w.valid_from,
                     'validUntil', w.valid_until
                   ) order by w.weekday, w.starts_at)
            from booking.staff_working_hours w
            where w.staff_id = st.id
              and w.location_id = p_location_id
              -- Uma linha de horário que já caducou antes do início do
              -- intervalo, ou que só entra em vigor depois do fim, não
              -- interessa a este pedido.
              and (w.valid_until is null or w.valid_until >= p_from)
              and (w.valid_from  is null or w.valid_from  <= p_to)
          ), '[]'::jsonb),

          -- Só datas e horas. O motivo e o tipo da ausência ficam de fora:
          -- a agenda pública mostra que a pessoa não está, não porquê.
          'timeOff', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'startsAt', t.starts_at,
                     'endsAt',   t.ends_at
                   ) order by t.starts_at)
            from booking.staff_time_off t
            where t.staff_id = st.id
              and t.starts_at < (p_to + 1)::timestamptz
              and t.ends_at   > p_from::timestamptz
          ), '[]'::jsonb),

          'exceptions', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'date',     e.date,
                     'kind',     e.kind,
                     'startsAt', to_char(e.starts_at, 'HH24:MI'),
                     'endsAt',   to_char(e.ends_at,   'HH24:MI')
                   ) order by e.date)
            from booking.schedule_exceptions e
            where e.staff_id = st.id
              and e.date between p_from and p_to
          ), '[]'::jsonb),

          -- M8: aqui entra a junção a `booking.bookings`, filtrada por
          -- `occupies_slot` e pelo `blocked_range` a intersectar o intervalo.
          -- Até lá a agenda está vazia e o motor calcula sobre horário puro.
          'busy', '[]'::jsonb
        ) as pessoa
        from booking.staff st
        join booking.staff_services ss on ss.staff_id = st.id and ss.is_active
        join booking.services       sv on sv.id = ss.service_id
        where st.tenant_id = v_tenant
          and ss.service_id = p_service_id
          -- Presença na unidade deduz-se do **horário**, não de
          -- `staff_locations`. As duas fontes podem discordar — e discordavam:
          -- a primeira profissional de demonstração tinha cinco linhas de
          -- horário na Avenida e nenhuma linha de atribuição. Quem tem horário
          -- numa unidade trabalha nessa unidade, por definição; a atribuição é
          -- o registo administrativo, não a verdade da agenda.
          and exists (
            select 1 from booking.staff_working_hours w
            where w.staff_id = st.id
              and w.location_id = p_location_id
              and (w.valid_until is null or w.valid_until >= p_from)
              and (w.valid_from  is null or w.valid_from  <= p_to)
          )
          and st.is_active
          and st.accepts_online_booking
          and (p_staff_id is null or st.id = p_staff_id)
      ) q
    ), '[]'::jsonb)
  )
  into v_dataset;

  -- Serviço inexistente, inativo ou não marcável online: mesma resposta que
  -- unidade desconhecida. Nada de listas de serviços por tentativa e erro.
  if v_dataset->'service' = 'null'::jsonb or v_dataset->'service' is null then
    return null;
  end if;

  return v_dataset;
end;
$$;

comment on function booking.availability_dataset(uuid, uuid, date, date, uuid) is
  'Tudo o que o motor de disponibilidade precisa, numa chamada. Presença deduzida do horário. Só colunas públicas.';

grant execute on function booking.availability_dataset(uuid, uuid, date, date, uuid)
  to anon, authenticated, service_role;

-- =============================================================================
-- 0031 — Relatórios
-- =============================================================================
--
-- **Nunca puxar marcações em bruto para o browser.**
--
-- Um ano de uma clínica média são milhares de linhas. Trazê-las para o cliente
-- para lá contar significa: transferir megabytes, gastar bateria a somar, e —
-- pior — pôr no browser dados que ninguém precisa de ver para saber quantas
-- consultas houve em março. Os nomes dos clientes não têm de sair da base de
-- dados para se desenhar uma barra.
--
-- Estas funções devolvem **agregados**. O maior resultado possível são algumas
-- dezenas de linhas.
--
-- PORQUÊ FUNÇÕES E NÃO VISTAS MATERIALIZADAS
--
-- Uma vista materializada teria de ser refrescada, e um relatório desatualizado
-- é pior do que um relatório lento: quem está ao balcão compara o número com a
-- agenda que tem à frente. Com os índices parciais em `occupies_slot` que o M8
-- criou, a agregação de um ano corre em milissegundos — medido, não assumido.
--
-- Se um dia deixar de correr, a vista materializada é o passo seguinte, e o
-- gatilho é claro: quando o `explain analyze` de um ano passar de 200 ms.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hoje
-- -----------------------------------------------------------------------------
-- O número que interessa de manhã. Conta pelo **dia local da unidade**, não em
-- UTC: às 23:30 de Lisboa, "hoje" em UTC já é amanhã, e o balcão veria zero.
create or replace function booking.report_today(
  p_location_id uuid,
  p_dia         date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = booking, pg_catalog
as $$
declare
  v_tz    text;
  v_dia   date;
  v_ini   timestamptz;
  v_fim   timestamptz;
begin
  select timezone into v_tz from booking.locations where id = p_location_id;
  if v_tz is null then return null; end if;

  v_dia := coalesce(p_dia, (now() at time zone v_tz)::date);
  v_ini := (v_dia + time '00:00') at time zone v_tz;
  v_fim := (v_dia + 1 + time '00:00') at time zone v_tz;

  return (
    select jsonb_build_object(
      'dia',          v_dia,
      'total',        count(*),
      'confirmadas',  count(*) filter (where status in ('confirmed','checked_in','in_progress','completed')),
      'pendentes',    count(*) filter (where status in ('pending','awaiting_confirmation')),
      'canceladas',   count(*) filter (where status::text like 'cancelled%'),
      'faltas',       count(*) filter (where status = 'no_show'),
      'concluidas',   count(*) filter (where status = 'completed'),
      'proxima',      min(start_at) filter (where start_at > now() and occupies_slot)
    )
    from booking.bookings
    where location_id = p_location_id
      and start_at >= v_ini
      and start_at <  v_fim
  );
end;
$$;

comment on function booking.report_today(uuid, date) is
  'Contagens do dia, pelo dia LOCAL da unidade. Em UTC, às 23:30 de Lisboa o balcão veria zero.';

-- -----------------------------------------------------------------------------
-- Um período
-- -----------------------------------------------------------------------------
create or replace function booking.report_period(
  p_location_id uuid,
  p_from        date,
  p_to          date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = booking, pg_catalog
as $$
declare
  v_tz  text;
  v_ini timestamptz;
  v_fim timestamptz;
begin
  select timezone into v_tz from booking.locations where id = p_location_id;
  if v_tz is null then return null; end if;

  -- Um relatório aberto seria um convite a pedir dez anos de uma vez.
  if p_to < p_from or (p_to - p_from) > 400 then
    raise exception 'Período inválido: máximo 400 dias' using errcode = '22023';
  end if;

  v_ini := (p_from + time '00:00') at time zone v_tz;
  v_fim := (p_to + 1 + time '00:00') at time zone v_tz;

  return jsonb_build_object(
    'de', p_from,
    'ate', p_to,
    'timezone', v_tz,

    'totais', (
      select jsonb_build_object(
        'marcacoes',   count(*),
        'concluidas',  count(*) filter (where status = 'completed'),
        'canceladas',  count(*) filter (where status::text like 'cancelled%'),
        'faltas',      count(*) filter (where status = 'no_show'),
        'clientes',    count(distinct customer_id),
        -- Estimada, e dito assim: é o preço registado na marcação, não o que
        -- entrou em caixa. Chamar-lhe "receita" seria prometer contabilidade.
        'receitaEstimada', coalesce(sum(price) filter (where status = 'completed'), 0),
        'moeda',       min(currency) filter (where currency is not null)
      )
      from booking.bookings
      where location_id = p_location_id and start_at >= v_ini and start_at < v_fim
    ),

    'porMes', coalesce((
      select jsonb_agg(m order by m->>'mes')
      from (
        select jsonb_build_object(
          'mes',        to_char(date_trunc('month', start_at at time zone v_tz), 'YYYY-MM'),
          'marcacoes',  count(*),
          'concluidas', count(*) filter (where status = 'completed'),
          'faltas',     count(*) filter (where status = 'no_show')
        ) as m
        from booking.bookings
        where location_id = p_location_id and start_at >= v_ini and start_at < v_fim
        group by date_trunc('month', start_at at time zone v_tz)
      ) q
    ), '[]'::jsonb),

    'porServico', coalesce((
      select jsonb_agg(s order by (s->>'marcacoes')::int desc)
      from (
        select jsonb_build_object(
          'servico',   sv.name,
          'marcacoes', count(*),
          'receita',   coalesce(sum(b.price) filter (where b.status = 'completed'), 0)
        ) as s
        from booking.bookings b
        join booking.services sv on sv.id = b.service_id
        where b.location_id = p_location_id and b.start_at >= v_ini and b.start_at < v_fim
        group by sv.id, sv.name
      ) q
    ), '[]'::jsonb),

    'porProfissional', coalesce((
      select jsonb_agg(p order by (p->>'marcacoes')::int desc)
      from (
        select jsonb_build_object(
          'profissional', st.full_name,
          'marcacoes',    count(*),
          'faltas',       count(*) filter (where b.status = 'no_show')
        ) as p
        from booking.bookings b
        join booking.staff st on st.id = b.staff_id
        where b.location_id = p_location_id and b.start_at >= v_ini and b.start_at < v_fim
        group by st.id, st.full_name
      ) q
    ), '[]'::jsonb),

    -- Hora **local**. Em UTC, uma clínica de Lisboa apareceria com o pico às
    -- 09:00 em vez das 10:00 durante metade do ano.
    'porHora', coalesce((
      select jsonb_agg(h order by (h->>'hora')::int)
      from (
        select jsonb_build_object(
          'hora',      extract(hour from start_at at time zone v_tz)::int,
          'marcacoes', count(*)
        ) as h
        from booking.bookings
        where location_id = p_location_id and start_at >= v_ini and start_at < v_fim
        group by extract(hour from start_at at time zone v_tz)
      ) q
    ), '[]'::jsonb),

    'porOrigem', coalesce((
      select jsonb_agg(o order by (o->>'marcacoes')::int desc)
      from (
        select jsonb_build_object('origem', source::text, 'marcacoes', count(*)) as o
        from booking.bookings
        where location_id = p_location_id and start_at >= v_ini and start_at < v_fim
        group by source
      ) q
    ), '[]'::jsonb),

    -- Novo = a primeira marcação daquele cliente caiu dentro do período.
    -- Contar "criado no período" seria diferente e enganador: alguém registado
    -- há um ano que só agora marcou pela primeira vez é um cliente novo.
    'clientes', (
      select jsonb_build_object('novos', count(*) filter (where primeira >= v_ini),
                                'recorrentes', count(*) filter (where primeira < v_ini))
      from (
        select b.customer_id, min(b2.start_at) as primeira
        from booking.bookings b
        join booking.bookings b2 on b2.customer_id = b.customer_id
                                and b2.location_id = b.location_id
        where b.location_id = p_location_id and b.start_at >= v_ini and b.start_at < v_fim
        group by b.customer_id
      ) q
    )
  );
end;
$$;

comment on function booking.report_period(uuid, date, date) is
  'Agregados de um período. Devolve dezenas de linhas, nunca marcações em bruto. Horas e meses na hora LOCAL da unidade.';

-- `security invoker`: a RLS já distingue quem vê tudo de quem só vê a sua
-- agenda. Repetir essa decisão dentro da função seria escrevê-la duas vezes.
grant execute on function booking.report_today(uuid, date)        to authenticated, service_role;
grant execute on function booking.report_period(uuid, date, date) to authenticated, service_role;

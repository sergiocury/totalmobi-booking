-- =============================================================================
-- 0032 — O agendador da fila de notificações
-- =============================================================================
--
-- Sem isto, tudo o que o M12 e o M15 construíram fica planeado e nunca sai. Os
-- jobs acumulam-se em `notification_jobs` com `status = 'pending'` e ninguém os
-- vai buscar.
--
-- PORQUE É `pg_cron` E NÃO A VERCEL
--
-- Verificado na documentação da Vercel a 2026-08-21: no plano **Hobby** os
-- crons correm **uma vez por dia**, com uma imprecisão de ±59 minutos — e uma
-- expressão mais frequente **faz falhar o deploy**. Um lembrete de duas horas
-- antes ficaria inútil. O plano Pro faz ao minuto, mas custa ~20 USD/mês.
--
-- O `pg_cron` já está instalado neste projeto (tem lá o `al_daily_obligations`
-- do CMS, que **não se toca**), corre ao minuto, não custa nada, e o segredo
-- nunca sai da base de dados para um painel de terceiros.
--
-- A objeção que registei no M12 — "instalar uma extensão num projeto partilhado
-- é uma decisão maior do que este milestone justifica" — deixou de valer. Já
-- não é uma conveniência: é o que faz os lembretes saírem.
--
-- O SEGREDO NÃO ESTÁ NESTE FICHEIRO
--
-- Esta migration cria a **função** que agenda; quem a chama passa o URL e o
-- segredo. Um segredo dentro de uma migration é um segredo no git, e no git
-- fica para sempre — mesmo depois de apagado.
-- =============================================================================

-- `pg_net` dá ao PostgreSQL a capacidade de fazer HTTP. É aditivo e não altera
-- comportamento nenhum do que já existe: o CMS não dá por isso.
create extension if not exists pg_net with schema extensions;

-- -----------------------------------------------------------------------------
-- Agendar
-- -----------------------------------------------------------------------------
create or replace function booking.agendar_notificacoes(
  p_url    text,
  p_secret text,
  p_cada   text default '* * * * *'
)
returns text
language plpgsql
security definer
set search_path = booking, extensions, pg_catalog
as $$
declare
  v_comando text;
  v_jobid   bigint;
begin
  if p_url !~ '^https://' then
    -- Sem TLS o segredo viajaria em claro. E a Meta e o Resend também não
    -- falam com endereços que não sejam https.
    raise exception 'O URL do agendador tem de ser https' using errcode = '22023';
  end if;

  if length(coalesce(p_secret, '')) < 16 then
    raise exception 'Segredo demasiado curto' using errcode = '22023';
  end if;

  -- `format` com `%L` escapa o literal: um URL ou um segredo com apóstrofo não
  -- parte o comando agendado.
  v_comando := format(
    $cmd$select net.http_post(
      url := %L,
      headers := jsonb_build_object('x-cron-secret', %L, 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );$cmd$,
    p_url, p_secret
  );

  -- Substitui em vez de duplicar: correr isto duas vezes não deixa dois jobs a
  -- disparar em paralelo.
  perform cron.unschedule('booking-notificacoes')
   where exists (select 1 from cron.job where jobname = 'booking-notificacoes');

  select cron.schedule('booking-notificacoes', p_cada, v_comando) into v_jobid;

  return format('job %s agendado (%s) para %s', v_jobid, p_cada, p_url);
end;
$$;

comment on function booking.agendar_notificacoes(text, text, text) is
  'Agenda o pg_cron a chamar /api/notificacoes/tick. O segredo entra por argumento e nunca fica numa migration.';

-- -----------------------------------------------------------------------------
-- Desagendar
-- -----------------------------------------------------------------------------
create or replace function booking.desagendar_notificacoes()
returns text
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
begin
  if not exists (select 1 from cron.job where jobname = 'booking-notificacoes') then
    return 'não estava agendado';
  end if;

  perform cron.unschedule('booking-notificacoes');
  return 'desagendado';
end;
$$;

-- -----------------------------------------------------------------------------
-- Ver como está a correr
-- -----------------------------------------------------------------------------
-- Um agendador que falha em silêncio é pior do que não ter agendador: a fila
-- enche e ninguém dá por isso. Esta função responde a "está a correr?" sem ser
-- preciso saber o esquema do pg_cron de cor.
create or replace function booking.estado_do_agendador()
returns jsonb
language sql
stable
security definer
set search_path = booking, pg_catalog
as $$
  select jsonb_build_object(
    'agendado',    exists (select 1 from cron.job where jobname = 'booking-notificacoes'),
    'periodicidade', (select schedule from cron.job where jobname = 'booking-notificacoes'),
    'ativo',       (select active   from cron.job where jobname = 'booking-notificacoes'),

    'ultimasCorridas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quando', start_time, 'estado', status,
               'mensagem', left(coalesce(return_message, ''), 120))
             order by start_time desc)
      from (
        select d.start_time, d.status, d.return_message
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        where j.jobname = 'booking-notificacoes'
        order by d.start_time desc
        limit 5
      ) q
    ), '[]'::jsonb),

    -- O número que interessa: quantos avisos estão à espera e há quanto tempo.
    'fila', (
      select jsonb_build_object(
        'pendentes', count(*),
        'atrasados', count(*) filter (where scheduled_for < now() - interval '5 minutes'),
        'maisAntigo', min(scheduled_for) filter (where status = 'pending')
      )
      from booking.notification_jobs where status = 'pending'
    )
  );
$$;

comment on function booking.estado_do_agendador() is
  'Está a correr? Quantos avisos estão à espera? Um agendador que falha em silêncio enche a fila sem ninguém dar por isso.';

revoke execute on function booking.agendar_notificacoes(text, text, text) from public;
revoke execute on function booking.desagendar_notificacoes() from public;
revoke execute on function booking.estado_do_agendador() from public;

grant execute on function booking.agendar_notificacoes(text, text, text) to service_role;
grant execute on function booking.desagendar_notificacoes()              to service_role;
grant execute on function booking.estado_do_agendador()                  to service_role;

-- -----------------------------------------------------------------------------
-- Guarda: não mexer no que é do CMS
-- -----------------------------------------------------------------------------
do $$
declare v_cms int;
begin
  select count(*) into v_cms from cron.job where jobname = 'al_daily_obligations';

  if v_cms <> 1 then
    raise exception
      'O job do CMS (al_daily_obligations) desapareceu. Esta migration não lhe toca — verificar o que o removeu.';
  end if;
end;
$$;

-- =============================================================================
-- 0026 — O link de gestão nos emails
-- =============================================================================
--
-- A 0024 punha o `token_hash` no payload do trabalhador. Estava errado, e o
-- erro só se vê quando se pensa no que o destinatário recebe: um URL construído
-- a partir do hash não abre nada. A `resolve_token` compara
-- `sha256(token_recebido)` com o que está guardado — dar-lhe o hash faria
-- calcular o hash do hash.
--
-- E não há forma de recuperar o token original: é exatamente para isso que se
-- guarda só o resumo.
--
-- A SOLUÇÃO É EMITIR UM TOKEN NOVO POR MENSAGEM
--
-- Cada email leva o seu próprio link, com validade e contagem próprias. É mais
-- correto do que reutilizar um: se um lembrete for reencaminhado, o link que
-- circula é o desse lembrete, e revogá-lo não estraga o que foi na confirmação.
--
-- O token em claro existe durante a chamada e vai direto para o corpo da
-- mensagem. Não fica guardado em lado nenhum — nem no job, que é um registo
-- permanente e não deve conter credenciais.
-- =============================================================================

create or replace function booking.claim_notification_jobs(
  p_worker text,
  p_limit  int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_jobs jsonb;
begin
  with reclamados as (
    select j.id
      from booking.notification_jobs j
     where j.status = 'pending'
       and j.scheduled_for <= now()
       and (j.locked_at is null or j.locked_at < now() - interval '10 minutes')
     order by j.scheduled_for
     limit p_limit
     for update skip locked
  ),
  marcados as (
    update booking.notification_jobs j
       set locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1,
           last_attempt_at = now()
      from reclamados r
     where j.id = r.id
     returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId',        m.id,
    'channel',      m.channel,
    'type',         m.type,
    'attempts',     m.attempts,
    'locale',       coalesce(m.payload->>'locale', 'pt-PT'),

    'to',           case when m.channel = 'email' then c.email else c.phone_e164 end,
    'customerName', c.first_name,

    'tenantName',   t.display_name,
    'brandColor',   br.primary_color,
    'logoUrl',      br.logo_url,

    'serviceName',  sv.name,
    'startAt',      b.start_at,
    'endAt',        b.end_at,
    'timezone',     b.timezone,
    'staffName',    st.full_name,
    'locationName', l.name,
    'locationAddress', concat_ws(', ', l.address_line1, l.city),
    'locationPhone', l.phone_e164,

    -- Token novo, em claro, só para esta mensagem. Válido 90 dias: um lembrete
    -- de uma consulta de amanhã não precisa de um link que dure meio ano.
    'manageToken',  case
                      when b.id is not null and m.channel = 'email'
                      then booking.issue_access_token(m.tenant_id, b.id, m.customer_id,
                                                      'manage_booking', 90)
                      else null
                    end,

    'template',     (
      select jsonb_build_object('subject', tp.subject, 'body', tp.body)
      from booking.notification_templates tp
      where tp.type = m.type and tp.channel = m.channel and tp.is_active
        and (tp.tenant_id = m.tenant_id or tp.tenant_id is null)
      order by tp.tenant_id nulls last
      limit 1
    )
  )), '[]'::jsonb)
  into v_jobs
  from marcados m
  left join booking.bookings   b  on b.id  = m.booking_id
  left join booking.customers  c  on c.id  = m.customer_id
  left join booking.tenants    t  on t.id  = m.tenant_id
  left join booking.tenant_branding br on br.tenant_id = m.tenant_id
  left join booking.services   sv on sv.id = b.service_id
  left join booking.staff      st on st.id = b.staff_id
  left join booking.locations  l  on l.id  = b.location_id;

  return v_jobs;
end;
$$;

comment on function booking.claim_notification_jobs(text, int) is
  'Reclama jobs vencidos com FOR UPDATE SKIP LOCKED e emite um token de gestão novo por mensagem. Dois trabalhadores em paralelo nunca apanham o mesmo job.';

grant execute on function booking.claim_notification_jobs(text, int) to service_role;

-- -----------------------------------------------------------------------------
-- Guarda: um hash nunca pode viajar como se fosse um token
-- -----------------------------------------------------------------------------
do $$
declare v_fonte text;
begin
  select prosrc into v_fonte
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'booking' and p.proname = 'claim_notification_jobs';

  if v_fonte like '%token_hash%' then
    raise exception
      'claim_notification_jobs não pode devolver token_hash: um link construído a partir do hash não abre nada.';
  end if;
end;
$$;

-- =============================================================================
-- 0021 — Registar consentimento pelo caminho público
-- =============================================================================
--
-- O `anon` não escreve em `customer_consents` — nem tem grant, nem política.
-- Isso é correto e não vai mudar: uma tabela de consentimentos onde qualquer
-- visitante pode inserir linhas não prova nada, e a única coisa que um registo
-- de consentimento tem de fazer é provar.
--
-- Mas o consentimento é dado precisamente por quem não tem conta: a Sofia
-- aceita receber o lembrete no mesmo ecrã em que marca. Daí esta função —
-- entrada estreita, `SECURITY DEFINER`, com três restrições que a tornam
-- inofensiva:
--
--   1. Só aceita `reminders` e `marketing`. Não se consegue forjar aceitação
--      dos termos nem da política de privacidade por aqui — esses exigem um
--      registo com mais prova, e virão do caminho autenticado.
--   2. Só escreve para clientes que **acabaram de marcar** — nos últimos cinco
--      minutos. Sem isto, quem descobrisse um `customer_id` podia escrever
--      consentimentos alheios a qualquer momento.
--   3. Nunca lê nada de volta. Não serve para descobrir se um id existe: o
--      resultado é o mesmo em todos os casos.
--
-- REVOGAR É TÃO IMPORTANTE COMO CONCEDER
--
-- `p_granted := false` escreve uma linha nova com `granted = false` em vez de
-- alterar a antiga. Consentimento é um registo de eventos; apagar o "sim" ao
-- receber o "não" destruiria a prova de que ele existiu enquanto durou.
-- =============================================================================

create or replace function booking.record_consent(
  p_customer_id uuid,
  p_purpose     text,
  p_granted     boolean,
  p_source      booking.booking_source
)
returns void
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_recente boolean;
begin
  if p_purpose not in ('reminders', 'marketing') then
    raise exception 'Este consentimento não se regista por esta via' using errcode = '22023';
  end if;

  -- A janela dos cinco minutos. Um cliente criado há uma hora não recebe
  -- consentimentos por aqui — o ecrã de marcação já fechou há muito.
  select exists (
    select 1 from booking.customers
    where id = p_customer_id
      and created_at > now() - interval '5 minutes'
      and anonymized_at is null
  ) into v_recente;

  if not v_recente then
    -- Silêncio de propósito: um erro aqui diria a quem tentasse se o id existe.
    -- Falhar em silêncio é a resposta certa quando a resposta é informação.
    return;
  end if;

  insert into booking.customer_consents (customer_id, purpose, granted, source, evidence)
  values (
    p_customer_id,
    p_purpose::booking.consent_purpose,
    p_granted,
    p_source,
    jsonb_build_object('registadoEm', now(), 'via', 'pagina_publica')
  );
end;
$$;

comment on function booking.record_consent(uuid, text, boolean, booking.booking_source) is
  'Regista consentimento de lembretes ou marketing no caminho público. Janela de 5 minutos após a criação do cliente; falha em silêncio fora dela.';

revoke execute on function booking.record_consent(uuid, text, boolean, booking.booking_source) from public;
grant  execute on function booking.record_consent(uuid, text, boolean, booking.booking_source)
  to anon, authenticated, service_role;

-- =============================================================================
-- 0023 — Gerir a marcação sem conta
-- =============================================================================
--
-- A promessa do produto é marcar sem criar conta. A consequência é esta: quando
-- a Sofia quiser desmarcar, não há sessão para identificar. A prova de que é ela
-- é o **token** que lhe foi enviado para o contacto que ela própria deu.
--
-- QUATRO REGRAS QUE TORNAM ISTO SEGURO
--
-- 1. **O UUID da marcação nunca sai daqui.** O URL público leva o token e mais
--    nada. Um id sequencial ou adivinhável num URL seria uma porta aberta; um
--    UUID não é adivinhável, mas aparece em logs de servidor, no histórico do
--    browser e em quem lê por cima do ombro — e serve para sempre.
--
-- 2. **Guarda-se o hash, nunca o token.** Quem conseguisse ler a tabela não
--    conseguiria gerar links de acesso às marcações dos outros.
--
-- 3. **O token pertence a uma marcação.** Não é preciso verificar que "este
--    token pode mexer nesta marcação" — o token **é** a forma de a encontrar.
--    Usar o token da marcação A para tocar na B é estruturalmente impossível.
--
-- 4. **Contagem de utilizações e validade.** Um link que serve para sempre é um
--    link que qualquer pessoa com acesso ao telemóvel dela usa daqui a um ano.
--
-- O QUE ACONTECE QUANDO A POLÍTICA JÁ NÃO PERMITE
--
-- Não se esconde o botão. Mostra-se, explica-se porquê, e dá-se o telefone da
-- unidade. Uma pessoa que não pode cancelar online precisa de saber para onde
-- ligar — esconder a opção deixa-a a olhar para um ecrã sem saída.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validar o token
-- -----------------------------------------------------------------------------
-- Interna: nunca recebe grant. Todas as funções públicas abaixo passam por ela.
create or replace function booking.resolve_token(p_token text, p_conta_uso boolean default false)
returns uuid
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id      uuid;
  v_booking uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select t.id, t.booking_id into v_id, v_booking
    from booking.access_tokens t
   where t.token_hash = encode(sha256(p_token::bytea), 'hex')
     and t.expires_at > now()
     and t.uses < t.max_uses;

  if v_id is null then
    return null;
  end if;

  -- O contador só sobe nas ações, não em cada abertura da página. Alguém que
  -- abra o link cinco vezes para ver a hora não pode esgotar o próprio acesso.
  if p_conta_uso then
    update booking.access_tokens
       set uses = uses + 1, used_at = now()
     where id = v_id;
  end if;

  return v_booking;
end;
$$;

revoke execute on function booking.resolve_token(text, boolean) from public;

-- -----------------------------------------------------------------------------
-- Ver a marcação
-- -----------------------------------------------------------------------------
create or replace function booking.booking_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id     uuid;
  v_result jsonb;
begin
  -- `stable` não pode escrever, por isso a leitura nunca conta uso. É o que se
  -- quer: abrir a página é grátis.
  select t.booking_id into v_id
    from booking.access_tokens t
   where t.token_hash = encode(sha256(p_token::bytea), 'hex')
     and t.expires_at > now()
     and t.uses < t.max_uses;

  if v_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'status',        b.status,
    'startAt',       b.start_at,
    'endAt',         b.end_at,
    'timezone',      b.timezone,
    'serviceName',   sv.name,
    'durationMinutes', extract(epoch from (b.end_at - b.start_at))::int / 60,
    'staffName',     st.full_name,
    'customerName',  c.first_name,
    'notes',         b.notes,
    'price',         b.price,
    'currency',      b.currency,

    'tenantName',    tn.display_name,
    'tenantSlug',    tn.slug,

    'locationName',  l.name,
    'locationAddress', concat_ws(', ', l.address_line1, l.address_line2, l.city),
    'locationPhone', l.phone_e164,
    'locationEmail', l.email,

    -- As políticas viajam com a resposta para o ecrã poder explicar **antes**
    -- de a pessoa carregar no botão, em vez de a deixar tentar e falhar.
    'canCancel',     p.allow_customer_cancel,
    'canReschedule', p.allow_customer_reschedule,
    'cancelMinHours',     p.cancellation_min_hours,
    'rescheduleMinHours', p.reschedule_min_hours,
    'cancelDeadline',     b.start_at - make_interval(hours => p.cancellation_min_hours),
    'rescheduleDeadline', b.start_at - make_interval(hours => p.reschedule_min_hours),
    'now',           now(),

    -- O que a página precisa para pedir horas alternativas ao motor, sem
    -- expor o id da marcação.
    'locationId',    b.location_id,
    'serviceId',     b.service_id
  )
  into v_result
  from booking.bookings b
  join booking.services  sv on sv.id = b.service_id
  join booking.customers c  on c.id  = b.customer_id
  join booking.locations l  on l.id  = b.location_id
  join booking.tenants   tn on tn.id = b.tenant_id
  join booking.tenant_policies p on p.tenant_id = b.tenant_id
  left join booking.staff st on st.id = b.staff_id
  where b.id = v_id;

  return v_result;
end;
$$;

comment on function booking.booking_by_token(text) is
  'Detalhe de uma marcação a partir do token. Nunca devolve o id da marcação. Ler não consome utilizações.';

-- -----------------------------------------------------------------------------
-- Cancelar
-- -----------------------------------------------------------------------------
create or replace function booking.cancel_by_token(p_token text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id uuid;
begin
  v_id := booking.resolve_token(p_token, true);

  if v_id is null then
    raise exception 'Link inválido ou expirado' using errcode = 'P0002';
  end if;

  -- `p_by_customer := true` faz valer a política de antecedência do tenant e
  -- marca o cancelamento como sendo do cliente — que é o que interessa para
  -- distinguir "desistiu" de "a clínica fechou".
  return booking.cancel_booking(v_id, p_reason, true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Confirmar
-- -----------------------------------------------------------------------------
-- Confirmar não tem política de antecedência: confirmar é sempre bem-vindo,
-- inclusive cinco minutos antes.
create or replace function booking.confirm_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id uuid;
  v_b  record;
begin
  v_id := booking.resolve_token(p_token, true);

  if v_id is null then
    raise exception 'Link inválido ou expirado' using errcode = 'P0002';
  end if;

  select * into v_b from booking.bookings where id = v_id;

  if v_b.status not in ('pending', 'awaiting_confirmation') then
    raise exception 'Esta marcação já não está pendente' using errcode = 'P0005';
  end if;

  update booking.bookings
     set status = 'confirmed', confirmed_at = now()
   where id = v_id;

  insert into booking.booking_events
    (booking_id, tenant_id, from_status, to_status, actor_type, reason)
  values (v_id, v_b.tenant_id, v_b.status, 'confirmed', 'customer', 'confirmada pelo cliente');

  return jsonb_build_object('status', 'confirmed');
end;
$$;

-- -----------------------------------------------------------------------------
-- Remarcar
-- -----------------------------------------------------------------------------
create or replace function booking.reschedule_by_token(p_token text, p_new_start timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = booking, pg_catalog
as $$
declare
  v_id       uuid;
  v_resultado jsonb;
  v_nova     uuid;
  v_b        record;
begin
  v_id := booking.resolve_token(p_token, true);

  if v_id is null then
    raise exception 'Link inválido ou expirado' using errcode = 'P0002';
  end if;

  v_resultado := booking.reschedule_booking(v_id, p_new_start, null, 'remarcada pelo cliente', true);
  v_nova := (v_resultado->>'bookingId')::uuid;

  select * into v_b from booking.bookings where id = v_nova;

  -- O token seguia a marcação antiga, e a remarcação cria uma nova. Sem isto, o
  -- link que a pessoa tem no telemóvel deixava de servir logo a seguir a ela o
  -- usar — que é exatamente quando mais vai precisar dele.
  update booking.access_tokens
     set booking_id = v_nova
   where booking_id = v_id and purpose = 'manage_booking';

  return v_resultado;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- Este é o único conjunto de funções de escrita que o `anon` pode chamar sem
-- nada além de um token — e é por isso que cada uma valida o token à entrada.
grant execute on function booking.booking_by_token(text)          to anon, authenticated, service_role;
grant execute on function booking.cancel_by_token(text, text)     to anon, authenticated, service_role;
grant execute on function booking.confirm_by_token(text)          to anon, authenticated, service_role;
grant execute on function booking.reschedule_by_token(text, timestamptz) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Guarda
-- -----------------------------------------------------------------------------
do $$
declare v_fuga text;
begin
  -- Nenhuma destas funções pode devolver o id da marcação. Se alguém
  -- acrescentar `'bookingId', b.id` ao `booking_by_token`, a migration seguinte
  -- que corra esta verificação falha.
  select prosrc into v_fuga
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'booking' and p.proname = 'booking_by_token';

  if v_fuga ~* '''bookingId''' then
    raise exception 'booking_by_token não pode devolver o id da marcação — o URL público leva só o token.';
  end if;
end;
$$;

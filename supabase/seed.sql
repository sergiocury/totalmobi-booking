-- =============================================================================
-- Seed de desenvolvimento — Totalmobi Booking
--
-- Três tenants de propósitos deliberadamente diferentes. O segundo não é
-- decoração: é a prova, a cada `db reset`, de que o sistema não está a ser
-- construído para clínicas com uns cabeleireiros por cima. O terceiro é o
-- banco de ensaio de densidade — 41 profissionais e 14 serviços — porque um
-- painel que se porta bem com duas pessoas não prova nada.
--
-- Este ficheiro corre com `supabase db reset` e é idempotente.
-- NÃO correr em produção.
-- =============================================================================

-- IDs fixos para que os testes e os fixtures do frontend possam contar com eles.
-- 1111… = Clínica Sorriso · 2222… = Studio Bella
do $$
declare
  v_sorriso uuid := '11111111-1111-4111-8111-111111111111';
  v_bella   uuid := '22222222-2222-4222-8222-222222222222';
  v_atlantico uuid := '33333333-3333-4333-8333-333333333333';
begin

  -- ---------------------------------------------------------------------------
  -- Tenant 1 — Clínica Sorriso Lisboa (segmento dentário, duas unidades)
  -- ---------------------------------------------------------------------------
  insert into booking.tenants (
    id, slug, display_name, legal_name, segment, status, plan_code,
    email, phone_e164, whatsapp_phone_e164, website,
    country_code, default_timezone, default_locale, default_currency
  ) values (
    v_sorriso, 'clinica-sorriso', 'Clínica Sorriso Lisboa',
    'Sorriso — Medicina Dentária, Lda.', 'dental', 'active', 'ai',
    'geral@clinicasorriso.pt', '+351213456789', '+351213456789',
    'https://clinicasorriso.pt',
    'PT', 'Europe/Lisbon', 'pt-PT', 'EUR'
  )
  on conflict (id) do nothing;

  update booking.tenant_branding set
    primary_color      = '#0E7C86',
    secondary_color    = '#0B2027',
    background_color   = '#FBFDFD',
    text_color         = '#0B2027',
    font_family        = 'inter',
    border_radius      = 'lg',
    public_headline    = 'Marque a sua consulta em menos de um minuto',
    public_subheadline = 'Sem chamadas, sem espera. Escolha o dia e a hora que lhe dá jeito.'
  where tenant_id = v_sorriso;

  update booking.tenant_policies set
    cancellation_min_hours   = 24,
    reschedule_min_hours     = 24,
    min_advance_minutes      = 120,
    max_advance_days         = 90,
    slot_granularity_minutes = 15,
    require_confirmation     = false,
    require_email            = true
  where tenant_id = v_sorriso;

  insert into booking.locations (
    id, tenant_id, name, slug, address_line1, postal_code, city,
    country_code, timezone, phone_e164, latitude, longitude, is_default, sort_order
  ) values
    ('11111111-0000-4000-8000-000000000001', v_sorriso, 'Lisboa — Avenida', 'lisboa-avenida',
     'Av. da Liberdade 110', '1250-146', 'Lisboa', 'PT', 'Europe/Lisbon',
     '+351213456789', 38.720100, -9.145600, true, 1),
    ('11111111-0000-4000-8000-000000000002', v_sorriso, 'Cascais', 'cascais',
     'Rua Frederico Arouca 42', '2750-353', 'Cascais', 'PT', 'Europe/Lisbon',
     '+351214567890', 38.697700, -9.421500, false, 2)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Tenant 2 — Studio Bella (cabeleireiro e estética, plano mais baixo)
  -- ---------------------------------------------------------------------------
  insert into booking.tenants (
    id, slug, display_name, legal_name, segment, status, plan_code,
    email, phone_e164, whatsapp_phone_e164, website,
    country_code, default_timezone, default_locale, default_currency
  ) values (
    v_bella, 'studio-bella', 'Studio Bella',
    'Bella Studio Unipessoal, Lda.', 'hair_salon', 'active', 'professional',
    'ola@studiobella.pt', '+351915555111', '+351915555111',
    'https://studiobella.pt',
    'PT', 'Europe/Lisbon', 'pt-PT', 'EUR'
  )
  on conflict (id) do nothing;

  update booking.tenant_branding set
    primary_color      = '#B0446A',
    secondary_color    = '#2A1B22',
    background_color   = '#FFFBFC',
    text_color         = '#2A1B22',
    font_family        = 'dm-sans',
    border_radius      = 'full',
    public_headline    = 'O seu próximo look começa aqui',
    public_subheadline = 'Escolha o serviço, o profissional e a hora. Simples assim.'
  where tenant_id = v_bella;

  -- Políticas mais leves: num salão, cancelar na véspera é normal e a
  -- antecedência mínima é curta porque há muita marcação de última hora.
  update booking.tenant_policies set
    cancellation_min_hours   = 4,
    reschedule_min_hours     = 4,
    min_advance_minutes      = 30,
    max_advance_days         = 60,
    slot_granularity_minutes = 30,
    require_email            = false
  where tenant_id = v_bella;

  insert into booking.locations (
    id, tenant_id, name, slug, address_line1, postal_code, city,
    country_code, timezone, phone_e164, latitude, longitude, is_default, sort_order
  ) values
    ('22222222-0000-4000-8000-000000000001', v_bella, 'Príncipe Real', 'principe-real',
     'Rua da Escola Politécnica 88', '1250-102', 'Lisboa', 'PT', 'Europe/Lisbon',
     '+351915555111', 38.716400, -9.152300, true, 1)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Sobreposição de funcionalidade, para exercitar o mecanismo
  -- ---------------------------------------------------------------------------
  -- O Studio Bella está no plano Professional, que não inclui chatbot com IA.
  -- Aqui fica ligado à mão — é o caso comercial de piloto/cortesia, e é o que
  -- prova que tenant_features se sobrepõe a plan_features.
  insert into booking.tenant_features (tenant_id, feature_key, enabled, note)
  values (v_bella, 'chatbot_ai', true, 'Piloto comercial — rever em 2026-12')
  on conflict (tenant_id, feature_key) do nothing;


  -- ---------------------------------------------------------------------------
  -- Catálogo, equipa e horários das duas primeiras
  -- ---------------------------------------------------------------------------
  -- A nota no fim deste ficheiro dizia que isto «chega no Milestone 5 e 6,
  -- quando as tabelas existirem». As tabelas existem desde a 0009 e a 0011, e
  -- o seed continuou a parar nas unidades. Consequência prática: um `db reset`
  -- devolvia duas empresas que a página pública recusava, porque `preparacao()`
  -- exige serviço, profissional, ligação e horário — e o seed dava nenhum.
  insert into booking.services (id, tenant_id, name, slug, duration_minutes, price, currency)
  values
    ('11111111-5555-4555-8555-000000000001', v_sorriso, 'Limpeza dentária', 'limpeza-dentaria', 45, 65.00, 'EUR'),
    ('11111111-5555-4555-8555-000000000002', v_sorriso, 'Consulta de avaliação', 'consulta-avaliacao', 30, 40.00, 'EUR'),
    ('22222222-5555-4555-8555-000000000001', v_bella, 'Corte e brushing', 'corte-brushing', 60, 35.00, 'EUR'),
    ('22222222-5555-4555-8555-000000000002', v_bella, 'Coloração', 'coloracao', 120, 75.00, 'EUR')
  on conflict (id) do nothing;

  insert into booking.staff (id, tenant_id, full_name, job_title)
  values
    ('11111111-6666-4666-8666-000000000001', v_sorriso, 'Ana Martins', 'Médica dentista'),
    ('22222222-6666-4666-8666-000000000001', v_bella, 'Rita Nunes', 'Cabeleireira')
  on conflict (id) do nothing;

  insert into booking.staff_services (staff_id, service_id)
  select p.id, sv.id
  from booking.staff p
  join booking.services sv on sv.tenant_id = p.tenant_id
  where p.tenant_id in (v_sorriso, v_bella)
  on conflict (staff_id, service_id) do nothing;

  -- Segunda a sexta, 09:00–18:00, na unidade por omissão de cada empresa.
  insert into booking.staff_working_hours (staff_id, location_id, weekday, starts_at, ends_at)
  select p.id, l.id, d, time '09:00', time '18:00'
  from booking.staff p
  join booking.locations l on l.tenant_id = p.tenant_id and l.is_default
  cross join generate_series(1, 5) as d
  where p.tenant_id in (v_sorriso, v_bella)
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- Tenant 3 — Policlínica Atlântico (banco de ensaio de densidade)
  -- ---------------------------------------------------------------------------
  -- Existe para uma pergunta só: **o painel aguenta uma clínica grande?** Foi
  -- construída à mão durante o trabalho de agosto para pôr à prova as páginas
  -- de Equipa e Horários com 41 pessoas, e nunca ficou escrita em lado nenhum.
  -- Quando se apagou a base para recomeçar, perdeu-se — e a razão de a perder
  -- foi não estar aqui.
  --
  -- Gerada com `generate_series` em vez de 41 linhas escritas à mão: o número
  -- passa a ser um parâmetro, e trocar 41 por 200 é mudar um algarismo.
  insert into booking.tenants (
    id, slug, display_name, legal_name, segment, status, plan_code,
    email, country_code, default_timezone, default_locale, default_currency
  ) values (
    v_atlantico, 'policlinica-atlantico', 'Policlínica Atlântico',
    'Atlântico Saúde, S.A.', 'medical', 'active', 'professional',
    'geral@atlantico.pt', 'PT', 'Europe/Lisbon', 'pt-PT', 'EUR'
  )
  on conflict (id) do nothing;

  insert into booking.locations (
    id, tenant_id, name, slug, city, country_code, timezone, is_default, sort_order
  ) values
    ('33333333-0000-4000-8000-000000000001', v_atlantico, 'Sede — Avenidas Novas', 'sede', 'Lisboa', 'PT', 'Europe/Lisbon', true, 1),
    ('33333333-0000-4000-8000-000000000002', v_atlantico, 'Polo Norte — Matosinhos', 'polo-norte', 'Matosinhos', 'PT', 'Europe/Lisbon', false, 2)
  on conflict (id) do nothing;

  insert into booking.services (tenant_id, name, slug, duration_minutes, price, currency, sort_order)
  select
    v_atlantico,
    'Especialidade ' || n,
    'especialidade-' || n,
    15 * (1 + (n % 4)),
    30.00 + n,
    'EUR',
    n
  from generate_series(1, 14) as n
  on conflict do nothing;

  insert into booking.staff (tenant_id, full_name, job_title, sort_order)
  select
    v_atlantico,
    'Profissional ' || lpad(n::text, 2, '0'),
    case when n % 3 = 0 then 'Enfermeiro(a)' else 'Médico(a)' end,
    n
  from generate_series(1, 41) as n
  on conflict do nothing;

  -- Cada pessoa faz duas ou três especialidades, distribuídas de forma
  -- determinista. Todos a fazerem tudo não exercitaria a filtragem.
  insert into booking.staff_services (staff_id, service_id)
  select p.id, sv.id
  from (select id, row_number() over (order by sort_order) as n
        from booking.staff where tenant_id = v_atlantico) p
  cross join (select id, row_number() over (order by sort_order) as n
              from booking.services where tenant_id = v_atlantico) sv
  where (p.n + sv.n) % 5 < 2
  on conflict (staff_id, service_id) do nothing;

  insert into booking.staff_working_hours (staff_id, location_id, weekday, starts_at, ends_at)
  select p.id, l.id, d, time '08:00', time '20:00'
  from booking.staff p
  join booking.locations l on l.tenant_id = p.tenant_id and l.is_default
  cross join generate_series(1, 5) as d
  where p.tenant_id = v_atlantico
  on conflict do nothing;

end $$;

-- =============================================================================
-- Notas
--
-- · As marcações continuam por semear: dependem de datas, e um seed com datas
--   fixas envelhece mal. Serviços, equipa, ligações e horários já cá estão —
--   sem eles `preparacao()` considera as empresas por abrir, e a página pública
--   recusa-se a marcar.
--
-- · Não se criam utilizadores nem memberships aqui: as contas vivem em
--   auth.users, que neste projeto é PARTILHADO com o Totalmobi CMS. Os testes
--   criam as suas próprias contas descartáveis contra a instância local.
--   Ver packages/database/tests/helpers/users.ts.
-- =============================================================================

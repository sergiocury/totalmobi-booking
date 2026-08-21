-- =============================================================================
-- Seed de desenvolvimento — Totalmobi Booking
--
-- Dois tenants de segmentos deliberadamente diferentes. O segundo não é
-- decoração: é a prova, a cada `db reset`, de que o sistema não está a ser
-- construído para clínicas com uns cabeleireiros por cima.
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
    'Sorriso — Medicina Dentária, Lda.', 'dental', 'active', 'premium',
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

end $$;

-- =============================================================================
-- Notas
--
-- · Serviços, profissionais, horários e marcações chegam no Milestone 5 e 6,
--   quando as tabelas existirem. Semear agora obrigaria a inventar schema.
--
-- · Não se criam utilizadores nem memberships aqui: as contas vivem em
--   auth.users, que neste projeto é PARTILHADO com o Totalmobi CMS. Os testes
--   criam as suas próprias contas descartáveis contra a instância local.
--   Ver packages/database/tests/helpers/users.ts.
-- =============================================================================

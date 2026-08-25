-- =============================================================================
-- 0033 — Os planos comerciais
-- =============================================================================
--
-- Alinha a tabela `plans` com a oferta que a landing vende, definida em
-- `packages/shared/src/domain/planos.ts`:
--
--     basic         → essential      €29   (€290/ano)
--     professional  → professional   €49   (€290 → €490/ano)
--     premium       → ai             €79   (€790/ano)
--
-- Os preços de `professional` e `premium` mudam de verdade: €69 → €49 e
-- €149 → €79. Não é uma renomeação cosmética.
--
-- PORQUE É QUE NÃO É UM `UPDATE plans SET code = ...`
--
-- `tenants.plan_code` e `plan_features.plan_code` são chaves estrangeiras **sem**
-- `ON UPDATE CASCADE`. Mudar o código diretamente falharia. A ordem tem de ser:
-- criar o novo, reapontar quem aponta, e só então apagar o velho.
--
-- O ANUAL SÃO DEZ MENSALIDADES
--
-- Doze meses ao preço de dez, decidido a 2026-08-25. Guarda-se o valor e não a
-- percentagem: uma percentagem obriga a fazer contas de cada vez que alguém
-- quer saber quanto custa.
--
-- OS IDENTIFICADORES DO STRIPE FICAM VAZIOS
--
-- As colunas existem, os valores não. Os `price_id` são criados na conta Stripe
-- da Totalmobi e diferem entre modo de teste e modo real — escrevê-los numa
-- migration seria fixar o modo de teste para sempre. Entram por configuração.
-- =============================================================================

alter table booking.plans
  add column if not exists annual_price numeric(10, 2),
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_annual_price_id text;

comment on column booking.plans.annual_price is
  'Dez mensalidades. Null quando o plano não se vende ao ano.';
comment on column booking.plans.stripe_monthly_price_id is
  'price_… do Stripe. Difere entre modo de teste e modo real; preenchido por ambiente, não por migration.';

-- -----------------------------------------------------------------------------
-- 1. Os planos novos
-- -----------------------------------------------------------------------------
insert into booking.plans (code, name, description, monthly_price, annual_price, currency, is_public, sort_order)
values
  ('essential', 'Essencial',
   'Tudo o que precisa para começar a receber marcações online.',
   29, 290, 'EUR', true, 1),
  ('ai', 'IA',
   'Deixe a inteligência artificial atender e marcar.',
   79, 790, 'EUR', true, 3)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  annual_price = excluded.annual_price,
  sort_order = excluded.sort_order,
  updated_at = now();

-- O `professional` mantém o código e muda de preço e de nome visível.
update booking.plans
set name = 'Profissional',
    description = 'Transforme o WhatsApp num canal de marcações.',
    monthly_price = 49,
    annual_price = 490,
    sort_order = 2,
    updated_at = now()
where code = 'professional';

-- -----------------------------------------------------------------------------
-- 2. Reapontar quem depende dos códigos antigos
-- -----------------------------------------------------------------------------
update booking.tenants set plan_code = 'essential', updated_at = now() where plan_code = 'basic';
update booking.tenants set plan_code = 'ai',        updated_at = now() where plan_code = 'premium';

-- -----------------------------------------------------------------------------
-- 3. As funcionalidades de cada plano
-- -----------------------------------------------------------------------------
-- Escritas de raiz a partir de `planos.ts`, e não copiadas das linhas antigas:
-- copiar arrastaria para o plano novo o que o antigo tinha por acaso.
delete from booking.plan_features where plan_code in ('essential', 'professional', 'ai', 'basic', 'premium');

insert into booking.plan_features (plan_code, feature_key) values
  -- A página pública está em todos, incluindo o mais barato. É o argumento que
  -- responde a "eu não tenho site", e cortá-lo à entrada seria cortar a entrada.
  ('essential', 'widget'),

  ('professional', 'widget'),
  ('professional', 'whatsapp'),
  ('professional', 'multi_location'),
  ('professional', 'waitlist'),
  ('professional', 'advanced_reports'),

  ('ai', 'widget'),
  ('ai', 'whatsapp'),
  ('ai', 'multi_location'),
  ('ai', 'waitlist'),
  ('ai', 'advanced_reports'),
  ('ai', 'chatbot_ai'),
  ('ai', 'resources'),
  ('ai', 'group_sessions'),
  ('ai', 'api_access')
on conflict do nothing;

-- `voice` não está em plano nenhum: existe como chave e como canal, não existe
-- como funcionalidade. `custom_domain` também sai — a coluna existe, nenhuma
-- rota a serve, e vendê-la seria prometer o que não se entrega.

-- -----------------------------------------------------------------------------
-- 4. Apagar os antigos, agora que ninguém aponta para eles
-- -----------------------------------------------------------------------------
delete from booking.plans where code in ('basic', 'premium');

-- -----------------------------------------------------------------------------
-- Guarda
-- -----------------------------------------------------------------------------
do $$
declare
  v_orfaos int;
  v_planos int;
begin
  select count(*) into v_orfaos from booking.tenants
   where plan_code not in ('essential', 'professional', 'ai');

  if v_orfaos > 0 then
    raise exception 'Ficaram % empresas com um plano que já não existe.', v_orfaos;
  end if;

  select count(*) into v_planos from booking.plans where is_public;

  if v_planos <> 3 then
    raise exception 'Esperava 3 planos públicos, encontrei %.', v_planos;
  end if;
end;
$$;

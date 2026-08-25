-- =============================================================================
-- 0034 — Subscrições e eventos do Stripe
-- =============================================================================
--
-- QUEM MANDA NO ESTADO DA SUBSCRIÇÃO É O STRIPE
--
-- Estas tabelas são uma **cópia sincronizada**, não a verdade. A verdade é o
-- Stripe: é lá que o cartão é cobrado, que a renovação acontece e que o
-- cancelamento fica registado. Aqui guarda-se o suficiente para o produto
-- decidir o que mostrar sem ter de perguntar ao Stripe a cada pedido.
--
-- A consequência prática: em caso de dúvida, o Stripe ganha. Nunca se ativa
-- acesso a partir do que está escrito aqui se isso contradisser um evento
-- verificado.
--
-- O QUE NUNCA ATIVA UMA SUBSCRIÇÃO
--
-- O browser chegar a /sucesso. Qualquer pessoa consegue abrir esse endereço.
-- A ativação depende do webhook, com assinatura verificada — e só dele.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Eventos recebidos
-- -----------------------------------------------------------------------------
-- O Stripe reenvia eventos quando não recebe uma resposta a tempo, e pode
-- entregar o mesmo evento mais do que uma vez mesmo quando tudo corre bem.
-- Processar duas vezes uma subscrição criada não é grave; processar duas vezes
-- um pagamento pode ser. A chave primária no id do evento é a idempotência —
-- não uma verificação em código que alguém se esquece de fazer.
create table if not exists booking.stripe_webhook_events (
  id            text primary key,
  type          text        not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  status        text        not null default 'received'
                check (status in ('received', 'processed', 'ignored', 'failed')),
  error         text,
  -- O corpo do evento, para se poder reprocessar sem pedir ao Stripe outra vez.
  payload       jsonb
);

create index if not exists stripe_webhook_events_status_idx
  on booking.stripe_webhook_events (status, received_at desc);

comment on table booking.stripe_webhook_events is
  'Eventos do Stripe já recebidos. A chave primária no id do evento é o que impede o mesmo evento de ser processado duas vezes.';

-- -----------------------------------------------------------------------------
-- Subscrições
-- -----------------------------------------------------------------------------
create table if not exists booking.tenant_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references booking.tenants(id) on delete cascade,

  stripe_customer_id      text not null,
  stripe_subscription_id  text not null unique,
  stripe_price_id         text not null,

  plan_code               text not null references booking.plans(code) on delete restrict,
  -- Os estados são os do Stripe, escritos como ele os escreve. Traduzi-los
  -- criaria um mapa para manter de cada vez que ele acrescentasse um.
  status                  text not null,
  -- 'month' ou 'year'. Guardado porque o cartão do plano tem de saber o que
  -- mostrar sem ir buscar o preço ao Stripe.
  interval                text check (interval in ('month', 'year')),

  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  trial_end               timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Uma empresa tem uma subscrição ativa de cada vez. As antigas ficam, com o
-- estado que o Stripe lhes deu — o histórico responde a "desde quando é que
-- este cliente paga", que é uma pergunta que se faz.
create unique index if not exists tenant_subscriptions_uma_ativa
  on booking.tenant_subscriptions (tenant_id)
  where status in ('trialing', 'active', 'past_due');

create index if not exists tenant_subscriptions_tenant_idx
  on booking.tenant_subscriptions (tenant_id, created_at desc);

create index if not exists tenant_subscriptions_customer_idx
  on booking.tenant_subscriptions (stripe_customer_id);

comment on table booking.tenant_subscriptions is
  'Cópia sincronizada do estado no Stripe. O Stripe é a fonte da verdade; isto existe para o produto não ter de lhe perguntar a cada pedido.';

drop trigger if exists tenant_subscriptions_touch on booking.tenant_subscriptions;
create trigger tenant_subscriptions_touch
  before update on booking.tenant_subscriptions
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------
alter table booking.stripe_webhook_events enable row level security;
alter table booking.stripe_webhook_events force row level security;
alter table booking.tenant_subscriptions  enable row level security;
alter table booking.tenant_subscriptions  force row level security;

-- Os eventos não têm dono: são da plataforma. Sem política nenhuma, ninguém
-- lhes chega a não ser pelo `service_role`, que é o que o webhook usa. É o
-- comportamento pretendido e não um esquecimento.

-- A subscrição da própria empresa é visível a quem a gere. Ver, não escrever:
-- escrever é do webhook.
drop policy if exists tenant_subscriptions_select on booking.tenant_subscriptions;
create policy tenant_subscriptions_select on booking.tenant_subscriptions
  for select
  using (tenant_id = any ((select booking.current_tenant_ids())::uuid[]));

grant select on booking.tenant_subscriptions to authenticated;

-- -----------------------------------------------------------------------------
-- Guarda
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'booking' and table_name = 'tenant_subscriptions'
  ) then
    raise exception 'tenant_subscriptions não foi criada.';
  end if;

  -- Os planos têm de existir antes de alguém subscrever um.
  if (select count(*) from booking.plans where is_public) <> 3 then
    raise exception 'Esperava 3 planos públicos. Correr a migration 0033 primeiro.';
  end if;
end;
$$;

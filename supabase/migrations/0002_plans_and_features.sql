-- =============================================================================
-- 0002 — Planos e feature flags
-- Totalmobi Booking · Milestone 1
--
-- Planos e funcionalidades são coisas diferentes e mudam por razões diferentes:
-- os planos mudam com a área comercial, as funcionalidades com o produto. Por
-- isso não há `if (plan === 'premium')` em lado nenhum — há `hasFeature()`.
-- =============================================================================

create table booking.plans (
  code            text primary key
                    check (code ~ '^[a-z][a-z0-9_]{1,29}$'),
  name            text not null,
  description     text,
  monthly_price   numeric(12,2) not null default 0 check (monthly_price >= 0),
  currency        char(3) not null default 'EUR',
  is_public       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table booking.features (
  key             text primary key
                    check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name            text not null,
  description     text,
  created_at      timestamptz not null default now()
);

create table booking.plan_features (
  plan_code       text not null references booking.plans(code) on delete cascade,
  feature_key     text not null references booking.features(key) on delete cascade,
  primary key (plan_code, feature_key)
);

-- Sobreposição por tenant: liga uma funcionalidade fora do plano (piloto,
-- cortesia comercial) ou desliga uma que o plano incluiria.
create table booking.tenant_features (
  tenant_id       uuid not null,   -- FK acrescentada em 0003, depois de tenants existir
  feature_key     text not null references booking.features(key) on delete cascade,
  enabled         boolean not null,
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  primary key (tenant_id, feature_key)
);

comment on table booking.tenant_features is
  'Sobrepõe-se a plan_features. Resolução: coalesce(tenant_features.enabled, plan_features existe).';

create trigger plans_touch before update on booking.plans
  for each row execute function booking.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — ativada aqui, políticas em 0006
-- -----------------------------------------------------------------------------
-- Entre esta migration e a 0006 as tabelas ficam com RLS ativa e sem políticas,
-- o que significa "negar tudo". É deliberado: o projeto tem
-- "Automatically expose new tables" ligado, e uma tabela nova sem RLS ficaria
-- exposta na Data API no instante em que é criada.
alter table booking.plans           enable row level security;
alter table booking.plans           force  row level security;
alter table booking.features        enable row level security;
alter table booking.features        force  row level security;
alter table booking.plan_features   enable row level security;
alter table booking.plan_features   force  row level security;
alter table booking.tenant_features enable row level security;
alter table booking.tenant_features force  row level security;

-- -----------------------------------------------------------------------------
-- Catálogo inicial
-- -----------------------------------------------------------------------------

insert into booking.features (key, name, description) values
  ('whatsapp',         'WhatsApp',                'Canal WhatsApp Business oficial'),
  ('chatbot_ai',       'Chatbot com IA',          'Marcação por linguagem natural'),
  ('voice',            'Assistente de voz',       'Atendimento por chamada'),
  ('multi_location',   'Múltiplas unidades',      'Mais do que uma unidade por empresa'),
  ('resources',        'Salas e equipamentos',    'Disponibilidade por recurso, além do profissional'),
  ('payments',         'Pagamentos',              'Sinal e pagamento no ato da marcação'),
  ('advanced_reports', 'Relatórios avançados',    'Ocupação, receita estimada, coortes'),
  ('custom_domain',    'Domínio próprio',         'agenda.oseudominio.pt'),
  ('api_access',       'Acesso à API',            'Integração com sistemas externos'),
  ('waitlist',         'Lista de espera',         'Aviso automático quando surge vaga'),
  ('group_sessions',   'Sessões de grupo',        'Aulas e workshops com várias vagas'),
  ('widget',           'Widget para website',     'Botão de marcação embebido')
on conflict (key) do nothing;

insert into booking.plans (code, name, description, monthly_price, currency, sort_order) values
  ('basic',        'Basic',        'Agenda, marcação online e email',          29.00, 'EUR', 1),
  ('professional', 'Professional', 'Tudo do Basic mais WhatsApp e automações', 69.00, 'EUR', 2),
  ('premium',      'Premium',      'Tudo do Professional mais IA e voz',      149.00, 'EUR', 3)
on conflict (code) do nothing;

insert into booking.plan_features (plan_code, feature_key) values
  ('basic',        'widget'),

  ('professional', 'widget'),
  ('professional', 'whatsapp'),
  ('professional', 'multi_location'),
  ('professional', 'waitlist'),
  ('professional', 'custom_domain'),

  ('premium',      'widget'),
  ('premium',      'whatsapp'),
  ('premium',      'multi_location'),
  ('premium',      'waitlist'),
  ('premium',      'custom_domain'),
  ('premium',      'chatbot_ai'),
  ('premium',      'voice'),
  ('premium',      'resources'),
  ('premium',      'payments'),
  ('premium',      'advanced_reports'),
  ('premium',      'api_access'),
  ('premium',      'group_sessions')
on conflict do nothing;

-- =============================================================================
-- 0025 — O que sai por omissão
-- =============================================================================
--
-- Uma empresa nova tem de avisar os clientes desde o primeiro dia, sem
-- configurar nada. Quem quiser mudar o texto ou a antecedência muda; quem não
-- quiser, fica com algo que funciona.
--
-- OS TEMPLATES DA PLATAFORMA NÃO PERTENCEM A NINGUÉM
--
-- `tenant_id is null` — e a `claim_notification_jobs` prefere o do tenant
-- quando existe (`order by tenant_id nulls last`). É o que evita semear seis
-- linhas de texto em cada empresa criada, e o que permite melhorar o texto de
-- toda a gente numa migration.
--
-- O corpo usa `{{chaves}}` simples. Nada de motor de templates: são quatro
-- substituições, e uma dependência a mais no caminho de envio é uma coisa a
-- mais para falhar às três da manhã.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Templates da plataforma
-- -----------------------------------------------------------------------------
insert into booking.notification_templates (tenant_id, type, channel, locale, subject, body)
values
  (null, 'booking_created', 'email', 'pt-PT',
   'Marcação registada — {{tenantName}}',
   E'Olá {{customerName}},\n\n'
   'A sua marcação ficou registada:\n\n'
   '{{serviceName}}\n'
   '{{quando}}\n'
   '{{staffLinha}}'
   '{{locationName}}{{locationAddress}}\n\n'
   'Pode ver, remarcar ou cancelar aqui:\n{{manageUrl}}\n\n'
   'Até breve,\n{{tenantName}}'),

  (null, 'booking_confirmed', 'email', 'pt-PT',
   'Marcação confirmada — {{tenantName}}',
   E'Olá {{customerName}},\n\n'
   'A sua marcação está confirmada:\n\n'
   '{{serviceName}}\n'
   '{{quando}}\n'
   '{{staffLinha}}'
   '{{locationName}}{{locationAddress}}\n\n'
   'Se precisar de alterar:\n{{manageUrl}}\n\n'
   '{{tenantName}}'),

  (null, 'reminder', 'email', 'pt-PT',
   'Lembrete: {{serviceName}} {{quando}}',
   E'Olá {{customerName}},\n\n'
   'Este é um lembrete da sua marcação:\n\n'
   '{{serviceName}}\n'
   '{{quando}}\n'
   '{{staffLinha}}'
   '{{locationName}}{{locationAddress}}\n\n'
   'Se não puder vir, avise-nos por aqui:\n{{manageUrl}}\n\n'
   '{{tenantName}}'),

  (null, 'cancelled', 'email', 'pt-PT',
   'Marcação cancelada — {{tenantName}}',
   E'Olá {{customerName}},\n\n'
   'A marcação de {{serviceName}}, {{quando}}, foi cancelada.\n\n'
   'Se quiser voltar a marcar, contacte-nos{{telefoneFrase}}.\n\n'
   '{{tenantName}}'),

  (null, 'rescheduled', 'email', 'pt-PT',
   'Marcação alterada — {{tenantName}}',
   E'Olá {{customerName}},\n\n'
   'A sua marcação de {{serviceName}} passou para:\n\n'
   '{{quando}}\n'
   '{{staffLinha}}'
   '{{locationName}}{{locationAddress}}\n\n'
   'Detalhes e alterações:\n{{manageUrl}}\n\n'
   '{{tenantName}}')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Regras por omissão numa empresa nova
-- -----------------------------------------------------------------------------
-- Três avisos, e nem um a mais.
--
-- A tentação é ligar tudo: criação, confirmação, lembrete de 48 h, lembrete de
-- 24 h, lembrete de 2 h, agradecimento, pedido de avaliação. O resultado é o
-- cliente a marcar a empresa como spam antes da segunda consulta — e aí perde-se
-- o canal para o que interessa mesmo, que é o lembrete.
create or replace function booking.seed_notification_rules(p_tenant uuid)
returns void
language sql
security definer
set search_path = booking, pg_catalog
as $$
  insert into booking.notification_rules (tenant_id, type, channel, offset_minutes)
  values
    -- No momento em que marca: a confirmação com o link de gestão.
    (p_tenant, 'booking_created', 'email', 0),
    -- 24 horas antes: o lembrete que reduz faltas.
    (p_tenant, 'reminder',        'email', 1440),
    -- Ao cancelar: a confirmação de que ficou mesmo cancelada.
    (p_tenant, 'cancelled',       'email', 0)
  on conflict do nothing;
$$;

-- -----------------------------------------------------------------------------
-- Passar a semear com o tenant
-- -----------------------------------------------------------------------------
-- A 0003 já criava branding e políticas com o tenant. Acrescenta-se as regras
-- de notificação à mesma função — `create or replace`, sem tocar na migration
-- antiga.
create or replace function booking.tg_tenants_seed_defaults()
returns trigger
language plpgsql
set search_path = booking, pg_catalog
as $$
begin
  insert into booking.tenant_branding (tenant_id) values (new.id) on conflict do nothing;
  insert into booking.tenant_policies (tenant_id) values (new.id) on conflict do nothing;
  perform booking.seed_notification_rules(new.id);
  return new;
end;
$$;

-- Os tenants que já existem também precisam.
do $$
declare v_t uuid;
begin
  for v_t in select id from booking.tenants loop
    perform booking.seed_notification_rules(v_t);
  end loop;
end;
$$;

revoke execute on function booking.seed_notification_rules(uuid) from public;
grant  execute on function booking.seed_notification_rules(uuid) to service_role;

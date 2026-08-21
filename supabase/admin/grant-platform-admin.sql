-- =============================================================================
-- Administradores da plataforma Totalmobi
--
-- ⚠️ ISTO NÃO É UMA MIGRATION, e está fora de supabase/migrations/ de propósito.
--
-- Contém IDs de contas concretas do projeto de produção. Numa base de dados
-- limpa (staging, local) estes utilizadores não existem e o script falharia —
-- por isso não pode fazer parte da cadeia de migrations, que tem de correr em
-- qualquer ambiente.
--
-- `booking.platform_admins` não tem política de escrita para papel nenhum, nem
-- para o próprio. Isso é deliberado (ver migration 0006): promover alguém exige
-- passar por aqui, com SQL direto. Num projeto cujo auth.users é partilhado com
-- o Totalmobi CMS, uma política de escrita mal desenhada nesta tabela seria o
-- pior buraco possível.
--
-- Correr com o token de gestão:
--   node scripts/sbsql.mjs -f supabase/admin/grant-platform-admin.sql
-- =============================================================================

insert into booking.platform_admins (user_id, email, full_name, can_impersonate)
select u.id, u.email, v.nome, true
from (values
  ('sergio@totalmobi.com.br', 'Sérgio Cury'),
  ('cury.sergio@gmail.com',   'Sérgio Cury')
) as v(email, nome)
join auth.users u on u.email = v.email
on conflict (user_id) do update
  set email           = excluded.email,
      full_name       = excluded.full_name,
      can_impersonate = excluded.can_impersonate;

-- As duas contas são da mesma pessoa. Ambas ficam com acesso porque é a que
-- vai iniciar sessão, e descobrir qual delas é a "certa" no meio de um teste de
-- login é fricção sem ganho nenhum de segurança.

select
  pa.email,
  pa.full_name,
  pa.can_impersonate,
  u.last_sign_in_at::date as ultimo_login
from booking.platform_admins pa
join auth.users u on u.id = pa.user_id
order by pa.email;

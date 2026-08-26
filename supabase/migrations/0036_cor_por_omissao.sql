-- =============================================================================
-- 0036 — Uma cor de marca por omissão mais calma
-- =============================================================================
-- O azul por omissão era `#0B5FFF`: saturação 0,96 e contraste 5,13 com branco.
-- Passa a `#3358D4`, com saturação 0,76 e contraste 6,02 — **menos berrante e
-- ao mesmo tempo mais legível**, que é a combinação que costuma não existir.
--
-- O QUE ESTA MIGRATION NÃO RESOLVE, E JÁ FOI RESOLVIDO NOUTRO SÍTIO
--
-- A queixa que motivou isto era um cartão de serviço pintado de ciano
-- fluorescente na página pública. A cor não vinha desta coluna: vinha de
-- `--brand-soft`, calculado com `tintColor(primary, 4.2)` — uma função que
-- escala a luminância e mantém a saturação, devolvendo `#1FB8FF` para este
-- azul. Isso corrigiu-se no código, passando a misturar a cor com o fundo.
--
-- Esta migration é a outra metade: mesmo bem calculado, um tom suave herda a
-- saturação de quem lhe dá origem.
--
-- Só se atualizam as empresas que ainda têm o valor antigo por omissão. Quem
-- escolheu uma cor fica com ela — mudar a marca de um cliente por causa de uma
-- migration seria um abuso.
-- =============================================================================

alter table booking.tenant_branding
  alter column primary_color set default '#3358D4';

update booking.tenant_branding
set primary_color = '#3358D4',
    updated_at = now()
where primary_color = '#0B5FFF';

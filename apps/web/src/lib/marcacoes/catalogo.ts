import 'server-only';

import type { BookingClient } from '@totalmobi/database';
import { montarCatalogo, type Catalogo } from '@totalmobi/shared';

/**
 * O catalogo da empresa, lido da base de dados.
 *
 * A **regra** — esconder o servico que ninguem faz — vive em
 * `@totalmobi/shared`, com testes. Aqui so ficam as consultas: e a divisao que
 * permite prender a regra num teste sem precisar de base de dados nenhuma.
 *
 * Ver a nota em `montarCatalogo` sobre o beco que isto fecha.
 */

export type CatalogoDaEmpresa = Catalogo<
  { id: string; name: string },
  { id: string; full_name: string }
>;

const VAZIO: CatalogoDaEmpresa = { servicos: [], equipa: [], quemFaz: new Map() };

export async function carregarCatalogo(
  client: BookingClient,
  tenantId: string,
): Promise<CatalogoDaEmpresa> {
  const [{ data: servicos }, { data: equipa }, { data: ligacoes }] = await Promise.all([
    client
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('bookable_online', true)
      .order('sort_order'),
    client
      .from('staff')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('accepts_online_booking', true)
      .order('sort_order'),
    client.from('staff_services').select('staff_id, service_id'),
  ]);

  if (!servicos || !equipa) return VAZIO;

  return montarCatalogo(servicos, equipa, ligacoes ?? []);
}

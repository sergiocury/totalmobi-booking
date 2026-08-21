import { notFound } from 'next/navigation';

import { loadTenantPage } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

/**
 * Exportação em CSV.
 *
 * **Leva os agregados, não as marcações.** É a mesma decisão do ecrã: um
 * ficheiro com mil linhas de nomes e telefones é um risco de RGPD a circular
 * por email, e não é o que quem pede "exportar o relatório" quer — quer os
 * números para pôr numa folha de cálculo.
 *
 * O BOM no início não é decorativo: sem ele, o Excel em Windows abre um CSV
 * UTF-8 e mostra "Limpeza dentÃ¡ria". É o género de detalhe que faz o cliente
 * achar que o produto está partido.
 */
function escapar(valor: string | number): string {
  const s = String(valor);
  // Ponto e vírgula como separador: o Excel em português abre-o direito em
  // colunas, e a vírgula é separador decimal cá.
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
): Promise<Response> {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const url = new URL(request.url);
  const unidadeId = url.searchParams.get('unidade');
  const dias = Math.min(Math.max(Number(url.searchParams.get('dias')) || 30, 7), 365);

  if (!unidadeId) return new Response('falta a unidade', { status: 400 });

  const ate = new Date();
  const de = new Date(ate.getTime() - dias * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data, error } = await context.client.rpc('report_period', {
    p_location_id: unidadeId,
    p_from: iso(de),
    p_to: iso(ate),
  });

  if (error || !data) return new Response('não foi possível gerar', { status: 500 });

  const r = data as never as {
    de: string;
    ate: string;
    totais: Record<string, number | string | null>;
    porMes: { mes: string; marcacoes: number; concluidas: number; faltas: number }[];
    porServico: { servico: string; marcacoes: number; receita: number }[];
    porProfissional: { profissional: string; marcacoes: number; faltas: number }[];
    porHora: { hora: number; marcacoes: number }[];
    porOrigem: { origem: string; marcacoes: number }[];
  };

  const linhas: string[] = [
    `Relatório;${escapar(tenantSlug)};${r.de};${r.ate}`,
    '',
    'Secção;Categoria;Marcações;Concluídas;Faltas',
    ...r.porMes.map((m) => `Mês;${m.mes};${m.marcacoes};${m.concluidas};${m.faltas}`),
    ...r.porServico.map((s) => `Serviço;${escapar(s.servico)};${s.marcacoes};;`),
    ...r.porProfissional.map(
      (p) => `Profissional;${escapar(p.profissional)};${p.marcacoes};;${p.faltas}`,
    ),
    ...r.porHora.map((h) => `Hora;${String(h.hora).padStart(2, '0')}:00;${h.marcacoes};;`),
    ...r.porOrigem.map((o) => `Origem;${escapar(o.origem)};${o.marcacoes};;`),
  ];

  return new Response(`\uFEFF${linhas.join('\r\n')}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="relatorio-${tenantSlug}-${r.de}-a-${r.ate}.csv"`,
    },
  });
}

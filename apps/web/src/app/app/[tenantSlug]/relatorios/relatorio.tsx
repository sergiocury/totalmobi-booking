'use client';

import { Card, cn } from '@totalmobi/ui';

import { Barras, type Ponto } from '@/components/charts/barras';
import { Ficha, Medidor } from '@/components/charts/ficha';

/**
 * O ecrã de relatórios.
 *
 * A ORDEM DE LEITURA É A DECISÃO PRINCIPAL
 *
 * Primeiro o **hoje** — é o que quem abre isto de manhã quer saber, e são
 * números, não gráficos. Só depois o período, que é análise e não operação.
 *
 * Um painel que abre com um gráfico de doze meses responde a uma pergunta que
 * ninguém fez às nove da manhã.
 */

interface Hoje {
  dia: string;
  total: number;
  confirmadas: number;
  pendentes: number;
  canceladas: number;
  faltas: number;
  concluidas: number;
  proxima: string | null;
}

interface Periodo {
  de: string;
  ate: string;
  timezone: string;
  totais: {
    marcacoes: number;
    concluidas: number;
    canceladas: number;
    faltas: number;
    clientes: number;
    receitaEstimada: number;
    moeda: string | null;
  };
  porMes: { mes: string; marcacoes: number; concluidas: number; faltas: number }[];
  porServico: { servico: string; marcacoes: number; receita: number }[];
  porProfissional: { profissional: string; marcacoes: number; faltas: number }[];
  porHora: { hora: number; marcacoes: number }[];
  porOrigem: { origem: string; marcacoes: number }[];
  clientes: { novos: number; recorrentes: number };
}

const ORIGENS: Record<string, string> = {
  public_web: 'Página pública',
  widget: 'Widget',
  whatsapp: 'WhatsApp',
  voice: 'Voz',
  admin: 'Balcão',
  api: 'API',
  import: 'Importação',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '12 meses' },
];

export function Relatorio({
  tenantSlug,
  unidadeId,
  unidades,
  dias,
  hoje,
  periodo,
}: {
  tenantSlug: string;
  unidadeId: string;
  unidades: { id: string; name: string }[];
  dias: number;
  hoje: Hoje | null;
  periodo: Periodo | null;
}) {
  if (!periodo || !hoje) {
    return (
      <p className="mt-8 text-(length:--text-sm) text-(--ink-muted)">
        Não foi possível carregar os números.
      </p>
    );
  }

  const t = periodo.totais;

  // Taxa de comparência: das que deviam ter acontecido, quantas aconteceram.
  // As canceladas ficam de fora do denominador de propósito — cancelar com
  // aviso não é faltar, e misturá-las esconderia o problema real.
  const compareceram = t.concluidas;
  const deviamTer = t.concluidas + t.faltas;

  const porMes: Ponto[] = periodo.porMes.map((m) => {
    const [ano, mes] = m.mes.split('-');
    return {
      rotulo: `${MESES[Number(mes) - 1]}${dias > 365 ? `/${ano!.slice(2)}` : ''}`,
      valor: m.marcacoes,
      detalhe: `${m.concluidas} concluídas, ${m.faltas} faltas`,
    };
  });

  const porHora: Ponto[] = periodo.porHora.map((h) => ({
    rotulo: `${String(h.hora).padStart(2, '0')}h`,
    valor: h.marcacoes,
  }));

  const ligacao = `/app/${tenantSlug}/relatorios?unidade=${unidadeId}&dias=`;

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="mb-3 font-medium">Hoje</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Ficha rotulo="Marcações" valor={hoje.total} />
          <Ficha rotulo="Confirmadas" valor={hoje.confirmadas} tom="bom" />
          <Ficha
            rotulo="Por confirmar"
            valor={hoje.pendentes}
            tom={hoje.pendentes > 0 ? 'aviso' : 'neutro'}
          />
          <Ficha rotulo="Canceladas" valor={hoje.canceladas} />
          <Ficha rotulo="Faltas" valor={hoje.faltas} tom={hoje.faltas > 0 ? 'mau' : 'neutro'} />
        </div>

        {hoje.proxima ? (
          <p className="mt-3 text-(length:--text-sm) text-(--ink-muted)">
            Próxima às{' '}
            <strong className="font-medium text-(--ink)">
              {new Intl.DateTimeFormat('pt-PT', {
                timeZone: periodo.timezone,
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(hoje.proxima))}
            </strong>
            .
          </p>
        ) : (
          <p className="mt-3 text-(length:--text-sm) text-(--ink-muted)">
            Nada mais marcado para hoje.
          </p>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="font-medium">Período</h2>

          <div className="ml-auto flex flex-wrap gap-2">
            {unidades.length > 1 ? (
              <select
                defaultValue={unidadeId}
                onChange={(e) => {
                  window.location.href = `/app/${tenantSlug}/relatorios?dias=${dias}&unidade=${e.target.value}`;
                }}
                aria-label="Unidade"
                className="min-h-11 rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 text-(length:--text-sm)"
              >
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : null}

            {/* Ligações, não botões: cada período é um endereço partilhável, e
                o botão "voltar" do browser faz o que se espera. */}
            {PERIODOS.map((p) => (
              <a
                key={p.dias}
                href={`${ligacao}${p.dias}`}
                aria-current={dias === p.dias ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center rounded-(--radius-full) border px-4 text-(length:--text-sm)',
                  dias === p.dias
                    ? 'border-(--brand) bg-(--brand-soft) font-medium'
                    : 'border-(--line) bg-(--surface)',
                )}
              >
                {p.rotulo}
              </a>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Ficha rotulo="Marcações" valor={t.marcacoes} />
          <Ficha rotulo="Clientes" valor={t.clientes} detalhe={`${periodo.clientes.novos} novos`} />
          <Ficha rotulo="Faltas" valor={t.faltas} tom={t.faltas > 0 ? 'mau' : 'neutro'} />
          <Ficha
            rotulo="Receita estimada"
            valor={new Intl.NumberFormat('pt-PT', {
              style: 'currency',
              currency: t.moeda ?? 'EUR',
              maximumFractionDigits: 0,
            }).format(t.receitaEstimada)}
            detalhe="só marcações concluídas"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Medidor
            rotulo="Taxa de comparência"
            valor={compareceram}
            maximo={deviamTer}
          />
          <Medidor
            rotulo="Clientes recorrentes"
            valor={periodo.clientes.recorrentes}
            maximo={t.clientes}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Marcações por mês</h2>
        <Card className="px-5 py-5">
          <Barras dados={porMes} titulo="Marcações por mês" />
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-medium">Horas mais procuradas</h2>
          <Card className="px-5 py-5">
            <Barras dados={porHora} titulo="Marcações por hora do dia" altura={160} />
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-medium">Por serviço</h2>
          <Card className="px-5 py-5">
            <Barras
              dados={periodo.porServico.map((s) => ({
                rotulo: s.servico,
                valor: s.marcacoes,
              }))}
              titulo="Marcações por serviço"
              horizontal
            />
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-medium">Por profissional</h2>
          <Card className="px-5 py-5">
            <Barras
              dados={periodo.porProfissional.map((p) => ({
                rotulo: p.profissional,
                valor: p.marcacoes,
                detalhe: `${p.faltas} faltas`,
              }))}
              titulo="Marcações por profissional"
              horizontal
            />
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-medium">De onde vêm</h2>
          <Card className="px-5 py-5">
            <Barras
              dados={periodo.porOrigem.map((o) => ({
                rotulo: ORIGENS[o.origem] ?? o.origem,
                valor: o.marcacoes,
              }))}
              titulo="Marcações por origem"
              horizontal
            />
          </Card>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-medium">Exportar</h2>
        <Card className="px-5 py-4">
          <p className="max-w-prose text-pretty text-(length:--text-sm) text-(--ink-muted)">
            O CSV leva os mesmos agregados que vê acima — por mês, por serviço,
            por profissional, por hora e por origem. Não leva marcações
            individuais nem dados de clientes.
          </p>

          <a
            href={`/app/${tenantSlug}/relatorios/csv?unidade=${unidadeId}&dias=${dias}`}
            className="mt-3 inline-flex min-h-11 items-center rounded-(--radius-sm) border border-(--line-strong) px-4 text-(length:--text-sm) font-medium"
          >
            Descarregar CSV
          </a>
        </Card>
      </section>
    </div>
  );
}

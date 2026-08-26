import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { preparacao, type ChaveDePasso } from '@totalmobi/shared';
import { Card } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

import { PassoEquipa, PassoHorarios, PassoLigacoes, PassoServico, PassoUnidade } from './passos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Começar' };

/** Passos onde faz sentido acrescentar mais do que um antes de avançar. */
const REPETIVEIS: ChaveDePasso[] = ['servicos', 'equipa'];

/**
 * O assistente de primeira configuração.
 *
 * O PROBLEMA QUE RESOLVE
 *
 * Até aqui, quem pagava aterrava num painel com uma lista do que faltava e
 * tinha de descobrir sozinho por onde ir. Pior: o primeiro passo da lista —
 * criar a unidade — **não tinha interface nenhuma**. A página de unidades era
 * só de leitura, com uma nota a prometer a criação «no Milestone 6». As três
 * empresas de demonstração tinham recebido as suas por migração, e por isso o
 * buraco só apareceu quando nasceu a primeira empresa a sério.
 *
 * O ESTADO VIVE NA BASE, NÃO NA SESSÃO
 *
 * Não há passo guardado em lado nenhum. O passo atual é o primeiro que falta em
 * `preparacao()` — a mesma função que decide se a página pública abre. Isso dá
 * três coisas de graça: o assistente é retomável, nunca discorda do painel, e
 * não há forma de o «acabar» sem a página pública ficar mesmo a funcionar.
 *
 * Quem já está configurado é reencaminhado para o painel. Um assistente que se
 * deixa reabrir depois de terminado é uma forma de alguém desfazer sem querer o
 * que já fez.
 */
export default async function ComecarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ passo?: string }>;
}) {
  const { tenantSlug } = await params;
  const { passo: passoPedido } = await searchParams;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();
  if (!canManage(context)) redirect(`/app/${tenantSlug}`);

  const [unidades, servicos, equipa, ligacoes, horarios, horariosDaUnidade] = await Promise.all([
    context.client
      .from('locations')
      .select('id, name')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .order('sort_order'),
    context.client
      .from('services')
      .select('id, name')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .order('sort_order'),
    context.client
      .from('staff')
      .select('id, full_name, accepts_online_booking')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .order('sort_order'),
    context.client
      .from('staff_services')
      // As linhas, não a contagem: é preciso saber **quem** está ligado, para
      // descobrir quem não está. Uma contagem só responde «pelo menos um».
      .select('staff_id, service_id, staff!inner(tenant_id)')
      .eq('staff.tenant_id', context.tenantId)
      .eq('is_active', true),
    context.client
      .from('staff_working_hours')
      .select('id, staff!inner(tenant_id)', { count: 'exact', head: true })
      .eq('staff.tenant_id', context.tenantId),
    context.client
      .from('location_business_hours')
      .select('id, locations!inner(tenant_id)', { count: 'exact', head: true })
      .eq('locations.tenant_id', context.tenantId),
  ]);

  const listaDeUnidades = unidades.data ?? [];
  const listaDeServicos = servicos.data ?? [];
  const listaDaEquipa = equipa.data ?? [];

  /*
   * Quem aceita marcações e não executa nada.
   *
   * Só conta quem aceita marcação online: um rececionista na lista de equipa
   * não tem de estar ligado a serviço nenhum, e teria `accepts_online_booking`
   * a falso.
   */
  const comServico = new Set((ligacoes.data ?? []).map((l) => l.staff_id));

  const estado = preparacao({
    unidades: listaDeUnidades.length,
    servicos: listaDeServicos.length,
    profissionais: listaDaEquipa.length,
    ligacoes: (ligacoes.data ?? []).length,
    profissionaisSemServico: listaDaEquipa.filter(
      (p) => p.accepts_online_booking && !comServico.has(p.id),
    ).length,
    horarios: horarios.count ?? 0,
    horariosDaUnidade: horariosDaUnidade.count ?? 0,
  });

  if (estado.pronta) redirect(`/app/${tenantSlug}`);

  /*
   * O passo fica no endereço, e não só na base.
   *
   * Sem isto, criar **um** serviço marcava o passo como feito e a página saltava
   * para a equipa no mesmo instante. Quem estava a escrever o segundo serviço
   * via o formulário desaparecer debaixo dos dedos — e ficava com a ideia de
   * que só se pode ter um serviço, que é o contrário do que o produto faz.
   *
   * Os passos de serviços e de equipa são repetíveis: acrescenta-se um, e depois
   * outro, até dizer que chega. Por isso a página fixa-os no endereço e só
   * avança quando alguém carrega em «Continuar».
   *
   * A unidade e os horários não precisam disto — são um por empresa, e ficam
   * feitos à primeira.
   */
  const primeiroEmFalta = estado.emFalta[0];

  if (!passoPedido && primeiroEmFalta && REPETIVEIS.includes(primeiroEmFalta.chave)) {
    redirect(`/app/${tenantSlug}/comecar?passo=${primeiroEmFalta.chave}`);
  }

  /*
   * Um passo pedido só vale se os anteriores estiverem feitos. Sem esta guarda,
   * `?passo=horarios` numa empresa vazia mostrava um formulário que não tinha
   * unidade nem equipa para gravar.
   */
  const pedido = estado.passos.find((x) => x.chave === passoPedido);
  const anterioresFeitos =
    pedido !== undefined &&
    estado.passos.slice(0, estado.passos.indexOf(pedido)).every((x) => x.feito);

  const passo = anterioresFeitos ? pedido : primeiroEmFalta;
  const numero = passo ? estado.passos.indexOf(passo) + 1 : estado.feitos + 1;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <p className="text-(length:--text-sm) font-medium text-(--brand)">
        Passo {numero} de {estado.passos.length}
      </p>

      <h1 className="mt-2 text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
        {passo?.titulo}
      </h1>

      <p className="mt-2 max-w-prose text-pretty text-(--ink-muted)">
        {passo?.porque}
      </p>

      {/* Uma fila de pontos em vez de uma barra: são cinco passos, e cinco
          contam-se de relance sem precisar de percentagem. */}
      <ol className="mt-6 flex gap-1.5" aria-label={`Passo ${numero} de ${estado.passos.length}`}>
        {estado.passos.map((p) => (
          <li
            key={p.chave}
            aria-current={p.chave === passo?.chave ? 'step' : undefined}
            title={p.titulo}
            className={
              p.feito
                ? 'h-1.5 flex-1 rounded-(--radius-full) bg-(--brand)'
                : p.chave === passo?.chave
                  ? 'h-1.5 flex-1 rounded-(--radius-full) bg-(--brand)/40'
                  : 'h-1.5 flex-1 rounded-(--radius-full) bg-(--surface-sunken)'
            }
          />
        ))}
      </ol>

      <Card className="mt-8 px-6 py-6">
        {passo?.chave === 'unidades' ? (
          <PassoUnidade tenantId={context.tenantId} tenantSlug={tenantSlug} />
        ) : null}

        {passo?.chave === 'servicos' ? (
          <PassoServico
            tenantId={context.tenantId}
            tenantSlug={tenantSlug}
            jaCriados={listaDeServicos.map((x) => x.name)}
          />
        ) : null}

        {passo?.chave === 'equipa' ? (
          <PassoEquipa
            tenantId={context.tenantId}
            tenantSlug={tenantSlug}
            jaCriados={listaDaEquipa.map((x) => x.full_name)}
          />
        ) : null}

        {passo?.chave === 'ligacoes' ? (
          <PassoLigacoes
            tenantId={context.tenantId}
            tenantSlug={tenantSlug}
            equipa={listaDaEquipa}
            servicos={listaDeServicos}
            existentes={
              new Set((ligacoes.data ?? []).map((l) => `${l.staff_id}:${l.service_id}`))
            }
          />
        ) : null}

        {passo?.chave === 'horarios' && listaDeUnidades[0] ? (
          <PassoHorarios
            tenantId={context.tenantId}
            tenantSlug={tenantSlug}
            locationId={listaDeUnidades[0].id}
            quantos={listaDaEquipa.length}
          />
        ) : null}
      </Card>

      <p className="mt-6 text-(length:--text-sm) text-(--ink-subtle)">
        Pode sair e voltar quando quiser — o assistente continua onde ficou.{' '}
        <Link href={`/app/${tenantSlug}`} className="underline underline-offset-4">
          Ir para o painel
        </Link>
      </p>
    </main>
  );
}

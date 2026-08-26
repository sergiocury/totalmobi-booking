import Link from 'next/link';
import { notFound } from 'next/navigation';

import { preparacao } from '@totalmobi/shared';
import { Badge, Card, InteractiveCard, PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

/**
 * Resumo da empresa.
 *
 * O acesso já foi validado e registado no `layout.tsx` — esta página só precisa
 * de mostrar. Se `loadTenantPage` devolvesse `null` aqui, seria um bug: o
 * layout teria deixado passar algo que não devia.
 *
 * DUAS PÁGINAS DIFERENTES, CONSOANTE O ESTADO
 *
 * Uma empresa acabada de comprar não quer saber que tem 0 marcações. Quer saber
 * qual é o passo seguinte, e quer ver o endereço que acabou de comprar. Uma
 * empresa a funcionar quer o contrário: os números, e o link à mão para copiar.
 *
 * O que decide entre as duas é `preparacao()`, em `@totalmobi/shared` — a mesma
 * função que a página pública usa para saber se abre o formulário. Duas
 * definições de «pronta» divergiriam, e a divergência apareceria da pior
 * maneira: este painel a dizer que está tudo bem enquanto a página pública não
 * oferece hora nenhuma.
 */
export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const [servicos, equipa, unidades, ligacoes, horarios, horariosDaUnidade] = await Promise.all([
    context.client
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null),
    context.client
      .from('staff')
      .select('id, accepts_online_booking')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null),
    context.client
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null),
    // Nem `staff_services` nem `staff_working_hours` têm `tenant_id`: contam-se
    // por junção com `staff`. A RLS já as limita, mas um administrador da
    // plataforma vê mais do que uma empresa — e aí a junção é o que garante que
    // o número desta página é o desta empresa.
    context.client
      .from('staff_services')
      // As linhas, não a contagem: é preciso saber **quem** está ligado, para
      // descobrir quem não está. Uma contagem só responde «pelo menos um».
      .select('staff_id, staff!inner(tenant_id)')
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

  /*
   * Quem aceita marcações e não executa nada.
   *
   * Só conta quem aceita marcação online: um rececionista na lista de equipa
   * não tem de estar ligado a serviço nenhum, e teria `accepts_online_booking`
   * a falso.
   */
  const comServico = new Set((ligacoes.data ?? []).map((l) => l.staff_id));

  const estado = preparacao({
    unidades: unidades.count ?? 0,
    servicos: servicos.count ?? 0,
    profissionais: (equipa.data ?? []).length,
    ligacoes: (ligacoes.data ?? []).length,
    profissionaisSemServico: (equipa.data ?? []).filter(
      (p) => p.accepts_online_booking && !comServico.has(p.id),
    ).length,
    horarios: horarios.count ?? 0,
    horariosDaUnidade: horariosDaUnidade.count ?? 0,
  });

  const podeGerir = canManage(context);
  const endereco = `booking.totalmobi.pt/${tenantSlug}`;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title={context.displayName}
        description={
          context.role ? undefined : 'Está a ver esta empresa como administrador da plataforma.'
        }
        actions={context.role ? undefined : <Badge tone="warning">Plataforma</Badge>}
      />

      {/*
        O endereço público em primeiro lugar.
        É o que a pessoa comprou, é o que vai partilhar no Instagram, e é a
        primeira coisa que quer ver depois de pagar. Aparece sempre — pronta ou
        não — porque saber qual vai ser o endereço também é informação.
      */}
      <Card className="mb-8 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="font-medium">A sua página de marcações</h2>
              {estado.pronta ? (
                <Badge tone="success">No ar</Badge>
              ) : (
                <Badge tone="warning">Por abrir</Badge>
              )}
            </div>
            <p className="mt-1.5 truncate font-medium text-(--brand)">{endereco}</p>
          </div>

          <Link
            href={`/${tenantSlug}`}
            className="inline-flex min-h-10 shrink-0 items-center rounded-(--radius-full) border border-(--line-strong) px-4 text-(length:--text-sm) font-medium hover:bg-(--surface-sunken)"
          >
            Ver página
          </Link>
        </div>

        {!estado.pronta ? (
          <p className="mt-3 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
            O endereço já é seu, mas quem lá chegar ainda não consegue marcar. Faltam{' '}
            {estado.emFalta.length} {estado.emFalta.length === 1 ? 'passo' : 'passos'}.
          </p>
        ) : null}
      </Card>

      {!estado.pronta && podeGerir ? (
        <Card className="mb-8 px-6 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">Falta configurar</h2>
            <p className="text-(length:--text-sm) tabular-nums text-(--ink-subtle)">
              {estado.feitos} de {estado.passos.length}
            </p>
          </div>

          {/* Uma barra fina em vez de percentagem escrita: lê-se de relance e
              não obriga ninguém a fazer contas. */}
          <div
            role="progressbar"
            aria-valuenow={estado.feitos}
            aria-valuemin={0}
            aria-valuemax={estado.passos.length}
            aria-label="Progresso da configuração"
            className="mt-3 h-1.5 overflow-hidden rounded-(--radius-full) bg-(--surface-sunken)"
          >
            <div
              className="h-full rounded-(--radius-full) bg-(--brand) transition-[width] duration-(--duration-normal) ease-(--ease-out-soft)"
              style={{ width: `${(estado.feitos / estado.passos.length) * 100}%` }}
            />
          </div>

          {/*
            A lista mostra o caminho; este botão percorre-o. Sem ele, a pessoa
            que acabou de pagar tinha de escolher por onde começar — e o
            primeiro passo, criar a unidade, não tinha sequer interface própria.
          */}
          <Link
            href={`/app/${tenantSlug}/comecar`}
            className="mt-5 inline-flex min-h-11 items-center rounded-(--radius-full) bg-(--brand) px-5 font-medium text-(--brand-ink)"
          >
            {estado.feitos === 0 ? 'Configurar a minha agenda' : 'Continuar a configuração'}
          </Link>

          <ol className="mt-5 space-y-1">
            {estado.passos.map((passo) => (
              <li key={passo.chave}>
                {passo.feito ? (
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 shrink-0 text-(length:--text-sm) text-(--success)"
                    >
                      ✓
                    </span>
                    <span className="text-(length:--text-sm) text-(--ink-subtle) line-through">
                      {passo.titulo}
                    </span>
                  </div>
                ) : (
                  <Link
                    href={`/app/${tenantSlug}/${passo.caminho}`}
                    className="flex items-start gap-3 rounded-(--radius-md) px-3 py-2.5 hover:bg-(--surface-sunken)"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 rounded-(--radius-full) border border-(--line-strong)"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{passo.titulo} →</span>
                      <span className="mt-0.5 block text-(length:--text-sm) text-pretty text-(--ink-muted)">
                        {passo.porque}
                      </span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            href: `/app/${tenantSlug}/unidades`,
            label: 'Unidades',
            count: unidades.count ?? 0,
            texto: 'Onde se atende, com morada e fuso horário.',
          },
          {
            href: `/app/${tenantSlug}/servicos`,
            label: 'Serviços',
            count: servicos.count ?? 0,
            texto: 'O que se vende, quanto demora e quanto custa.',
          },
          {
            href: `/app/${tenantSlug}/equipa`,
            label: 'Equipa',
            count: equipa.count ?? 0,
            texto: 'Quem atende e o que cada um faz.',
          },
        ].map((passo) => (
          <InteractiveCard key={passo.href}>
            <Link href={passo.href} className="block px-5 py-5">
              <p className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight) tabular-nums">
                {passo.count}
              </p>
              <p className="mt-1 font-medium">{passo.label}</p>
              <p className="mt-1 text-(length:--text-sm) text-pretty text-(--ink-muted)">
                {passo.texto}
              </p>
            </Link>
          </InteractiveCard>
        ))}
      </div>

      {estado.pronta ? (
        <Card className="mt-8 px-6 py-5">
          <h2 className="font-medium">Agenda</h2>
          <p className="mt-1.5 max-w-prose text-pretty text-(--ink-muted)">
            As marcações que chegarem pela página pública aparecem na agenda.
          </p>
          <Link
            href={`/app/${tenantSlug}/agenda`}
            className="mt-4 inline-flex min-h-10 items-center rounded-(--radius-full) bg-(--brand) px-5 text-(length:--text-sm) font-medium text-(--brand-ink)"
          >
            Abrir a agenda
          </Link>
        </Card>
      ) : null}
    </main>
  );
}

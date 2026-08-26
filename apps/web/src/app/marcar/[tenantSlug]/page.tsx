import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { createAnonClient, getPublicTenantBySlug } from '@totalmobi/database';
import { podeMarcar } from '@totalmobi/shared';

import { resolveBranding } from '@/lib/branding';

import { Marcacao } from './marcacao';

/**
 * A página pública de marcação.
 *
 * É a superfície que justifica o produto: a Sofia entra pelo link que a clínica
 * lhe mandou, escolhe e sai — **sem criar conta, sem instalar nada, no
 * telemóvel, em menos de um minuto**.
 *
 * TRÊS DECISÕES QUE MOLDAM TUDO
 *
 * 1. **Não há calendário de mês.** Uma grelha de 31 quadradinhos num ecrã de
 *    375 px é a forma mais rápida de perder quem está a marcar. Há uma fita
 *    horizontal de dias, que é como se navega numa agenda a sério.
 *
 * 2. **"Qualquer profissional" está primeiro e vem escolhido.** A maioria das
 *    pessoas não tem preferência, e obrigá-las a escolher acrescenta um toque
 *    a toda a gente para servir uma minoria. Quem tem preferência escolhe.
 *
 * 3. **A marca do cliente é aplicada no servidor**, dentro do `<head>`. Se as
 *    variáveis fossem escritas por JavaScript depois da hidratação, o visitante
 *    via o azul da Totalmobi antes do verde da clínica — e numa página que
 *    tem de parecer da clínica, esse flash é o produto a denunciar-se.
 */

export const dynamic = 'force-dynamic';

/**
 * Os dados da página, uma vez por pedido.
 *
 * DUAS RAZÕES PARA O `cache()`, E A SEGUNDA É A CARA
 *
 * O Next chama `generateMetadata` **e** o componente no mesmo pedido, e ambos
 * precisam disto. Sem `cache()` são duas execuções completas — o dobro das
 * consultas, para produzir exatamente o mesmo resultado. O `cache()` do React
 * desduplica dentro do mesmo render, que é precisamente o âmbito certo: dois
 * visitantes não partilham nada, e o mesmo visitante não pergunta duas vezes.
 *
 * Medido a 2026-08-26 nesta página, com a empresa de 50 profissionais: mediana
 * de 555 ms na Vercel contra 206 ms da base. A diferença não era o SQL — era o
 * número de idas e voltas.
 *
 * UMA VAGA EM VEZ DE DUAS
 *
 * As cinco consultas abaixo só precisam do id da empresa, que sai da primeira.
 * Estavam partidas em duas vagas sequenciais sem razão nenhuma: a segunda não
 * usava nada da primeira. Cada vaga custa uma ida e volta ao servidor da base,
 * e numa página que é a mais visitada do produto isso paga-se em todas as
 * visitas.
 */
const carregar = cache(async (slug: string) => {
  const client = createAnonClient();
  const perfil = await getPublicTenantBySlug(client, slug);

  if (!perfil.ok) return null;

  const [
    { data: servicos },
    { data: equipa },
    { data: ligacoes },
    { data: horarios },
    { count: horariosDaUnidade },
  ] = await Promise.all([
    client
      .from('services')
      .select('id, name, description, duration_minutes, price, promo_price, currency, image_url')
      .eq('tenant_id', perfil.value.tenant.id)
      .eq('is_active', true)
      // Um serviço com `bookable_online = false` não aparece aqui. É a forma
      // de ter na casa serviços que só se marcam ao balcão.
      .eq('bookable_online', true)
      .order('sort_order'),
    client
      .from('staff')
      .select('id, full_name, job_title, photo_url')
      .eq('tenant_id', perfil.value.tenant.id)
      .eq('is_active', true)
      .eq('accepts_online_booking', true)
      .order('sort_order'),
    client
      .from('staff_services')
      .select('staff_id, service_id, staff!inner(tenant_id)')
      .eq('staff.tenant_id', perfil.value.tenant.id)
      .eq('is_active', true),
    client
      .from('staff_working_hours')
      .select('staff_id, staff!inner(tenant_id)')
      .eq('staff.tenant_id', perfil.value.tenant.id),
    client
      .from('location_business_hours')
      .select('id, locations!inner(tenant_id)', { count: 'exact', head: true })
      .eq('locations.tenant_id', perfil.value.tenant.id),
  ]);


  return {
    perfil: perfil.value,
    servicos: servicos ?? [],
    equipa: equipa ?? [],
    ligacoes: ligacoes ?? [],
    horarios: horarios ?? [],
    horariosDaUnidade: horariosDaUnidade ?? 0,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  const dados = await carregar(tenantSlug);

  if (!dados) return { title: 'Marcação' };

  const nome = dados.perfil.tenant.display_name;
  const titulo = dados.perfil.branding.public_headline ?? `Marcar em ${nome}`;
  const descricao =
    dados.perfil.branding.public_subheadline ??
    `Escolha o serviço, o dia e a hora. Marcação online em ${nome}.`;

  return {
    // A página pública **é** indexável, ao contrário do painel. É por aqui que
    // os clientes da clínica a encontram.
    title: { absolute: `${titulo} · ${nome}` },
    description: descricao,
    robots: { index: true, follow: true },
    openGraph: {
      title: titulo,
      description: descricao,
      type: 'website',
      siteName: nome,
      ...(dados.perfil.branding.hero_image_url
        ? { images: [dados.perfil.branding.hero_image_url] }
        : {}),
    },
  };
}

export default async function PaginaPublica({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const dados = await carregar(tenantSlug);

  // Tenant inexistente, suspenso ou arquivado dão todos o mesmo 404. A RLS já
  // os filtrou; distingui-los aqui diria a quem perguntasse quais existem.
  if (!dados) notFound();

  const { perfil, servicos, equipa, ligacoes, horarios, horariosDaUnidade } = dados;

  /*
   * A porta desta página.
   *
   * Era `servicos.length === 0 || !unidade`. Não chegava: uma clínica com
   * unidade e serviço mas sem ninguém que o execute, ou sem horários, passava
   * na porta, via o formulário aberto — e nunca recebia uma hora. Um formulário
   * que não devolve nada parece avariado; um aviso honesto parece por abrir, e
   * é a verdade.
   *
   * MAS NÃO É A MESMA PERGUNTA DO PAINEL
   *
   * Durante um dia esta porta usou `preparacao()`, a lista de configuração do
   * dono. O resultado foi uma clínica com cinco profissionais, quatro deles
   * prontos, a mostrar «Marcação online indisponível» a toda a gente — porque o
   * quinto não estava ligado a serviço nenhum.
   *
   * Uma tarefa por fazer do lado do dono não é razão para fechar a porta ao
   * cliente. `podeMarcar()` pergunta só se **alguém** consegue ser marcado; a
   * lista do dono continua a assinalar quem falta configurar.
   */
  // `equipa` já vem filtrada por `accepts_online_booking`, por isso aqui basta
  // ver quem não tem ligação nenhuma.
  const comServico = new Set(ligacoes.map((l) => l.staff_id));
  const comHorario = new Set(horarios.map((h) => h.staff_id));

  const aceitaMarcacoes = podeMarcar({
    unidades: perfil.locations.length,
    servicos: servicos.length,
    profissionais: equipa.length,
    ligacoes: ligacoes.length,
    profissionaisSemServico: equipa.filter((p) => !comServico.has(p.id)).length,
    profissionaisSemHorario: equipa.filter((p) => !comHorario.has(p.id)).length,
    horarios: horarios.length,
    horariosDaUnidade,
    profissionaisProntos: equipa.filter((p) => comServico.has(p.id) && comHorario.has(p.id))
      .length,
  });
  const branding = resolveBranding({
    primaryColor: perfil.branding.primary_color,
    secondaryColor: perfil.branding.secondary_color,
    backgroundColor: perfil.branding.background_color,
    textColor: perfil.branding.text_color,
    borderRadius: perfil.branding.border_radius,
  });

  const unidade = perfil.locations[0];

  return (
    <>
      {/* No servidor, antes da primeira pintura. Ver a nota no topo. */}
      <style dangerouslySetInnerHTML={{ __html: branding.css }} />

      <div className="min-h-dvh bg-(--surface-sunken)">
        <header className="border-b border-(--line) bg-(--surface)">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
            {perfil.branding.logo_url ? (
              // `img` e não `next/image`: o logótipo vem de um URL que o cliente
              // configura, e o otimizador do Next exigiria declarar cada domínio
              // possível no `next.config`. Num produto white-label não há lista
              // de domínios possíveis.
              <img
                src={perfil.branding.logo_url}
                alt=""
                className="h-9 w-auto"
                width={36}
                height={36}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate font-semibold">{perfil.tenant.display_name}</p>
              {unidade ? (
                <p className="truncate text-(length:--text-sm) text-(--ink-muted)">
                  {unidade.name}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 py-6 pb-24">
          {!aceitaMarcacoes || !unidade ? (
            <div className="rounded-(--radius-md) border border-(--line) bg-(--surface) px-5 py-8 text-center">
              <p className="font-medium">Marcação online indisponível</p>
              <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                Contacte {perfil.tenant.display_name} diretamente.
              </p>
            </div>
          ) : (
            <Marcacao
              locationId={unidade.id}
              timezone={unidade.timezone}
              maxAdvanceDays={perfil.policies.max_advance_days}
              headline={perfil.branding.public_headline}
              servicos={servicos.map((s) => ({
                id: s.id,
                nome: s.name,
                descricao: s.description,
                duracao: s.duration_minutes,
                preco: s.promo_price ?? s.price,
                moeda: s.currency,
              }))}
              equipa={equipa.map((p) => ({
                id: p.id,
                nome: p.full_name,
                cargo: p.job_title,
                foto: p.photo_url,
                servicos: ligacoes.filter((l) => l.staff_id === p.id).map((l) => l.service_id),
              }))}
            />
          )}
        </main>
      </div>
    </>
  );
}

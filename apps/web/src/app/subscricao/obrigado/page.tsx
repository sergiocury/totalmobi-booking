import type { Metadata } from 'next';
import Link from 'next/link';

import { createServiceClient } from '@totalmobi/database/server';

import { obterStripe } from '@/lib/stripe/cliente';

export const metadata: Metadata = {
  title: 'Obrigado',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Depois do pagamento.
 *
 * ESTA PÁGINA NÃO ATIVA NADA
 *
 * Chegar aqui não prova pagamento nenhum — qualquer pessoa consegue escrever
 * este endereço. O que a página faz é **perguntar ao Stripe** o que aconteceu
 * com a sessão, e depois olhar para a base para ver se o webhook já criou a
 * empresa.
 *
 * Se o webhook ainda não chegou, diz-se isso. É o caso normal durante alguns
 * segundos, e mentir sobre ele — mostrar "pronto!" antes de estar — seria
 * mandar a pessoa para um painel que ainda não existe.
 *
 * A verificação da sessão é por leitura, não por confiança: o identificador vem
 * do URL, mas o que se lê vem do Stripe.
 */
export default async function ObrigadoPage({
  searchParams,
}: {
  searchParams: Promise<{ sessao?: string }>;
}) {
  const { sessao } = await searchParams;

  if (!sessao) return <Aviso titulo="Não encontrámos esta sessão" />;

  const cliente = obterStripe();
  if ('erro' in cliente) return <Aviso titulo="Não foi possível confirmar o pagamento" />;

  let pago = false;
  let idDaSubscricao: string | null = null;

  try {
    /*
     * Expande-se a subscrição para chegar aos metadados do registo.
     *
     * Isto procurava a empresa **pelo email do pagador**, com `maybeSingle()`.
     * Funciona enquanto cada pessoa tiver uma empresa só, e deixa de funcionar
     * no dia em que alguém compra a segunda: `maybeSingle()` trata duas linhas
     * como erro e devolve nada.
     *
     * Foi o que aconteceu a 26/08. A empresa tinha sido criada em condições, o
     * webhook tinha corrido bem, e esta página dizia «estamos a preparar a sua
     * conta» indefinidamente — porque o mesmo email já tinha outra empresa.
     *
     * Procura-se pelo **identificador da subscrição**, que o webhook grava em
     * `tenant_subscriptions`. É o elo exato entre este pagamento e aquela
     * empresa. O slug dos metadados era o candidato óbvio e não serve: quando o
     * nome pedido já está ocupado, `slugLivre()` acrescenta um sufixo, e o slug
     * gravado deixa de ser o slug pedido.
     */
    const s = await cliente.ok.checkout.sessions.retrieve(sessao);

    pago = s.payment_status === 'paid' || s.status === 'complete';
    idDaSubscricao = typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null);
  } catch {
    return <Aviso titulo="Não encontrámos esta sessão" />;
  }

  if (!pago) {
    return (
      <Aviso
        titulo="O pagamento ainda não está confirmado"
        texto="Se acabou de pagar, aguarde um momento e recarregue esta página."
      />
    );
  }

  // O webhook já criou a empresa? É ele quem a cria, não esta página.
  const db = createServiceClient();
  const { data: ligacao } = idDaSubscricao
    ? await db
        .from('tenant_subscriptions')
        .select('tenants!inner(slug, display_name)')
        .eq('stripe_subscription_id', idDaSubscricao)
        .maybeSingle()
    : { data: null };

  const empresa = (ligacao?.tenants as unknown as { slug: string; display_name: string } | null) ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16 text-center">
      <span
        aria-hidden
        className="mx-auto flex size-14 items-center justify-center rounded-(--radius-full) bg-(--success-soft) text-(length:--text-2xl) text-(--success)"
      >
        ✓
      </span>

      <h1 className="mt-6 text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
        Pagamento confirmado
      </h1>

      {empresa ? (
        <>
          <p className="mt-3 text-pretty text-(--ink-muted)">
            A <strong className="font-medium text-(--ink)">{empresa.display_name}</strong> está
            criada. A sua página de marcações já tem endereço:
          </p>

          <p className="mx-auto mt-5 max-w-full truncate rounded-(--radius-full) border border-(--brand) bg-(--brand-soft) px-4 py-2 font-medium text-(--brand)">
            booking.totalmobi.pt/{empresa.slug}
          </p>

          <p className="mt-6 text-(length:--text-sm) text-(--ink-subtle)">
            Falta configurar os serviços, a equipa e os horários — sem isso a página não tem horas
            para oferecer.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`/app/${empresa.slug}/comecar`}
              className="inline-flex min-h-12 items-center rounded-(--radius-full) bg-(--brand) px-6 font-medium text-(--brand-ink)"
            >
              Configurar a minha agenda
            </Link>
            <Link
              href={`/${empresa.slug}`}
              className="inline-flex min-h-12 items-center rounded-(--radius-full) border border-(--line-strong) px-6 font-medium"
            >
              Ver a minha página
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-pretty text-(--ink-muted)">
            Estamos a preparar a sua conta. Costuma demorar poucos segundos.
          </p>
          <p className="mt-2 text-(length:--text-sm) text-(--ink-subtle)">
            Recarregue esta página daqui a instantes. Se demorar mais do que um minuto, escreva-nos
            para booking@totalmobi.pt — o pagamento está registado e não se perde.
          </p>
        </>
      )}
    </main>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-(length:--text-xl) font-semibold">{titulo}</h1>
      {texto ? <p className="mt-3 text-pretty text-(--ink-muted)">{texto}</p> : null}
      <p className="mt-6 text-(length:--text-sm) text-(--ink-subtle)">
        Se precisar de ajuda, escreva para booking@totalmobi.pt.
      </p>
      <Link href="/" className="mt-8 text-(length:--text-sm) underline underline-offset-4">
        ← Voltar
      </Link>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { PLANOS, planoPorCodigo } from '@totalmobi/shared';

import { LogoBooking } from '@/components/logo-booking';

import { FormularioDeRegisto } from './formulario';

export const metadata: Metadata = {
  title: 'Criar conta',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * O registo.
 *
 * QUATRO CAMPOS, E NEM UM A MAIS
 *
 * Nome, empresa, email e palavra-passe. Tudo o resto — segmento, morada,
 * horários, serviços — pergunta-se depois, no onboarding, a quem já pagou e já
 * está comprometido. Um formulário longo antes do pagamento é a forma mais
 * fiável de perder quem estava decidido.
 *
 * O endereço público aparece por baixo do nome da empresa, à medida que se
 * escreve. É a primeira coisa que a pessoa recebe e a que mais interessa ver
 * antes de pagar.
 */
export default async function RegistoPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string; periodo?: string }>;
}) {
  const filtros = await searchParams;

  const plano = planoPorCodigo(filtros.plano ?? '') ?? PLANOS.find((p) => p.recomendado)!;
  const periodo = filtros.periodo === 'year' ? 'year' : 'month';
  const preco = periodo === 'year' ? plano.precoAnual : plano.precoMensal;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" aria-label="Totalmobi Booking — início" className="mb-8 flex">
        <LogoBooking altura={28} />
      </Link>

      <h1 className="text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
        Criar a sua conta
      </h1>

      <p className="mt-2 text-pretty text-(--ink-muted)">
        Plano <strong className="font-medium text-(--ink)">{plano.nome}</strong> ·{' '}
        <span className="tabular-nums">
          {preco} € {periodo === 'year' ? 'por ano' : 'por mês'}
        </span>
        {periodo === 'year' ? ' · dois meses grátis' : ''}
      </p>

      <FormularioDeRegisto plano={plano.codigo} periodo={periodo} />

      <p className="mt-6 text-(length:--text-sm) text-(--ink-subtle)">
        Já tem conta?{' '}
        <Link href="/login" className="text-(--brand) underline underline-offset-4">
          Entrar
        </Link>
      </p>

      <p className="mt-8 border-t border-(--line) pt-5 text-(length:--text-sm) text-(--ink-subtle)">
        A empresa só é criada depois do pagamento ficar confirmado. Se desistir a meio, não fica
        nada por trás — a não ser a sua conta, para poder voltar.
      </p>
    </main>
  );
}

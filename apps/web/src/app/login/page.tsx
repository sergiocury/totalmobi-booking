import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/context';

import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user) {
    redirect(params.proximo ?? '/app');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-9">
        <p className="mb-2 text-(length:--text-xs) font-medium tracking-[0.14em] text-(--ink-subtle) uppercase">
          Totalmobi
        </p>
        <h1 className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight)">
          Booking
        </h1>
        <p className="mt-3 text-pretty text-(--ink-muted)">Entre para gerir a sua agenda.</p>
      </div>

      {params.erro ? (
        <p
          role="alert"
          className="mb-6 rounded-(--radius-md) border border-(--danger) bg-(--danger-soft) px-4 py-3 text-(length:--text-sm)"
        >
          {params.erro === 'link_invalido'
            ? 'Esse link expirou ou já foi usado. Peça outro abaixo.'
            : 'Não foi possível concluir a entrada. Tente novamente.'}
        </p>
      ) : null}

      <LoginForm next={params.proximo} />
    </main>
  );
}

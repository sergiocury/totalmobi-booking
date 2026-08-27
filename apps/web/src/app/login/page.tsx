import { redirect } from 'next/navigation';

import { LogoBooking } from '@/components/logo-booking';

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
        {/*
          O logótipo **dentro** do `h1`, e não ao lado dele.

          Aqui a marca era a sobrescrita "TOTALMOBI" mais um `h1` a dizer
          "Booking". Trocar isso por uma imagem solta deixava a página sem
          cabeçalho nenhum. O texto alternativo da imagem passa a ser o texto do
          `h1`, que é o que um leitor de ecrã anuncia — e a sobrescrita sai,
          porque o nome já está dentro do logótipo.
        */}
        <h1>
          <LogoBooking className="h-9 w-auto sm:h-12" prioridade />
        </h1>
        <p className="mt-4 text-pretty text-(--ink-muted)">Entre para gerir a sua agenda.</p>
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

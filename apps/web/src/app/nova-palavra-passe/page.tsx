import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSessionClient } from '@/lib/supabase/server';

import { FormularioDeNovaPalavraPasse } from './formulario';

export const metadata: Metadata = {
  title: 'Definir palavra-passe',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Definir uma palavra-passe nova.
 *
 * O QUE FALTAVA
 *
 * O `/auth/confirm` já tratava o tipo `recovery`: validava o link, criava a
 * sessão — e redirecionava para `/app`. Não havia página nenhuma onde a
 * palavra-passe se pudesse mudar.
 *
 * O efeito para quem se esquecia da palavra-passe: pedia a recuperação, recebia
 * o email, carregava no link, e aterrava no painel sem nunca lhe ter sido
 * perguntado nada. Ficava dentro da conta e sem forma de a voltar a abrir da
 * próxima vez — porque a palavra-passe continuava a ser a que não sabia.
 *
 * PORQUE É QUE ISTO NÃO PEDE A PALAVRA-PASSE ANTIGA
 *
 * Quem chega aqui vem de um link enviado para o email da conta, e esse email é
 * a prova. Pedir a antiga tornaria a recuperação inútil: quem a soubesse não
 * precisava de recuperar nada.
 *
 * A sessão é a guarda. Sem ela não se chega a este formulário, e o `updateUser`
 * do lado do servidor só muda a palavra-passe de quem está autenticado.
 */
export default async function NovaPalavraPassePage() {
  const client = await getSessionClient();
  const { data } = await client.auth.getUser();

  // Sem sessão não há o que mudar. Acontece a quem abre este endereço à mão, ou
  // a quem volta cá dias depois com o link já usado.
  if (!data.user) redirect('/login?erro=link_invalido');

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
        Definir uma palavra-passe
      </h1>

      <p className="mt-2 text-pretty text-(--ink-muted)">
        Para a conta <strong className="font-medium text-(--ink)">{data.user.email}</strong>.
      </p>

      <FormularioDeNovaPalavraPasse />

      <p className="mt-8 text-(length:--text-sm) text-(--ink-subtle)">
        Não quer mudar agora?{' '}
        <Link href="/app" className="underline underline-offset-4">
          Ir para o painel
        </Link>{' '}
        — já está com sessão iniciada.
      </p>
    </main>
  );
}

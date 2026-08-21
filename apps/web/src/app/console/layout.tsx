import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * Guarda da consola da plataforma.
 *
 * **404 e não 403.** Um 403 confirmaria a quem sondasse o URL que existe aqui
 * uma consola de administração — e é a porta mais valiosa de todo o sistema.
 * Para quem não é administrador da Totalmobi, o `/console` simplesmente não
 * existe.
 *
 * Sem sessão é diferente: aí o redirecionamento para o login não revela nada,
 * porque acontece em qualquer rota protegida.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();

  if (!context) {
    redirect('/login?proximo=/console');
  }

  if (!context.isPlatformAdmin) {
    notFound();
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-(--line) bg-(--surface-sunken)">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/console"
            className="text-(length:--text-sm) font-semibold tracking-(--tracking-tight)"
          >
            Consola Totalmobi
          </Link>
          <div className="flex items-center gap-4 text-(length:--text-sm) text-(--ink-muted)">
            <span className="hidden sm:inline">{context.user.email}</span>
            <Link href="/app" className="hover:text-(--ink) hover:underline">
              Sair da consola
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

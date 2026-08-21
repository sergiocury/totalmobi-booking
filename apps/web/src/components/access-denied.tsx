import Link from 'next/link';

import { Button } from '@totalmobi/ui';

/**
 * Página de acesso negado.
 *
 * Explica em vez de acusar. Quem chega aqui raramente é um atacante — é
 * alguém que clicou num link antigo, ou que foi removido da equipa e não
 * soube. Uma parede a dizer "Acesso negado" faz essa pessoa ligar para o
 * suporte; uma frase que diga o que fazer a seguir, não.
 *
 * **Não recebe o nome da empresa de propósito.** Este mesmo ecrã aparece quer
 * o slug exista e não seja do utilizador, quer não exista de todo. Mostrar o
 * nome transformaria a página num verificador de empresas: bastaria tentar
 * slugs até um deles responder com um nome. O servidor sabe a diferença e
 * regista-a no `audit_logs`; o ecrã não.
 */
export function AccessDenied() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight) text-balance">
        Não tem acesso a esta agenda
      </h1>

      <p className="mt-4 text-pretty text-(--ink-muted)">
        A sua conta não está associada a esta empresa. Se devia ter acesso, peça a quem administra
        a agenda que o convide — o convite chega por email.
      </p>

      <div className="mt-9 flex flex-col items-center gap-3">
        <Button asChild size="lg">
          <Link href="/app">Ver as suas empresas</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Entrar com outra conta</Link>
        </Button>
      </div>
    </main>
  );
}

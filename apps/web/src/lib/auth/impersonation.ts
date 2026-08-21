import 'server-only';

import { cookies } from 'next/headers';

/**
 * "Entrar como empresa" — e o que isso deliberadamente **não** é.
 *
 * O QUE FAZ
 *
 * Marca, num cookie, que o administrador da plataforma está a ver o painel de
 * uma empresa concreta. Serve para o banner permanente e para o audit log saber
 * o contexto. Nada mais.
 *
 * O QUE NÃO FAZ, E PORQUÊ
 *
 * **Não assume a identidade de nenhuma pessoa.** O JWT continua a ser o do
 * administrador; a sessão continua a ser a dele; tudo o que ele faça fica
 * registado com o nome dele. Um sistema que deixasse a Totalmobi agir *como* a
 * Dra. Ana criaria uma classe de problema desproporcionada ao ganho:
 *
 * · quem cancelou aquela consulta — a Dra. Ana ou alguém a fazer-se passar por
 *   ela? O audit log deixaria de ser prova de nada;
 * · no RGPD, aceder a dados de saúde sob a identidade de um profissional é
 *   coisa muito diferente de aceder como fornecedor de software;
 * · e o cliente perde a capacidade de auditar a própria conta.
 *
 * O acesso já existe sem isto: `is_platform_admin()` abre as políticas de RLS
 * a todos os tenants. Este cookie só decide **o que se vê no ecrã** — não o que
 * se pode ler. É por isso que não é uma fronteira de segurança e não tem de o
 * ser: se alguém o forjar, não ganha permissão nenhuma que já não tivesse.
 */

const COOKIE = 'totalmobi-viewing-tenant';

export interface ViewingContext {
  tenantId: string;
  startedAt: string;
}

export async function getViewingTenant(): Promise<ViewingContext | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ViewingContext>;
    if (typeof parsed.tenantId !== 'string' || typeof parsed.startedAt !== 'string') return null;
    return { tenantId: parsed.tenantId, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export async function startViewing(tenantId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, JSON.stringify({ tenantId, startedAt: new Date().toISOString() }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    // Quatro horas. Um administrador que se esqueça de sair não fica com um
    // banner colado ao painel para sempre, e o registo de fim acaba por sair.
    maxAge: 60 * 60 * 4,
  });
}

export async function stopViewing(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

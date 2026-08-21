import Link from 'next/link';

import { loadTenantPage } from '@/lib/tenant-context';
import { getViewingTenant } from '@/lib/auth/impersonation';
import { AccessDenied } from '@/components/access-denied';
import { ViewingBanner } from '@/components/viewing-banner';
import { TenantNav } from '@/components/tenant-nav';

export const dynamic = 'force-dynamic';

/**
 * Casca do painel de uma empresa.
 *
 * A validação de acesso vive aqui e não em cada página: repetida à mão, mais
 * cedo ou mais tarde uma página nova esquece-se do registo da recusa ou da
 * verificação do estado suspenso. Como `loadTenantPage` é `cache()`, as páginas
 * podem voltar a chamá-la sem custo — a leitura acontece uma vez por pedido.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) {
    return <AccessDenied />;
  }

  if (context.status === 'suspended' || context.status === 'cancelled') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-(length:--text-2xl) leading-(--leading-snug) font-semibold tracking-(--tracking-tight)">
          {context.displayName}
        </h1>
        <p className="mt-4 text-pretty text-(--ink-muted)">
          Esta conta está suspensa. A agenda e a página pública ficam indisponíveis até ser
          reativada.
        </p>
        <p className="mt-6 text-(length:--text-sm) text-(--ink-muted)">
          Para reativar, fale connosco em{' '}
          <a href="mailto:suporte@totalmobi.pt" className="underline underline-offset-4">
            suporte@totalmobi.pt
          </a>
          .
        </p>
        <Link
          href="/app"
          className="mt-9 text-(length:--text-sm) underline underline-offset-4"
        >
          ← As suas empresas
        </Link>
      </main>
    );
  }

  const viewing = await getViewingTenant();

  return (
    <div className="min-h-dvh">
      {viewing?.tenantId === context.tenantId ? (
        <ViewingBanner tenantName={context.displayName} />
      ) : null}

      <TenantNav
        tenantSlug={context.tenantSlug}
        displayName={context.displayName}
        role={context.role}
      />

      {children}
    </div>
  );
}

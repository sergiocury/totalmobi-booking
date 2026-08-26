import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LogoBooking } from '@/components/logo-booking';

import { Badge, Button, EmptyState, InteractiveCard, PageHeader } from '@totalmobi/ui';

import { getAuthContext } from '@/lib/auth/context';
import { signOut } from '@/app/login/actions';

export const metadata = { title: 'As suas empresas' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  tenant_admin: 'Administrador',
  manager: 'Gestor',
  staff: 'Profissional',
};

const STATUS_LABEL: Record<string, string> = {
  suspended: 'Suspensa',
  past_due: 'Pagamento em atraso',
  trial: 'Período de teste',
  cancelled: 'Cancelada',
};

/**
 * Seletor de empresa.
 *
 * Os tenants vêm por RLS com a sessão do próprio utilizador — não há um
 * `.eq('tenant_id', …)` em lado nenhum. Se a lista vier errada, o problema está
 * nas políticas, e é lá que se corrige.
 */
export default async function AppHomePage() {
  const context = await getAuthContext();

  if (!context) {
    redirect('/login?proximo=/app');
  }

  const tenantIds = context.memberships.map((m) => m.tenantId);

  const { data: tenants } = tenantIds.length
    ? await context.client
        .from('tenants')
        .select('id, slug, display_name, status')
        .in('id', tenantIds)
        .order('display_name')
    : { data: [] };

  const byId = new Map((tenants ?? []).map((t) => [t.id, t]));

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      {/* O logótipo acima do cabeçalho, e não dentro dele.

          O `eyebrow` do `PageHeader` é uma etiqueta em maiúsculas com
          espaçamento largo — desenhada para texto curto de contexto, não para
          uma imagem. Meter lá o logótipo desalinhava-o com o título e obrigava
          a alargar o tipo do componente para servir um caso só. */}
      <LogoBooking altura={26} className="mb-6" />

      <PageHeader
        title="As suas empresas"
        description={context.user.email}
        actions={
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sair
            </Button>
          </form>
        }
      />

      {context.isPlatformAdmin ? (
        <InteractiveCard className="mb-4">
          <Link href="/console" className="block px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Consola Totalmobi</p>
                <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                  Gerir todas as empresas da plataforma.
                </p>
              </div>
              <Badge tone="brand">Plataforma</Badge>
            </div>
          </Link>
        </InteractiveCard>
      ) : null}

      {context.memberships.length === 0 ? (
        <EmptyState
          title="Ainda não pertence a nenhuma empresa"
          description="Quando alguém o convidar para gerir uma agenda, ela aparece aqui. Se estava à espera de um convite, verifique o email."
        />
      ) : (
        <ul className="space-y-3">
          {context.memberships.map((membership) => {
            const tenant = byId.get(membership.tenantId);
            if (!tenant) return null;

            const statusLabel = STATUS_LABEL[tenant.status];

            return (
              <li key={membership.tenantId}>
                <InteractiveCard>
                  <Link href={`/app/${tenant.slug}`} className="block px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.display_name}</p>
                        <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                          {ROLE_LABEL[membership.role] ?? membership.role}
                        </p>
                      </div>
                      {statusLabel ? (
                        <Badge tone={tenant.status === 'trial' ? 'brand' : 'warning'}>
                          {statusLabel}
                        </Badge>
                      ) : null}
                    </div>
                  </Link>
                </InteractiveCard>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

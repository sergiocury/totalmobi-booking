import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/context';
import { acceptInvite } from '@/lib/invites';
import { writeAuditLog } from '@/lib/audit';
import { AccessDenied } from '@/components/access-denied';

export const metadata = { title: 'Aceitar convite' };
export const dynamic = 'force-dynamic';

/**
 * Aceitação do convite.
 *
 * Chega-se aqui já com sessão: o link do email passa primeiro por
 * `/auth/confirm`, que troca o `token_hash` por cookies. Se alguém abrir este
 * URL sem sessão, é mandado para o login e volta.
 *
 * O `acceptInvite` compara o dono do convite com quem está autenticado. É o que
 * impede um convite reencaminhado de dar acesso a outra pessoa — o caso mais
 * provável de todos, porque as pessoas reencaminham emails sem pensar.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?proximo=/convite/${membershipId}`);
  }

  const result = await acceptInvite(membershipId, user.id);

  if (!result.ok) {
    await writeAuditLog({
      action: 'invite.accept_denied',
      entity: 'membership',
      entityId: membershipId,
      actorType: 'user',
      actorUserId: user.id,
      newValues: { reason: result.error.code },
    });

    return <AccessDenied />;
  }

  await writeAuditLog({
    action: 'invite.accepted',
    entity: 'membership',
    entityId: membershipId,
    actorType: 'user',
    actorUserId: user.id,
  });

  if (result.value.tenantSlug) {
    redirect(`/app/${result.value.tenantSlug}`);
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Convite aceite</h1>
      <p className="mt-4 text-(--color-ink-muted)">Já tem acesso à agenda.</p>
      <Link
        href="/app"
        className="mt-8 inline-block rounded-full bg-(--color-brand) px-5 py-2.5 text-sm font-medium text-white"
      >
        Ver as suas empresas
      </Link>
    </main>
  );
}

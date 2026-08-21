import 'server-only';

import {
  DomainErrorCode,
  domainError,
  err,
  ok,
  type DomainError,
  type MemberRole,
  type Result,
} from '@totalmobi/shared';
import { ConsoleEmailProvider, renderInviteEmail, type EmailProvider } from '@totalmobi/notifications';
import { createServiceClient } from '@totalmobi/database/server';

/**
 * Convites para gerir a agenda de uma empresa.
 *
 * O FLUXO, E PORQUE É ASSIM
 *
 *   1. `admin.generateLink({ type: 'invite' | 'magiclink' })`
 *      → devolve `hashed_token` e **não envia email nenhum**. É isto que faz o
 *        limite de 2 emails/hora do SMTP interno do Supabase ser irrelevante.
 *   2. Construímos `/auth/confirm?token_hash=…`
 *      → o `verifyOtp()` do lado do servidor estabelece a sessão em cookies.
 *        Se apontássemos ao `/auth/v1/verify` do Supabase, os tokens vinham no
 *        fragmento do URL e o servidor nunca os veria.
 *   3. Enviamos pelo `EmailProvider` com a marca do tenant.
 *   4. A linha em `memberships` fica com `accepted_at = null` até a pessoa
 *      entrar. Enquanto for null, `current_tenant_ids()` ignora-a — ou seja,
 *      **um convite pendente não dá acesso nenhum**.
 */

const ROLE_LABEL: Record<MemberRole, string> = {
  tenant_admin: 'administrador',
  manager: 'gestor',
  staff: 'profissional',
};

const INVITE_TTL_HOURS = 24;

function getEmailProvider(): EmailProvider {
  // O Resend entra no Milestone 12. Até lá, a consola — que imprime o link e
  // não finge que enviou.
  return new ConsoleEmailProvider();
}

export interface InviteInput {
  tenantId: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  inviterName?: string | undefined;
}

export interface InviteResult {
  membershipId: string;
  /** Só preenchido pelo provider de desenvolvimento; em produção fica indefinido. */
  acceptUrl?: string;
  alreadyMember: boolean;
}

export async function inviteMember(
  input: InviteInput,
): Promise<Result<InviteResult, DomainError>> {
  const service = createServiceClient();

  const [{ data: tenant }, { data: branding }] = await Promise.all([
    service.from('tenants').select('id, display_name, status').eq('id', input.tenantId).maybeSingle(),
    service.from('tenant_branding').select('primary_color, logo_url').eq('tenant_id', input.tenantId).maybeSingle(),
  ]);

  if (!tenant) {
    return err(domainError(DomainErrorCode.TENANT_NOT_FOUND, `Tenant ${input.tenantId} não existe`));
  }

  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    return err(
      domainError(DomainErrorCode.TENANT_SUSPENDED, 'Não é possível convidar numa conta suspensa'),
    );
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';

  // `generateLink` cria a conta se ela não existir — o que é o que se quer num
  // convite — e devolve o token sem enviar email.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: { redirectTo: `${appUrl}/auth/confirm` },
  });

  // Se a conta já existe, o tipo `invite` recusa. Nesse caso o convite é um
  // magic link normal: a pessoa já tem conta, só lhe falta o acesso a esta
  // empresa.
  let hashedToken = link?.properties?.hashed_token;
  let userId = link?.user?.id;
  let otpType: 'invite' | 'magiclink' = 'invite';

  if (linkError || !hashedToken) {
    const retry = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: input.email,
      options: { redirectTo: `${appUrl}/auth/confirm` },
    });

    if (retry.error || !retry.data.properties?.hashed_token) {
      return err(
        domainError(
          DomainErrorCode.PROVIDER_ERROR,
          `Não foi possível gerar o convite: ${retry.error?.message ?? linkError?.message ?? 'erro desconhecido'}`,
        ),
      );
    }

    hashedToken = retry.data.properties.hashed_token;
    userId = retry.data.user?.id;
    otpType = 'magiclink';
  }

  if (!userId) {
    return err(domainError(DomainErrorCode.PROVIDER_ERROR, 'Convite sem utilizador associado'));
  }

  const existing = await service
    .from('memberships')
    .select('id, accepted_at')
    .eq('tenant_id', input.tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  let membershipId: string;

  if (existing.data) {
    // Reconvidar quem já é membro não duplica nada nem revoga o acesso atual:
    // só reenvia o link. Duplicar rebentaria no `unique (tenant_id, user_id)`.
    membershipId = existing.data.id;
  } else {
    const inserted = await service
      .from('memberships')
      .insert({
        tenant_id: input.tenantId,
        user_id: userId,
        role: input.role,
        invited_by: input.invitedBy,
        // accepted_at fica null: o convite ainda não dá acesso.
      })
      .select('id')
      .single();

    if (inserted.error || !inserted.data) {
      return err(
        domainError(DomainErrorCode.UNEXPECTED, `Falhou a criação do membership: ${inserted.error?.message}`),
      );
    }

    membershipId = inserted.data.id;
  }

  const acceptUrl =
    `${appUrl}/auth/confirm?token_hash=${hashedToken}` +
    `&type=${otpType}&proximo=${encodeURIComponent(`/convite/${membershipId}`)}`;

  const rendered = renderInviteEmail({
    tenantName: tenant.display_name,
    inviterName: input.inviterName,
    roleLabel: ROLE_LABEL[input.role],
    acceptUrl,
    primaryColor: branding?.primary_color ?? '#0B5FFF',
    logoUrl: branding?.logo_url ?? undefined,
    expiresInHours: INVITE_TTL_HOURS,
  });

  const provider = getEmailProvider();
  const sent = await provider.send({
    to: { email: input.email },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromName: tenant.display_name,
    tags: { tipo: 'convite', tenant: tenant.id },
  });

  if (!sent.ok) return sent;

  return ok({
    membershipId,
    alreadyMember: Boolean(existing.data?.accepted_at),
    ...(provider.name === 'console' ? { acceptUrl } : {}),
  });
}

/**
 * Marca o convite como aceite.
 *
 * É este `accepted_at` que liga o acesso: até aqui, `current_tenant_ids()`
 * ignora a linha e o utilizador não vê rigorosamente nada da empresa.
 */
export async function acceptInvite(
  membershipId: string,
  userId: string,
): Promise<Result<{ tenantSlug: string }, DomainError>> {
  const service = createServiceClient();

  const { data: membership } = await service
    .from('memberships')
    .select('id, tenant_id, user_id, accepted_at')
    .eq('id', membershipId)
    .maybeSingle();

  if (!membership) {
    return err(domainError(DomainErrorCode.TOKEN_INVALID, 'Convite não encontrado'));
  }

  // O convite é de outra pessoa. Acontece quando alguém reencaminha o email —
  // e é exatamente o caso que não pode funcionar.
  if (membership.user_id !== userId) {
    return err(
      domainError(DomainErrorCode.NOT_AUTHORIZED, 'Este convite pertence a outra conta', {
        details: { membershipId },
      }),
    );
  }

  if (!membership.accepted_at) {
    await service
      .from('memberships')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', membershipId);
  }

  const { data: tenant } = await service
    .from('tenants')
    .select('slug')
    .eq('id', membership.tenant_id)
    .single();

  return ok({ tenantSlug: tenant?.slug ?? '' });
}

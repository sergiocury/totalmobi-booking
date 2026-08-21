'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceClient } from '@totalmobi/database/server';
import { cifrar, lerChave, MetaCloudApiProvider } from '@totalmobi/whatsapp';

import { requirePlatformAdmin, requireRole } from '@/lib/auth/context';
import { writeAuditLog } from '@/lib/audit';

/**
 * Ligar uma conta de WhatsApp.
 *
 * ⚠️ **Este caminho é interino e está restrito a administradores da
 * plataforma.**
 *
 * O caminho correto para um cliente é o Embedded Signup da Meta: o cliente
 * autentica-se na janela dela, e nós recebemos um código que trocamos por um
 * token **do lado do servidor**, sem nunca ver as credenciais dele. É isso que
 * o critério de aceite do M13 exige, e é isso que ainda não existe — porque
 * exige uma aplicação Meta aprovada e verificação de negócio, que são passos do
 * Sérgio, não meus.
 *
 * Até lá, colar um token à mão serve para ligar o **nosso** número de
 * demonstração. Não serve para clientes: obrigá-los a partilhar um token é
 * exatamente o que o critério proíbe.
 *
 * Por isso o `requirePlatformAdmin`. Não é excesso de zelo — é impedir que este
 * atalho se torne o procedimento normal por inércia.
 */

export interface EstadoIntegracao {
  ok?: boolean;
  erro?: string;
  aviso?: string;
}

const ligacaoSchema = z.object({
  wabaId: z.string().min(5),
  phoneNumberId: z.string().min(5),
  accessToken: z.string().min(20),
});

function chaveDeCifra() {
  const base64 = process.env.WHATSAPP_TOKEN_KEY;
  const id = process.env.WHATSAPP_TOKEN_KEY_ID ?? 'k1';

  if (!base64) {
    throw new Error('WHATSAPP_TOKEN_KEY em falta: sem ela o token ficaria em texto simples.');
  }

  return lerChave(base64, id);
}

export async function ligarConta(
  tenantId: string,
  tenantSlug: string,
  entrada: unknown,
): Promise<EstadoIntegracao> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) {
    return {
      erro:
        'Ligar por token só está disponível para a Totalmobi. Para a sua empresa, o processo é pela Meta e não exige partilhar credenciais.',
    };
  }

  const parsed = ligacaoSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  // Confirmar que o token funciona **antes** de o guardar. Guardar primeiro e
  // descobrir depois deixaria a empresa marcada como ligada e a falhar todos os
  // envios em silêncio.
  const provider = new MetaCloudApiProvider(parsed.data.phoneNumberId, parsed.data.accessToken);
  const teste = await provider.send({
    tipo: 'texto',
    para: '+10000000000',
    corpo: 'teste de credenciais',
  });

  // Um erro de **número inválido** significa que as credenciais funcionaram —
  // chegámos à API e ela recusou o destinatário, não a autenticação. Um erro de
  // autenticação é outra coisa.
  const credenciaisMas =
    !teste.ok && /401|403|invalid.*token|authenticat/i.test(teste.error.message);

  if (credenciaisMas) {
    return { erro: 'A Meta recusou estas credenciais. Verifique o token e o número.' };
  }

  const client = createServiceClient();
  const chave = chaveDeCifra();

  const { error } = await client.from('tenant_whatsapp_accounts').upsert(
    {
      tenant_id: tenantId,
      waba_id: parsed.data.wabaId,
      phone_number_id: parsed.data.phoneNumberId,
      // O token nunca entra na base em texto simples.
      access_token_encrypted: cifrar(parsed.data.accessToken, chave).toString('base64'),
      token_key_id: chave.id,
      status: 'connected',
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'tenant_id' },
  );

  if (error) return { erro: `Não foi possível guardar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'whatsapp.connected',
    entity: 'integration',
    entityId: parsed.data.phoneNumberId,
    actorType: 'user',
    actorUserId: admin.value.user.id,
    // O token **nunca** vai para o audit log. Nem mascarado: um log é para
    // durar, e um segredo parcial num registo permanente é um segredo a menos.
    newValues: { wabaId: parsed.data.wabaId, phoneNumberId: parsed.data.phoneNumberId },
  });

  revalidatePath(`/app/${tenantSlug}/integracoes/whatsapp`);
  return { ok: true };
}

export async function desligarConta(
  tenantId: string,
  tenantSlug: string,
): Promise<EstadoIntegracao> {
  const guard = await requireRole(tenantId, 'manager');
  if (!guard.ok) return { erro: 'Sem permissão.' };

  const client = createServiceClient();

  // Apagar a linha, não só marcar como desligada: o token deixa de existir.
  // Uma conta "desligada" que ainda guarda a credencial é uma credencial
  // esquecida à espera de uma fuga.
  const { error } = await client
    .from('tenant_whatsapp_accounts')
    .delete()
    .eq('tenant_id', tenantId);

  if (error) return { erro: `Não foi possível desligar: ${error.message}` };

  await writeAuditLog({
    tenantId,
    action: 'whatsapp.disconnected',
    entity: 'integration',
    entityId: tenantId,
    actorType: 'user',
    actorUserId: guard.value.user.id,
  });

  revalidatePath(`/app/${tenantSlug}/integracoes/whatsapp`);
  return { ok: true };
}

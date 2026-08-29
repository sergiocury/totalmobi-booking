'use server';

import { redirect } from 'next/navigation';

import { getSessionClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

export interface EstadoDaPalavraPasse {
  erro?: string;
}

/**
 * Grava a palavra-passe nova.
 *
 * A guarda é a sessão, e não um campo escondido: `updateUser` só muda a
 * palavra-passe de quem está autenticado, e a autenticação veio do link enviado
 * para o email da conta.
 *
 * O mínimo de oito caracteres é o do Supabase. Não se impõem maiúsculas nem
 * símbolos — produzem palavras-passe piores, escritas num papel ao lado do
 * teclado. É a mesma decisão que já está no registo.
 */
export async function definirPalavraPasse(
  _anterior: EstadoDaPalavraPasse,
  formData: FormData,
): Promise<EstadoDaPalavraPasse> {
  const nova = String(formData.get('palavraPasse') ?? '');
  const repetida = String(formData.get('repetida') ?? '');

  if (nova.length < 8) return { erro: 'A palavra-passe precisa de pelo menos 8 caracteres.' };

  // Duas caixas, e comparadas aqui. Um erro de escrita numa palavra-passe que
  // não se vê é a forma mais fácil de ficar de fora outra vez.
  if (nova !== repetida) return { erro: 'As duas palavras-passe não são iguais.' };

  const client = await getSessionClient();
  const { data: sessao } = await client.auth.getUser();

  if (!sessao.user) return { erro: 'A sessão expirou. Peça um link novo.' };

  const { error } = await client.auth.updateUser({ password: nova });

  if (error) {
    // A mensagem do Supabase é útil aqui — diz, por exemplo, que a palavra-passe
    // é a mesma de antes.
    return { erro: error.message };
  }

  await writeAuditLog({
    action: 'auth.password_changed',
    entity: 'user',
    entityId: sessao.user.id,
    actorType: 'user',
    actorUserId: sessao.user.id,
  });

  redirect('/app');
}

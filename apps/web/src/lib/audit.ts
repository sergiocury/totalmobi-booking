import 'server-only';

import { headers } from 'next/headers';

import { createServiceClient } from '@totalmobi/database/server';
import type { Json } from '@totalmobi/database';

/**
 * Escrita no registo de auditoria.
 *
 * Usa `service_role` porque `booking.audit_logs` não tem política de INSERT
 * para papel nenhum — o log tem de conseguir registar mesmo o pedido que foi
 * recusado, e um pedido recusado é, por definição, de quem não tem permissões.
 *
 * Duas regras que este módulo impõe:
 *
 * 1. **Nunca falha o pedido do utilizador.** Se a auditoria não conseguir
 *    escrever, regista-se no `console.error` e a operação continua. Um log
 *    indisponível não pode impedir alguém de cancelar uma consulta.
 * 2. **Nunca guarda dados pessoais além do `actor_label`.** Nomes, telefones e
 *    conteúdo de mensagens ficam de fora — ver SECURITY.md, secção 17.
 */

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  tenantId?: string;
  actorType: 'user' | 'customer' | 'system' | 'bot' | 'platform_admin';
  actorUserId?: string;
  actorLabel?: string;
  // `Record<string, unknown>` e não só `Json`: quem chama constrói objetos a
  // partir de patches parciais, e obrigar a um cast em cada sítio só espalhava
  // ruído. A serialização para jsonb acontece no cliente do Supabase.
  oldValues?: Json | Record<string, unknown>;
  newValues?: Json | Record<string, unknown>;
  source?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() ?? null;

    const client = createServiceClient();

    await client.from('audit_logs').insert({
      tenant_id: entry.tenantId ?? null,
      actor_type: entry.actorType,
      actor_user_id: entry.actorUserId ?? null,
      actor_label: entry.actorLabel ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      old_values: (entry.oldValues ?? null) as Json,
      new_values: (entry.newValues ?? null) as Json,
      source: entry.source ?? 'admin',
      ip,
      user_agent: headerList.get('user-agent'),
      request_id: headerList.get('x-request-id'),
    });
  } catch (error) {
    // Ver a regra 1 acima.
    console.error('[audit] falhou a escrita do registo', {
      action: entry.action,
      entity: entry.entity,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

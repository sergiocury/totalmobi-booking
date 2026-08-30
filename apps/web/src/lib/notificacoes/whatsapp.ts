import 'server-only';

import type { BookingClient } from '@totalmobi/database';
import {
  comporTextoDaNotificacao,
  decifrarTokenGuardado,
  janelaAberta,
  MetaCloudApiProvider,
  waIdParaE164,
  e164ParaWaId,
  type DadosDaNotificacao,
} from '@totalmobi/whatsapp';

/**
 * As notificações que saem por WhatsApp.
 *
 * O QUE FALTAVA
 *
 * A fila criava os jobs e o trabalhador tinha, escrito à letra:
 *
 *   if (job.channel !== 'email') continue;
 *
 * Um job de WhatsApp era reclamado, ignorado, e ficava `pending` para sempre —
 * com `attempts` a subir e `error` a `null`. Nem enviado, nem falhado: preso.
 *
 * O assistente prometia "Vai receber a confirmação por aqui" e não havia nada
 * do outro lado da promessa.
 *
 * A JANELA DE 24 HORAS DECIDE TUDO
 *
 * Fora dela a Meta só aceita templates previamente aprovados, e não temos
 * nenhum. Isso não é um detalhe de implementação: significa que a confirmação
 * (que sai logo a seguir à conversa) passa, e o lembrete da véspera **não**.
 *
 * Quando a janela está fechada o job falha com essa razão escrita. Falhar
 * visível é melhor do que ficar preso: um lembrete que nunca sai e ninguém vê é
 * a mesma coisa que não ter lembretes, mas com a ilusão de os ter.
 */

export type ResultadoDoEnvio =
  | { readonly ok: true; readonly providerMessageId: string }
  | { readonly ok: false; readonly erro: string };

/**
 * A conta de WhatsApp da empresa, se estiver ligada.
 *
 * Sem conta não há envio possível — e é um erro de configuração, não uma falha
 * passageira, por isso vale a pena dizê-lo por palavras.
 */
async function contaDaEmpresa(client: BookingClient, tenantId: string) {
  const { data } = await client
    .from('tenant_whatsapp_accounts')
    .select('phone_number_id, access_token_encrypted, token_key_id, status')
    .eq('tenant_id', tenantId)
    .maybeSingle<{
      phone_number_id: string;
      access_token_encrypted: string;
      token_key_id: string;
      status: string;
    }>();

  return data ?? null;
}

/**
 * Quando é que esta pessoa nos escreveu pela última vez.
 *
 * É o que abre a janela — e só a mensagem **dela** a abre. Sem conversa
 * nenhuma, a janela está fechada: nunca nos escreveu.
 */
async function ultimaEntrada(
  client: BookingClient,
  tenantId: string,
  telefone: string,
): Promise<Date | null> {
  const { data } = await client
    .from('conversations')
    .select('last_inbound_at')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .eq('external_id', e164ParaWaId(telefone))
    .order('last_inbound_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ last_inbound_at: string | null }>();

  return data?.last_inbound_at ? new Date(data.last_inbound_at) : null;
}

export async function enviarNotificacaoWhatsApp(
  client: BookingClient,
  tenantId: string,
  dados: DadosDaNotificacao,
  agora: Date,
): Promise<ResultadoDoEnvio> {
  if (!dados.para) return { ok: false, erro: 'cliente sem telemóvel' };

  const chaveBase64 = process.env['WHATSAPP_TOKEN_KEY'];
  if (!chaveBase64) return { ok: false, erro: 'WHATSAPP_TOKEN_KEY em falta' };

  const conta = await contaDaEmpresa(client, tenantId);
  if (!conta || conta.status !== 'connected') {
    return { ok: false, erro: 'empresa sem WhatsApp ligado' };
  }

  const aberta = janelaAberta(await ultimaEntrada(client, tenantId, dados.para), agora);
  if (!aberta) {
    /*
     * Fora da janela só sai template aprovado, e não temos nenhum.
     *
     * Falha com a razão escrita em vez de ficar preso: é assim que se vê, na
     * fila, quantos lembretes não estão a sair — que é a informação que decide
     * se vale a pena submeter um template à Meta.
     */
    return { ok: false, erro: 'fora da janela de 24h e sem template aprovado' };
  }

  const texto = comporTextoDaNotificacao(dados);
  if (!texto) return { ok: false, erro: 'faltam dados para compor a mensagem' };

  let token: string;
  try {
    token = decifrarTokenGuardado(conta.access_token_encrypted, conta.token_key_id, chaveBase64);
  } catch (causa) {
    return { ok: false, erro: `token ilegível: ${String(causa).slice(0, 120)}` };
  }

  const provider = new MetaCloudApiProvider(conta.phone_number_id, token);
  const enviado = await provider.send({
    tipo: 'texto',
    para: waIdParaE164(e164ParaWaId(dados.para)),
    corpo: texto,
    // O link de gestão é o ponto da mensagem; vale a pena a pré-visualização.
    previewUrl: true,
  });

  return enviado.ok
    ? { ok: true, providerMessageId: enviado.value.providerMessageId }
    : { ok: false, erro: enviado.error.message };
}

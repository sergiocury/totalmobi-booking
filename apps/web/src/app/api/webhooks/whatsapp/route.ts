import 'server-only';

import { createServiceClient } from '@totalmobi/database/server';

import { responderNoWhatsApp } from '@/lib/whatsapp/conversa';
import {
  assinaturaValida,
  idDoEvento,
  interpretarEvento,
  responderDesafio,
} from '@totalmobi/whatsapp';

/**
 * O webhook do WhatsApp.
 *
 * Uma rota pública que a Meta chama sem sessão — e que por isso tem de assumir
 * que quem lhe bate à porta pode ser qualquer pessoa.
 *
 * A ORDEM DAS OPERAÇÕES É A SEGURANÇA
 *
 *   1. ler o corpo **em bruto**
 *   2. verificar a assinatura
 *   3. só depois interpretar
 *
 * Interpretar antes de verificar seria processar JSON de um desconhecido. E ler
 * o corpo com `request.json()` destruiria os bytes originais — o HMAC é sobre
 * eles, não sobre o objeto que resulta.
 *
 * RESPONDER 200 DEPRESSA
 *
 * A Meta considera falha tudo o que demore, e ao fim de várias falhas desativa
 * a subscrição — o cliente fica sem WhatsApp e ninguém percebe porquê. Por isso
 * o trabalho é: guardar o evento e responder. O processamento a sério é do M14.
 */

export const dynamic = 'force-dynamic';

/**
 * O desafio de verificação.
 *
 * A Meta chama isto uma vez, quando se configura o webhook no painel dela.
 * Devolve-se o `hub.challenge` em texto simples — não em JSON, que é o erro
 * que faz a configuração falhar com uma mensagem pouco esclarecedora.
 */
export function GET(request: Request): Response {
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!esperado) {
    return new Response('WHATSAPP_VERIFY_TOKEN não configurado', { status: 503 });
  }

  const url = new URL(request.url);
  const resposta = responderDesafio(
    {
      modo: url.searchParams.get('hub.mode'),
      token: url.searchParams.get('hub.verify_token'),
      desafio: url.searchParams.get('hub.challenge'),
    },
    esperado,
  );

  if (resposta === null) {
    // 403 seco. Explicar o que falhou ajudaria mais quem está a sondar do que
    // quem está a configurar.
    return new Response('forbidden', { status: 403 });
  }

  return new Response(resposta, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return Response.json({ erro: 'não configurado' }, { status: 503 });
  }

  // Passo 1: os bytes, antes de tudo.
  const corpoEmBruto = await request.text();

  // Passo 2: a assinatura.
  const valida = assinaturaValida(
    corpoEmBruto,
    request.headers.get('x-hub-signature-256'),
    appSecret,
  );

  if (!valida) {
    // Nada é guardado, nada é processado. Um evento com assinatura inválida não
    // é um evento — é ruído de alguém que descobriu o URL.
    return Response.json({ erro: 'assinatura inválida' }, { status: 401 });
  }

  // Passo 3: agora sim.
  let payload: unknown;
  try {
    payload = JSON.parse(corpoEmBruto);
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 });
  }

  const evento = interpretarEvento(payload);

  if (evento.mensagens.length === 0 && evento.estados.length === 0) {
    // A Meta manda eventos que não nos dizem respeito. Responder 200 evita que
    // ela os considere falhados e comece a repetir.
    return Response.json({ ignorado: true });
  }

  const client = createServiceClient();

  // De que empresa é isto? O `phone_number_id` é a chave.
  const numero = evento.phoneNumberIds[0];
  const { data: tenantId } = numero
    ? await client.rpc('tenant_by_phone_number_id', { p_phone_number_id: numero })
    : { data: null };

  // **Um número que não é nosso não deixa cá o conteúdo das mensagens.**
  //
  // Uma app da Meta pode partilhar a WABA com outra do mesmo portefólio, e
  // nesse caso chegam aqui mensagens destinadas a outro produto. Guardar o
  // corpo delas seria gravar conversas de clientes de terceiros numa base de
  // dados que não é a deles.
  //
  // Guarda-se o rasto — que chegou, de que número, quantas mensagens — porque
  // sem isso não se percebe uma configuração mal feita. O conteúdo, não.
  const corpo = tenantId
    ? (payload as never)
    : ({
        ignorado: 'phone_number_id desconhecido',
        phoneNumberId: numero ?? null,
        mensagens: evento.mensagens.length,
        estados: evento.estados.length,
      } as never);

  const { data: novo } = await client.rpc('record_webhook_event', {
    p_provider: 'meta_whatsapp',
    p_event_id: idDoEvento(evento),
    p_payload: corpo,
    p_signature_valid: true,
    ...(tenantId ? { p_tenant: tenantId } : {}),
  });

  // `false` = já tinha sido registado. É um reenvio da Meta, e a resposta certa
  // continua a ser 200: dizer erro faria com que ela repetisse ainda mais.
  if (!novo) {
    return Response.json({ duplicado: true });
  }

  /*
   * Responder.
   *
   * Até aqui o webhook registava o evento e ficava-se por isso — o produto
   * vendia marcação por WhatsApp e ninguém conseguia marcar por WhatsApp.
   *
   * A resposta é depois do registo, e nunca antes: se o envio falhar, o evento
   * já está guardado e sabe-se que chegou. Ao contrário, uma falha a meio
   * deixaria a Meta a reenviar uma mensagem que já tinha sido respondida.
   *
   * Os erros de um turno não sobem: uma pessoa que não recebeu resposta é um
   * problema, mas devolver 500 à Meta faz com que ela reenvie a mesma mensagem
   * e o cliente receba a resposta em duplicado. Ficam no resultado, para o
   * diagnóstico, e a Meta leva 200.
   */
  const turnos: { de: string; respondeu: boolean; motivo?: string | undefined }[] = [];

  if (tenantId) {
    for (const mensagem of evento.mensagens) {
      try {
        const r = await responderNoWhatsApp(client, tenantId as string, mensagem);
        turnos.push({ de: mensagem.waId, respondeu: r.respondeu, motivo: r.motivo });
      } catch (causa) {
        console.error('[whatsapp] falha a responder', causa);
        turnos.push({ de: mensagem.waId, respondeu: false, motivo: 'erro interno' });
      }
    }
  }

  return Response.json({
    registado: true,
    mensagens: evento.mensagens.length,
    estados: evento.estados.length,
    tenantReconhecido: Boolean(tenantId),
    turnos,
  });
}

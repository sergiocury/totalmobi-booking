import 'server-only';

import {
  extrair,
  frasearProcura,
  proximoTurno,
  type ContextoDaConversa,
  type Estado,
} from '@totalmobi/conversation';
import { createBooking, type BookingClient } from '@totalmobi/database';
import type { Json } from '@totalmobi/database';
import {
  decifrar,
  lerChave,
  escolherFormato,
  MetaCloudApiProvider,
  waIdParaE164,
  type MensagemRecebida,
} from '@totalmobi/whatsapp';

import { procurarHoras } from '@/lib/marcacoes/procurar-horas';

/**
 * O turno de conversa no WhatsApp.
 *
 * O QUE FALTAVA, E O QUE JÁ CÁ ESTAVA
 *
 * Estava tudo construído menos isto. A máquina de estados existia e era pura; o
 * `MetaCloudApiProvider` existia e sabia falar com a Cloud API; as tabelas
 * `conversations` e `conversation_messages` existiam com `current_state`,
 * `context` e `bot_paused_until`. O webhook recebia a mensagem, registava o
 * evento e **parava**.
 *
 * Ou seja: o produto vendia marcação por WhatsApp e ninguém conseguia marcar
 * por WhatsApp. Este ficheiro é a costura entre peças que já existiam.
 *
 * É O MESMO CÓDIGO QUE O SIMULADOR CORRE
 *
 * O simulador do painel já fazia este ciclo — carregar catálogo, extrair,
 * `proximoTurno`, cumprir a necessidade. A diferença é o transporte e duas
 * coisas que o simulador não faz de propósito: **guardar a conversa** e
 * **criar a marcação**. Simular não pode mexer na agenda real.
 *
 * TRÊS REGRAS QUE NÃO SE NEGOCEIAM
 *
 * 1. **O bot cala-se quando um humano assume.** `bot_paused_until` no futuro e
 *    não sai daqui uma única mensagem. Um bot a responder por cima de uma
 *    pessoa é a pior experiência que este produto pode dar.
 *
 * 2. **As horas nunca são inventadas.** Vêm do motor de disponibilidade, contra
 *    dados reais, e o `frasearSlots` só as transforma em texto. Um assistente
 *    que sugere uma hora que não existe destrói a confiança de uma vez.
 *
 * 3. **A resposta é sempre gravada.** Entrada e saída ficam em
 *    `conversation_messages`. Sem isso, uma queixa de cliente não tem como ser
 *    verificada, e a caixa de entrada do painel mostra metade da conversa.
 */

export interface ResultadoDoTurno {
  respondeu: boolean;
  estado?: Estado;
  motivo?: string;
}

/** O que o tenant precisa de ter configurado para o bot poder falar. */
export interface ContaWhatsApp {
  phone_number_id: string;
  access_token_encrypted: string;
  token_key_id: string;
}

/** O que leva o texto lá fora. Injetável para se poder exercitar o ciclo
 *  inteiro contra a base real sem mandar mensagens a ninguém. */
export type Transporte = (
  conta: ContaWhatsApp,
  para: string,
  texto: string,
  opcoes: string[] | undefined,
) => Promise<{
  ok: boolean;
  providerMessageId?: string | undefined;
  erro?: string | undefined;
}>;

export async function responderNoWhatsApp(
  client: BookingClient,
  tenantId: string,
  mensagem: MensagemRecebida,
  transporte: Transporte = enviar,
): Promise<ResultadoDoTurno> {
  // Só texto. Áudio, imagens e localizações chegam ao webhook e ficam
  // registadas, mas o bot não finge que as percebeu — responder "não percebi" a
  // uma fotografia é melhor do que responder como se fosse texto vazio.
  if (mensagem.tipo !== 'text' || !mensagem.texto?.trim()) {
    return { respondeu: false, motivo: 'mensagem não é texto' };
  }

  const { data: conta } = await client
    .from('tenant_whatsapp_accounts')
    .select('phone_number_id, access_token_encrypted, token_key_id')
    .eq('tenant_id', tenantId)
    .maybeSingle<ContaWhatsApp>();

  if (!conta?.access_token_encrypted) {
    return { respondeu: false, motivo: 'empresa sem WhatsApp ligado' };
  }

  const conversa = await obterConversa(client, tenantId, mensagem);
  if (!conversa) return { respondeu: false, motivo: 'não foi possível abrir a conversa' };

  // Regra 1. Um humano assumiu: o bot não fala por cima.
  if (conversa.bot_paused_until && new Date(conversa.bot_paused_until) > new Date()) {
    await gravarMensagem(client, conversa.id, 'inbound', mensagem.texto, mensagem);
    return { respondeu: false, motivo: 'bot em pausa — humano a atender' };
  }

  await gravarMensagem(client, conversa.id, 'inbound', mensagem.texto, mensagem);

  /*
   * O telefone entra no contexto sem ser pedido.
   *
   * Neste canal o numero **e** o remetente. Perguntar "qual e o seu telefone?"
   * a quem esta a escrever-nos do proprio telefone e a pergunta mais absurda
   * que este produto podia fazer, e a maquina de estados nao a faz — so espera
   * o campo preenchido. Preenche-se aqui, que e onde se sabe.
   *
   * Nao se sobrepoe a um numero ja no contexto: alguem pode estar a marcar para
   * outra pessoa e ter dito outro numero.
   */
  const conversaComTelefone: Conversa = {
    ...conversa,
    context: {
      ...(conversa.context ?? {}),
      telefone: conversa.context?.telefone ?? waIdParaE164(mensagem.waId),
    },
  };

  const turno = await decidir(client, tenantId, conversaComTelefone, mensagem.texto);
  if (!turno) return { respondeu: false, motivo: 'empresa sem catálogo utilizável' };

  const enviado = await transporte(conta, waIdParaE164(mensagem.waId), turno.texto, turno.opcoes);

  await client
    .from('conversations')
    .update({
      current_state: turno.estado,
      // O contexto é um objeto nosso e a coluna é `jsonb`. O cast atravessa
      // `unknown` porque as duas formas não se sobrepõem — é serialização, não
      // conversão de tipos, tal como no webhook do Stripe.
      context: turno.contexto as unknown as Json,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversa.id);

  await gravarMensagem(client, conversa.id, 'outbound', turno.texto, null, enviado);

  return {
    respondeu: enviado.ok,
    estado: turno.estado,
    ...(enviado.erro ? { motivo: enviado.erro } : {}),
  };
}

// ── A conversa ───────────────────────────────────────────────────────────────

interface Conversa {
  id: string;
  current_state: Estado;
  context: ContextoDaConversa;
  bot_paused_until: string | null;
}

/**
 * A conversa desta pessoa com esta empresa.
 *
 * Uma por par (empresa, número) — e não uma por mensagem. É o que permite que
 * alguém responda "sim" três horas depois e o bot ainda saiba do que se fala.
 */
async function obterConversa(
  client: BookingClient,
  tenantId: string,
  mensagem: MensagemRecebida,
): Promise<Conversa | null> {
  const agora = new Date().toISOString();

  const { data: existente } = await client
    .from('conversations')
    .select('id, current_state, context, bot_paused_until')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .eq('external_id', mensagem.waId)
    .maybeSingle<Conversa>();

  if (existente) {
    // `last_inbound_at` é o que abre a janela de 24 horas, e só a mensagem de
    // entrada a renova. Ver a nota em `packages/whatsapp/src/provider.ts`.
    await client
      .from('conversations')
      .update({ last_inbound_at: agora, status: 'open', updated_at: agora })
      .eq('id', existente.id);
    return existente;
  }

  const { data: nova } = await client
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      channel: 'whatsapp',
      external_id: mensagem.waId,
      current_state: 'NEW',
      context: {},
      last_inbound_at: agora,
    })
    .select('id, current_state, context, bot_paused_until')
    .single<Conversa>();

  return nova ?? null;
}

async function gravarMensagem(
  client: BookingClient,
  conversationId: string,
  direction: 'inbound' | 'outbound',
  texto: string,
  entrada: MensagemRecebida | null,
  saida?: {
    ok: boolean;
    providerMessageId?: string | undefined;
    erro?: string | undefined;
  },
): Promise<void> {
  await client.from('conversation_messages').insert({
    conversation_id: conversationId,
    direction,
    type: 'text',
    text: texto,
    provider_message_id: entrada?.providerMessageId ?? saida?.providerMessageId ?? null,
    status: direction === 'inbound' ? 'received' : saida?.ok ? 'sent' : 'failed',
    ...(direction === 'outbound' && saida?.ok ? { sent_at: new Date().toISOString() } : {}),
    ...(saida?.erro ? { error: saida.erro, failed_at: new Date().toISOString() } : {}),
  });
}

// ── A decisão ────────────────────────────────────────────────────────────────

interface Turno {
  estado: Estado;
  contexto: ContextoDaConversa;
  texto: string;
  opcoes?: string[] | undefined;
}

async function decidir(
  client: BookingClient,
  tenantId: string,
  conversa: Conversa,
  mensagem: string,
): Promise<Turno | null> {
  const [{ data: empresa }, { data: servicos }, { data: equipa }, { data: unidades }] =
    await Promise.all([
      client.from('tenants').select('display_name').eq('id', tenantId).maybeSingle(),
      client
        .from('services')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('bookable_online', true),
      client.from('staff').select('id, full_name').eq('tenant_id', tenantId).eq('is_active', true),
      client
        .from('locations')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .order('is_default', { ascending: false })
        .limit(1),
    ]);

  const unidade = unidades?.[0];
  if (!unidade) return null;

  const catalogo = {
    servicos: (servicos ?? []).map((s) => s.name),
    profissionais: (equipa ?? []).map((p) => p.full_name),
  };

  const agora = new Date();
  const intencao = extrair(mensagem, catalogo, agora);

  const turno = proximoTurno({
    estado: conversa.current_state,
    contexto: conversa.context ?? {},
    mensagem,
    catalogo,
    agora,
    intencao,
    nomeDaEmpresa: empresa?.display_name ?? 'a clínica',
  });

  let { texto, contexto } = turno;
  let opcoes = turno.opcoes;

  // Quem a pessoa pediu. O extrator já resolveu o nome contra o catálogo.
  const profissional = (equipa ?? []).find((p) => p.full_name === contexto.profissional) ?? null;

  if (turno.necessidade.tipo === 'procurar_slots') {
    const escolhido = (servicos ?? []).find((s) => s.name === contexto.servico);

    if (escolhido) {
      const hoje = agora.toISOString().slice(0, 10);
      const encontrado = await procurarHoras(client, {
        locationId: unidade.id,
        serviceId: escolhido.id,
        staffId: profissional?.id ?? null,
        data: contexto.data ?? hoje,
        preferencia: contexto,
        agora,
      });

      const frase = frasearProcura(encontrado, contexto.servico ?? 'o serviço', contexto, hoje);

      texto = frase.texto;
      opcoes = frase.opcoes;

      // O dia segue para o contexto: a procura pode ter avançado, e sem isto a
      // marcação sairia no dia pedido em vez do dia que a pessoa viu.
      contexto = {
        ...contexto,
        slotsOferecidos: encontrado.horas,
        ...(encontrado.data ? { data: encontrado.data } : {}),
      };
    }
  }

  if (turno.necessidade.tipo === 'criar_marcacao') {
    const criada = await marcar(
      client,
      unidade.id,
      servicos ?? [],
      contexto,
      profissional?.id ?? null,
    );
    texto = criada.texto;
    opcoes = undefined;
    if (!criada.ok) {
      // Falhar a marcação **não** avança o estado: a pessoa continua no mesmo
      // ponto e pode escolher outra hora. Dar por marcado o que não foi seria a
      // pior mentira que este produto podia contar.
      return { estado: 'SELECTING_SLOT', contexto, texto, opcoes };
    }
  }

  return { estado: turno.estado, contexto, texto, opcoes };
}

/**
 * Cria a marcação a sério.
 *
 * A hora vem de `slotEscolhido`, que só pode ser uma das que **nós** oferecemos
 * — o `proximoTurno` recusa qualquer outra. Mesmo assim a criação passa pela
 * função atómica, que revalida contra a constraint de exclusão: entre oferecer
 * a hora e confirmá-la passam segundos, e nesses segundos alguém pode ter
 * marcado pela página pública.
 */
async function marcar(
  client: BookingClient,
  locationId: string,
  servicos: { id: string; name: string }[],
  contexto: ContextoDaConversa,
  staffId: string | null,
): Promise<{ ok: boolean; texto: string }> {
  const servico = servicos.find((s) => s.name === contexto.servico);

  if (!servico || !contexto.slotEscolhido || !contexto.telefone) {
    return {
      ok: false,
      texto: 'Faltou-me alguma coisa para marcar. Podemos recomeçar?',
    };
  }

  const resultado = await createBooking(client, {
    locationId,
    serviceId: servico.id,
    startAt: new Date(contexto.slotEscolhido),
    customer: {
      firstName: contexto.nome?.trim() || 'Cliente',
      phone: contexto.telefone,
    },
    source: 'whatsapp',
    // Quem foi pedido. Sem isto a função escolhe o primeiro livre — e quem
    // pediu uma pessoa em concreto acabaria com outra.
    ...(staffId ? { staffId } : {}),
  });

  if (!resultado.ok) {
    if (resultado.error.code === 'SLOT_TAKEN') {
      return {
        ok: false,
        texto: 'Essa hora acabou de ser ocupada. Quer que veja outras horas nesse dia?',
      };
    }
    return {
      ok: false,
      texto: 'Não consegui concluir a marcação. Quer tentar outra hora?',
    };
  }

  return {
    ok: true,
    texto: 'Está marcado. Vai receber a confirmação por aqui.',
  };
}

/**
 * O token cifrado, seja qual for a forma como foi guardado.
 *
 * O QUE ESTA MESMO NA COLUNA
 *
 * `access_token_encrypted` e `bytea`, e o PostgREST devolve `bytea` como uma
 * barra invertida seguida de `x` e do hexadecimal - nunca base64. Mas o lado
 * que escreve faz `cifrar(...).toString('base64')` e entrega essa **string** ao
 * insert, e o Postgres guarda os caracteres do base64 como bytes.
 *
 * Resultado: o conteudo esta codificado duas vezes. Ve-se a olho - os primeiros
 * bytes lidos sao `482b545341`, que em ASCII da `H+TSA`, letras de base64 e nao
 * um cabecalho de dados cifrados.
 *
 * PORQUE E QUE SE TENTAM AS DUAS
 *
 * A cifra e autenticada (GCM). Uma tentativa errada nao devolve lixo - falha,
 * com a etiqueta de autenticacao a recusar. Isso torna a propria decifra num
 * discriminador fiavel, em vez de se adivinhar o formato por heuristica.
 *
 * A ordem comeca pelo formato correto, para que o dia em que a escrita for
 * corrigida isto continue certo sem se lhe tocar.
 */
function decifrarGuardado(guardado: string, keyId: string, chaveBase64: string): string {
  const chave = lerChave(chaveBase64, keyId);

  // O prefixo com que o Postgres devolve `bytea`: uma barra invertida e um `x`.
  const PREFIXO_HEX = String.raw`\x`;

  const bytes = guardado.startsWith(PREFIXO_HEX)
    ? Buffer.from(guardado.slice(PREFIXO_HEX.length), 'hex')
    : Buffer.from(guardado, 'base64');

  try {
    // O formato certo: os bytes da coluna sao os dados cifrados.
    return decifrar(bytes, chave);
  } catch {
    // O formato herdado: os bytes da coluna sao o texto base64 dos dados.
    return decifrar(Buffer.from(bytes.toString('utf8'), 'base64'), chave);
  }
}

// ── O envio ──────────────────────────────────────────────────────────────────

/**
 * As opções vão como texto, não como botões.
 *
 * A Cloud API tem mensagens interativas, e um dia valerão a pena. Hoje seriam
 * mais um formato a manter e a testar sem número real para o provar — e uma
 * lista escrita funciona em qualquer cliente de WhatsApp, incluindo os que não
 * renderizam botões.
 */
async function enviar(
  conta: ContaWhatsApp,
  para: string,
  texto: string,
  opcoes: string[] | undefined,
): Promise<{
  ok: boolean;
  providerMessageId?: string | undefined;
  erro?: string | undefined;
}> {
  const chaveBase64 = process.env['WHATSAPP_TOKEN_KEY'];
  if (!chaveBase64) return { ok: false, erro: 'WHATSAPP_TOKEN_KEY em falta' };

  let token: string;
  try {
    token = decifrarGuardado(conta.access_token_encrypted, conta.token_key_id, chaveBase64);
  } catch (causa) {
    return {
      ok: false,
      erro: `não foi possível decifrar o token: ${String(causa).slice(0, 120)}`,
    };
  }

  /*
   * Botoes quando cabem; texto quando nao cabem.
   *
   * As opcoes iam sempre no corpo, como marcas de lista — pareciam botoes no
   * ecra do cliente e nao eram. `escolherFormato` devolve `null` quando alguma
   * opcao nao cabe inteira no limite da Meta, e nesse caso volta-se ao texto:
   * truncar faria o titulo que regressa deixar de bater certo com o que a
   * conversa ofereceu. Ver a nota em `escolherFormato`.
   */
  const formato = opcoes?.length ? escolherFormato(opcoes, texto) : null;

  const provider = new MetaCloudApiProvider(conta.phone_number_id, token);

  const enviado = await provider.send(
    formato && opcoes
      ? {
          tipo: 'interativa',
          para,
          corpo: texto,
          formato,
          opcoes: opcoes.map((o, i) => ({ id: `opcao_${i}`, titulo: o })),
          rotuloDaLista: 'Escolher',
        }
      : {
          tipo: 'texto',
          para,
          corpo: opcoes?.length ? `${texto}\n\n${opcoes.map((o) => `• ${o}`).join('\n')}` : texto,
          previewUrl: false,
        },
  );

  return enviado.ok
    ? { ok: true, providerMessageId: enviado.value.providerMessageId }
    : { ok: false, erro: enviado.error.message };
}

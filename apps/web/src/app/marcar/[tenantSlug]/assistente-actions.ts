'use server';

import { getAvailableSlots } from '@totalmobi/availability';
import {
  extrair,
  filtrarPorPreferencia,
  frasearSlots,
  nomeDoPeriodo,
  proximoTurno,
  type ContextoDaConversa,
  type Estado,
} from '@totalmobi/conversation';
import {
  createAnonClient,
  loadAvailabilityDataset,
  toAvailabilityInput,
  getPublicTenantBySlug,
} from '@totalmobi/database';
import { formatInZone } from '@totalmobi/shared';

/**
 * O assistente na página pública.
 *
 * A CONVERSA ENCONTRA; O FORMULÁRIO COMPROMETE
 *
 * Esta conversa **não cria marcações**. Percebe o que a pessoa quer, encontra a
 * hora, e devolve a escolha ao formulário que já existe — que é onde se pedem
 * nome, telemóvel e consentimentos, com a validação e o RGPD já resolvidos e
 * testados.
 *
 * Podia fazer tudo aqui dentro. Seria a segunda implementação de recolha de
 * consentimento no mesmo produto, e a que ninguém se lembraria de atualizar
 * quando a lei ou o desenho mudassem.
 *
 * O QUE ISTO CUMPRE
 *
 * A landing mostra uma conversa como demonstração, e quem chega à página da
 * clínica só encontrava passos. Agora encontra as duas coisas: os passos por
 * omissão — quatro toques, sem escrever nada — e um botão para quem prefere
 * escrever.
 *
 * O ESTADO VIVE NO SERVIDOR
 *
 * O contexto da conversa **não** viaja no cliente. Se viajasse, qualquer pessoa
 * podia forjar `slotsOferecidos` e mandar o assistente aceitar uma hora que
 * nunca existiu. Guarda-se em `conversations`, e o cliente só leva um
 * identificador opaco.
 *
 * A base ainda revalidaria tudo na criação — a função atómica e a constraint de
 * exclusão não confiam em ninguém —, mas confiar no cliente aqui seria pedir
 * para descobrir o buraco mais tarde.
 */

export interface TurnoPublico {
  conversaId: string;
  texto: string;
  opcoes?: string[] | undefined;
  /** Quando a conversa chega a uma hora concreta, entrega-a ao formulário. */
  escolha?:
    | {
        servicoId: string;
        /** Quem a pessoa pediu, se pediu alguém. `null` = qualquer um. */
        staffId: string | null;
        data: string;
        slotIso: string;
        /** Já formatada no fuso da unidade — o cliente não sabe qual é. */
        hora: string;
      }
    | undefined;
  erro?: string | undefined;
}

const LIMITE_DA_MENSAGEM = 500;

export async function falarComAssistente(entrada: {
  tenantSlug: string;
  mensagem: string;
  conversaId?: string | undefined;
}): Promise<TurnoPublico> {
  const mensagem = entrada.mensagem.trim().slice(0, LIMITE_DA_MENSAGEM);
  if (!mensagem) return { conversaId: entrada.conversaId ?? '', texto: '', erro: 'Escreva algo.' };

  const client = createAnonClient();
  const perfil = await getPublicTenantBySlug(client, entrada.tenantSlug);
  if (!perfil.ok) return { conversaId: '', texto: '', erro: 'Empresa não encontrada.' };

  const tenantId = perfil.value.tenant.id;

  /*
   * A mesma verificação que desenha o botão. Sem ela, quem descobrisse o nome
   * da ação falava com o assistente de uma empresa que não o contratou.
   *
   * O `as never` atravessa os tipos gerados, que ainda não conhecem esta função
   * — foram gerados contra a base antes da migration `0038`. Some sozinho com
   * `npm run db:types:remote` depois de a migration correr; fica assinalado
   * aqui para que a remoção seja óbvia e não uma arqueologia.
   */
  const { data: ativo } = await client.rpc('chat_publico_ativo' as never, {
    p_tenant: tenantId,
  } as never);
  if (!ativo) return { conversaId: '', texto: '', erro: 'Assistente indisponível.' };

  const unidade = perfil.value.locations[0];
  if (!unidade) return { conversaId: '', texto: '', erro: 'Assistente indisponível.' };

  const [{ data: servicos }, { data: equipa }] = await Promise.all([
    client
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('bookable_online', true)
      .order('sort_order'),
    client
      .from('staff')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('accepts_online_booking', true)
      .order('sort_order'),
  ]);

  const conversa = await obterConversa(client, tenantId, entrada.conversaId);
  if (!conversa) return { conversaId: '', texto: '', erro: 'Não foi possível iniciar a conversa.' };

  const catalogo = {
    servicos: (servicos ?? []).map((s) => s.name),
    profissionais: (equipa ?? []).map((p) => p.full_name),
  };

  const agora = new Date();
  const intencao = extrair(mensagem, catalogo, agora);

  const turno = proximoTurno({
    estado: conversa.estado,
    contexto: conversa.contexto,
    mensagem,
    catalogo,
    agora,
    intencao,
    nomeDaEmpresa: perfil.value.tenant.display_name,
  });

  let texto = turno.texto;
  let opcoes = turno.opcoes;
  let contexto = turno.contexto;
  let escolha: TurnoPublico['escolha'];

  const servicoEscolhido = (servicos ?? []).find((s) => s.name === contexto.servico);

  /*
   * Quem a pessoa pediu.
   *
   * O extrator resolve o nome contra o catálogo da empresa, por isso o contexto
   * já traz o nome como está na base — "Jo" vira "João". Faltava alguém pegar
   * nele: sem isto as horas vinham de toda a gente e a marcação saía com quem
   * calhasse, que foi como um pedido "com o João" acabou com a Anaa.
   */
  const profissionalEscolhido =
    (equipa ?? []).find((p) => p.full_name === contexto.profissional) ?? null;

  if (turno.necessidade.tipo === 'procurar_slots' && servicoEscolhido) {
    const data = contexto.data ?? agora.toISOString().slice(0, 10);
    const dataset = await loadAvailabilityDataset(client, {
      locationId: unidade.id,
      serviceId: servicoEscolhido.id,
      from: data,
      to: data,
      // Sem isto as horas seriam de toda a gente, e oferecer a hora de outra
      // pessoa a quem pediu uma em concreto é pior do que não ter hora.
      ...(profissionalEscolhido ? { staffId: profissionalEscolhido.id } : {}),
    });

    if (dataset.ok) {
      // As horas vêm do motor. O assistente nunca inventa uma.
      const slots = getAvailableSlots(toAvailabilityInput(dataset.value, data, agora)).slots.map(
        (s) => ({
          iso: s.start.toISOString(),
          hora: formatInZone(s.start, dataset.value.timezone, 'pt-PT', 'time'),
        }),
      );

      /*
       * O que a pessoa pediu manda na lista.
       *
       * O extrator ja punha `periodo` e `horaMinima` no contexto; faltava
       * alguem le-los. Sem isto, "a tarde" recebia as horas da manha — as
       * primeiras do dia — e o assistente parecia desatento em vez de limitado.
       */
      const preferido = filtrarPorPreferencia(slots, contexto);
      const frase = frasearSlots(preferido.horas, contexto.servico ?? 'o servico');

      const nomePeriodo = preferido.relaxado ? nomeDoPeriodo(contexto.periodo) : null;

      // Só se diz "de tarde não tenho" quando se sabe nomear o período.
      texto = nomePeriodo
        ? `Não tenho nada ${nomePeriodo} nesse dia. ${frase.texto}`
        : frase.texto;
      opcoes = frase.opcoes;
      contexto = { ...contexto, slotsOferecidos: preferido.horas };
    }
  }

  /*
   * A entrega ao formulário.
   *
   * Assim que há hora escolhida, a conversa acabou o seu trabalho. Não se
   * espera pelo `criar_marcacao` da máquina de estados — esse caminho é do
   * WhatsApp, onde não há formulário para onde entregar.
   */
  if (contexto.slotEscolhido && servicoEscolhido && contexto.data) {
    const escolhido = (contexto.slotsOferecidos ?? []).find(
      (x) => x.iso === contexto.slotEscolhido,
    );

    escolha = {
      servicoId: servicoEscolhido.id,
      staffId: profissionalEscolhido?.id ?? null,
      data: contexto.data,
      slotIso: contexto.slotEscolhido,
      hora:
        escolhido?.hora ??
        formatInZone(new Date(contexto.slotEscolhido), unidade.timezone, 'pt-PT', 'time'),
    };
    texto = 'Encontrei. Confirme os seus dados aqui em baixo e fica marcado.';
    opcoes = undefined;
  }

  // Grava o estado **e** o par de mensagens. Sem elas a caixa de entrada do
  // painel mostraria metade da conversa.
  await client.rpc('conversa_web_guardar' as never, {
    p_id: conversa.id,
    p_tenant: tenantId,
    p_estado: turno.estado,
    p_contexto: contexto,
    p_pergunta: mensagem,
    p_resposta: texto,
  } as never);

  return { conversaId: conversa.id, texto, opcoes, escolha };
}

interface ConversaAberta {
  id: string;
  estado: Estado;
  contexto: ContextoDaConversa;
}

/**
 * A conversa, aberta ou retomada por função.
 *
 * O anónimo não tem — nem deve ter — acesso à tabela `conversations`. Sem
 * sessão, uma política de RLS não sabe de quem é a linha, e a única que
 * funcionaria (`channel = 'web_chat'`) deixaria qualquer pessoa ler as
 * conversas de todas as empresas.
 *
 * Por isso passa por `conversa_web_abrir`, `SECURITY DEFINER`, que é o mesmo
 * padrão do `availability_dataset` e do `create_booking_atomic`. Ver a
 * migration `0039`.
 */
async function obterConversa(
  client: ReturnType<typeof createAnonClient>,
  tenantId: string,
  id: string | undefined,
): Promise<ConversaAberta | null> {
  const { data } = await client.rpc('conversa_web_abrir' as never, {
    p_tenant: tenantId,
    ...(id ? { p_id: id } : {}),
  } as never);

  const linha = (data as { id: string; current_state: string; context: unknown }[] | null)?.[0];
  if (!linha) return null;

  return {
    id: linha.id,
    estado: linha.current_state as Estado,
    contexto: (linha.context ?? {}) as ContextoDaConversa,
  };
}

'use server';

import { headers } from 'next/headers';

import { getAvailableSlots } from '@totalmobi/availability';
import {
  createAnonClient,
  createBooking,
  loadAvailabilityDataset,
  toAvailabilityInput,
} from '@totalmobi/database';
import { formatInZone, normalizePhone } from '@totalmobi/shared';

/**
 * As ações do caminho público.
 *
 * Correm no servidor mas com o cliente **anónimo** — o mesmo que o browser
 * usaria. Não é uma formalidade: significa que a RLS e os grants de coluna são
 * exercidos aqui exatamente como seriam num pedido direto. Se algo escapasse à
 * política, escapava nos dois sítios; usar o `service_role` aqui esconderia o
 * problema até ao dia em que alguém chamasse a API a sério.
 *
 * O que o servidor acrescenta é o que o browser não pode dar: o IP para o
 * limite de pedidos, e a garantia de que a `idempotency_key` chega intacta.
 */

/** Um slot pronto para o ecrã: o instante e a hora local já escrita. */
export interface SlotPublico {
  iso: string;
  hora: string;
}

export interface EstadoHorarios {
  slots?: SlotPublico[];
  /** Porque é que não há nada — para dizer "fechado" em vez de "sem vagas". */
  motivo?: string;
  erro?: string;
}

/**
 * Limite de pedidos, por IP.
 *
 * ⚠️ **Vive na memória do processo.** Numa implantação com várias instâncias,
 * cada uma tem o seu contador, e um reinício zera tudo. Trava o script
 * amador — que é o ataque real contra uma página de marcações — e não trava
 * um ataque distribuído.
 *
 * O limite a sério é infraestrutura (Vercel Edge Config, Upstash, ou o rate
 * limit do próprio Supabase) e fica para quando houver tráfego que o justifique.
 * Está aqui escrito para que ninguém confunda isto com proteção real.
 */
const CONTADOR = new Map<string, { contagem: number; janela: number }>();

function dentroDoLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  const atual = CONTADOR.get(chave);

  if (!atual || agora - atual.janela > janelaMs) {
    CONTADOR.set(chave, { contagem: 1, janela: agora });
    return true;
  }

  atual.contagem += 1;
  return atual.contagem <= maximo;
}

async function identificarPedido(): Promise<string> {
  const cabecalhos = await headers();
  return (
    cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    cabecalhos.get('x-real-ip') ??
    'desconhecido'
  );
}

const MOTIVOS: Record<string, string> = {
  closed: 'Fechado neste dia.',
  fully_booked: 'Sem vagas neste dia.',
  outside_advance_window: 'Sem horas disponíveis com a antecedência necessária.',
  service_does_not_fit: 'Este serviço não cabe no horário deste dia.',
  no_staff: 'Ninguém disponível para este serviço.',
};

export async function obterHorarios(
  locationId: string,
  serviceId: string,
  data: string,
  staffId?: string,
): Promise<EstadoHorarios> {
  const ip = await identificarPedido();

  // Consultar horários é barato e o utilizador legítimo toca em vários dias
  // seguidos. O limite é generoso de propósito: apertá-lo estragaria a
  // experiência de quem está mesmo a escolher.
  if (!dentroDoLimite(`horarios:${ip}`, 120, 60_000)) {
    return { erro: 'Demasiados pedidos. Aguarde um momento.' };
  }

  const client = createAnonClient();

  const dataset = await loadAvailabilityDataset(client, {
    locationId,
    serviceId,
    from: data,
    to: data,
    ...(staffId ? { staffId } : {}),
  });

  if (!dataset.ok) return { erro: 'Não foi possível obter os horários.' };

  const resultado = getAvailableSlots(toAvailabilityInput(dataset.value, data, new Date()));

  if (resultado.slots.length === 0) {
    return { slots: [], motivo: MOTIVOS[resultado.reason ?? ''] ?? 'Sem horas disponíveis.' };
  }

  return {
    slots: resultado.slots.map((s) => ({
      iso: s.start.toISOString(),
      hora: formatInZone(s.start, dataset.value.timezone, 'pt-PT', 'time'),
    })),
  };
}

export interface EstadoMarcacao {
  ok?: {
    bookingId: string;
    accessToken?: string | undefined;
    status: string;
  };
  erro?: string;
  /** `true` quando a hora foi ocupada entretanto — o ecrã volta à grelha. */
  horaOcupada?: boolean;
}

export async function marcar(entrada: {
  locationId: string;
  serviceId: string;
  staffId?: string | undefined;
  startAt: string;
  nome: string;
  telefone: string;
  email?: string | undefined;
  notas?: string | undefined;
  aceitaLembretes: boolean;
  idempotencyKey: string;
  countryCode?: string | undefined;
}): Promise<EstadoMarcacao> {
  const ip = await identificarPedido();

  // Criar é caro e ninguém marca dez consultas em três minutos.
  if (!dentroDoLimite(`marcar:${ip}`, 8, 180_000)) {
    return { erro: 'Demasiadas tentativas. Tente novamente daqui a alguns minutos.' };
  }

  const nome = entrada.nome.trim();
  if (nome.length < 2) return { erro: 'Escreva o seu nome.' };

  // O telefone é normalizado para E.164 aqui, e não no browser: é a chave de
  // deduplicação de clientes, e "912 345 678" e "+351912345678" têm de dar a
  // mesma pessoa.
  const telefone = normalizePhone(entrada.telefone, entrada.countryCode ?? 'PT');

  if (!telefone.ok) {
    return { erro: 'Número de telemóvel inválido.' };
  }

  const client = createAnonClient();

  const resultado = await createBooking(client, {
    locationId: entrada.locationId,
    serviceId: entrada.serviceId,
    startAt: new Date(entrada.startAt),
    customer: {
      firstName: nome,
      phone: telefone.value,
      ...(entrada.email?.trim() ? { email: entrada.email.trim().toLowerCase() } : {}),
    },
    source: 'public_web',
    ...(entrada.staffId ? { staffId: entrada.staffId } : {}),
    ...(entrada.notas?.trim() ? { notes: entrada.notas.trim() } : {}),
    idempotencyKey: entrada.idempotencyKey,
  });

  if (!resultado.ok) {
    // A hora ocupada entretanto **não é um erro** do ponto de vista de quem
    // está a marcar: é uma corrida que se perdeu por segundos. O ecrã volta à
    // grelha com as horas atualizadas em vez de mostrar uma mensagem de falha.
    if (resultado.error.code === 'SLOT_TAKEN') {
      return {
        horaOcupada: true,
        erro: 'Essa hora acabou de ser ocupada. Escolha outra.',
      };
    }

    if (resultado.error.code === 'OUTSIDE_WORKING_HOURS') {
      return { horaOcupada: true, erro: 'Essa hora deixou de estar disponível.' };
    }

    return { erro: 'Não foi possível concluir a marcação. Tente novamente.' };
  }

  // O consentimento de lembretes é separado do de marketing, e só se regista o
  // que a pessoa marcou. Nunca se assume — é o que o RGPD chama consentimento
  // livre e específico, e um pré-selecionado não é nem uma coisa nem outra.
  if (entrada.aceitaLembretes && resultado.value.customerId) {
    await client.rpc('record_consent', {
      p_customer_id: resultado.value.customerId,
      p_purpose: 'reminders',
      p_granted: true,
      p_source: 'public_web',
    });
  }

  return {
    ok: {
      bookingId: resultado.value.bookingId,
      accessToken: resultado.value.accessToken,
      status: resultado.value.status,
    },
  };
}

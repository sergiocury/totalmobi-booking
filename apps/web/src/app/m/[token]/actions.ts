'use server';

import { headers } from 'next/headers';

import { getAvailableSlots } from '@totalmobi/availability';
import {
  createAnonClient,
  loadAvailabilityDataset,
  toAvailabilityInput,
} from '@totalmobi/database';
import { formatInZone } from '@totalmobi/shared';

/**
 * As ações de quem gere a marcação sem conta.
 *
 * O token nunca vai para o cliente Supabase como identidade — vai como
 * **argumento** de funções que o validam por dentro. A diferença importa: um
 * token que fosse tratado como credencial daria acesso a tudo o que a RLS
 * permite ao `anon`; assim só abre a porta da marcação a que pertence.
 *
 * Nenhuma destas funções recebe ou devolve o id da marcação.
 */

/** ⚠️ Limite por processo. Ver a nota longa em `marcar/[tenantSlug]/actions.ts`. */
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

async function quemPede(): Promise<string> {
  const cabecalhos = await headers();
  return (
    cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    cabecalhos.get('x-real-ip') ??
    'desconhecido'
  );
}

export interface EstadoGestao {
  ok?: boolean;
  erro?: string;
}

function explicar(codigo: string | undefined): string {
  switch (codigo) {
    case 'P0002':
      return 'Este link já não é válido.';
    case 'P0005':
      return 'Esta marcação já não está no estado necessário para esta operação.';
    case 'P0006':
      return 'Já passou o prazo para o fazer online.';
    case '23P01':
      return 'Essa hora acabou de ser ocupada. Escolha outra.';
    case 'P0003':
      return 'Essa hora não está disponível.';
    default:
      return 'Não foi possível concluir. Tente novamente.';
  }
}

export async function cancelar(token: string, motivo: string): Promise<EstadoGestao> {
  // O limite é por token, não por IP: uma família a partilhar a mesma rede não
  // pode ficar sem poder desmarcar porque outra pessoa em casa já o fez.
  if (!dentroDoLimite(`cancelar:${token.slice(0, 16)}`, 5, 300_000)) {
    return { erro: 'Demasiadas tentativas. Aguarde alguns minutos.' };
  }

  const client = createAnonClient();
  const { error } = await client.rpc('cancel_by_token', {
    p_token: token,
    // Espalhado em vez de `|| null`: o parâmetro tem `default null` no SQL, e
    // com `exactOptionalPropertyTypes` passar `undefined` não é o mesmo que
    // não passar a chave.
    ...(motivo.trim() ? { p_reason: motivo.trim() } : {}),
  });

  if (error) return { erro: explicar(error.code) };
  return { ok: true };
}

export async function confirmar(token: string): Promise<EstadoGestao> {
  if (!dentroDoLimite(`confirmar:${token.slice(0, 16)}`, 5, 300_000)) {
    return { erro: 'Demasiadas tentativas. Aguarde alguns minutos.' };
  }

  const client = createAnonClient();
  const { error } = await client.rpc('confirm_by_token', { p_token: token });

  if (error) return { erro: explicar(error.code) };
  return { ok: true };
}

export async function remarcar(token: string, novoInicio: string): Promise<EstadoGestao> {
  if (!dentroDoLimite(`remarcar:${token.slice(0, 16)}`, 8, 300_000)) {
    return { erro: 'Demasiadas tentativas. Aguarde alguns minutos.' };
  }

  const client = createAnonClient();
  const { error } = await client.rpc('reschedule_by_token', {
    p_token: token,
    p_new_start: novoInicio,
  });

  if (error) return { erro: explicar(error.code) };
  return { ok: true };
}

export interface HorasAlternativas {
  slots?: { iso: string; hora: string }[];
  motivo?: string;
}

/**
 * As horas livres de um dia, para quem está a remarcar.
 *
 * Usa o mesmo motor da página pública. Recebe a unidade e o serviço que vieram
 * com o detalhe da marcação — não o token —, porque este caminho é só de
 * leitura e disponibilidade não é informação privada: qualquer pessoa a ver a
 * página pública vê as mesmas horas.
 */
export async function horasLivres(
  locationId: string,
  serviceId: string,
  data: string,
): Promise<HorasAlternativas> {
  const ip = await quemPede();
  if (!dentroDoLimite(`horas:${ip}`, 120, 60_000)) {
    return { motivo: 'Demasiados pedidos. Aguarde um momento.' };
  }

  const client = createAnonClient();
  const dataset = await loadAvailabilityDataset(client, {
    locationId,
    serviceId,
    from: data,
    to: data,
  });

  if (!dataset.ok) return { motivo: 'Não foi possível obter as horas.' };

  const resultado = getAvailableSlots(toAvailabilityInput(dataset.value, data, new Date()));

  if (resultado.slots.length === 0) {
    return {
      motivo:
        resultado.reason === 'closed'
          ? 'Fechado neste dia.'
          : 'Sem horas disponíveis neste dia.',
    };
  }

  return {
    slots: resultado.slots.map((s) => ({
      iso: s.start.toISOString(),
      hora: formatInZone(s.start, dataset.value.timezone, 'pt-PT', 'time'),
    })),
  };
}

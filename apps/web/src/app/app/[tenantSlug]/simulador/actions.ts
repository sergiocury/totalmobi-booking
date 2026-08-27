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
import { loadAvailabilityDataset, toAvailabilityInput } from '@totalmobi/database';
import { formatInZone } from '@totalmobi/shared';

import { requireRole } from '@/lib/auth/context';

/**
 * O simulador de conversa.
 *
 * Corre a **mesma** máquina de estados que o WhatsApp vai correr. Não é uma
 * imitação para demonstração: se a conversa funciona aqui, funciona lá, porque
 * é o mesmo código a decidir.
 *
 * O que muda é só o transporte — e é por isso que a máquina de estados é pura.
 *
 * As horas vêm do motor de disponibilidade real, contra dados reais. O bot
 * continua a não as inventar: recebe-as aqui e o `frasearSlots` transforma-as
 * em texto.
 */

export interface TurnoSimulado {
  estado: Estado;
  contexto: ContextoDaConversa;
  texto: string;
  opcoes?: string[];
  /** Para o painel mostrar o que o extrator percebeu, sem adivinhar. */
  diagnostico: {
    intent: string;
    confianca: number;
    necessidade: string;
    servico: string | null;
    data: string | null;
  };
  erro?: string;
}

export async function simular(
  tenantId: string,
  entrada: {
    estado: Estado;
    contexto: ContextoDaConversa;
    mensagem: string;
    locationId: string;
    nomeDaEmpresa: string;
  },
): Promise<TurnoSimulado> {
  const guard = await requireRole(tenantId, 'staff');
  if (!guard.ok) {
    return {
      estado: entrada.estado,
      contexto: entrada.contexto,
      texto: '',
      diagnostico: { intent: '-', confianca: 0, necessidade: '-', servico: null, data: null },
      erro: 'Sem permissão.',
    };
  }

  const client = guard.value.client;

  const [{ data: servicos }, { data: equipa }] = await Promise.all([
    client
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('bookable_online', true),
    client
      .from('staff')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
  ]);

  const catalogo = {
    servicos: (servicos ?? []).map((s) => s.name),
    profissionais: (equipa ?? []).map((p) => p.full_name),
  };

  const agora = new Date();
  const intencao = extrair(entrada.mensagem, catalogo, agora);

  const turno = proximoTurno({
    estado: entrada.estado,
    contexto: entrada.contexto,
    mensagem: entrada.mensagem,
    catalogo,
    agora,
    intencao,
    nomeDaEmpresa: entrada.nomeDaEmpresa,
  });

  let texto = turno.texto;
  let opcoes = turno.opcoes;
  let contexto = turno.contexto;

  // A única necessidade que o simulador cumpre é procurar horas — e cumpre-a
  // com o motor a sério. Criar e cancelar ficam por cumprir de propósito:
  // simular não pode mexer na agenda real.
  if (turno.necessidade.tipo === 'procurar_slots') {
    const servicoId = (servicos ?? []).find((s) => s.name === turno.necessidade.tipo)?.id;
    const escolhido = (servicos ?? []).find((s) => s.name === contexto.servico);

    if (escolhido) {
      const data = contexto.data ?? new Date().toISOString().slice(0, 10);
      const dataset = await loadAvailabilityDataset(client, {
        locationId: entrada.locationId,
        serviceId: escolhido.id,
        from: data,
        to: data,
      });

      if (dataset.ok) {
        const resultado = getAvailableSlots(toAvailabilityInput(dataset.value, data, agora));
        const slots = resultado.slots.map((s) => ({
          iso: s.start.toISOString(),
          hora: formatInZone(s.start, dataset.value.timezone, 'pt-PT', 'time'),
        }));

        // O mesmo filtro dos outros dois canais. Se o simulador mostrasse
        // horas diferentes do WhatsApp, deixava de servir para simular.
        const preferido = filtrarPorPreferencia(slots, contexto);
        const frase = frasearSlots(preferido.horas, contexto.servico ?? 'o serviço');
        const nomePeriodo = preferido.relaxado ? nomeDoPeriodo(contexto.periodo) : null;

        texto = nomePeriodo
          ? `Não tenho nada ${nomePeriodo} nesse dia. ${frase.texto}`
          : frase.texto;
        opcoes = frase.opcoes;
        contexto = { ...contexto, slotsOferecidos: preferido.horas };
      }
    }

    void servicoId;
  }

  return {
    estado: turno.estado,
    contexto,
    texto,
    ...(opcoes ? { opcoes } : {}),
    diagnostico: {
      intent: intencao.intent,
      confianca: intencao.confianca,
      necessidade: turno.necessidade.tipo,
      servico: intencao.servico,
      data: intencao.data,
    },
  };
}

'use server';

import {
  extrair,
  frasearDias,
  frasearProcura,
  proximoTurno,
  type ContextoDaConversa,
  type Estado,
} from '@totalmobi/conversation';

import { requireRole } from '@/lib/auth/context';
import { objecaoDoProfissional } from '@totalmobi/shared';

import { carregarCatalogo } from '@/lib/marcacoes/catalogo';
import { procurarDias, procurarHoras } from '@/lib/marcacoes/procurar-horas';

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
      diagnostico: {
        intent: '-',
        confianca: 0,
        necessidade: '-',
        servico: null,
        data: null,
      },
      erro: 'Sem permissão.',
    };
  }

  const client = guard.value.client;

  // O mesmo catalogo dos outros dois canais. Um simulador que oferecesse um
  // servico que o WhatsApp esconde deixava de servir para simular.
  const empresa = await carregarCatalogo(client, tenantId);
  const servicos = empresa.servicos;
  const equipa = empresa.equipa;

  const catalogo = {
    servicos: servicos.map((s) => s.name),
    profissionais: equipa.map((p) => p.full_name),
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
  if (turno.necessidade.tipo === 'procurar_dias') {
    const escolhido = servicos.find((s) => s.name === contexto.servico);

    if (escolhido) {
      const hoje = agora.toISOString().slice(0, 10);
      const r = await procurarDias(client, {
        locationId: entrada.locationId,
        serviceId: escolhido.id,
        staffId: equipa.find((p) => p.full_name === contexto.profissional)?.id ?? null,
        data: hoje,
        preferencia: contexto,
        agora,
      });

      const frase = frasearDias(r.dias, contexto.servico ?? 'o serviço', hoje);
      texto = frase.texto;
      opcoes = frase.opcoes;
    }
  }

  if (turno.necessidade.tipo === 'procurar_slots') {
    const servicoId = servicos.find((s) => s.name === turno.necessidade.tipo)?.id;
    const escolhido = servicos.find((s) => s.name === contexto.servico);

    /*
     * O profissional pedido.
     *
     * O simulador procurava sempre em toda a equipa, mesmo quando o pedido
     * nomeava alguem: mostrava horas que o WhatsApp nao mostraria, e um
     * simulador que diverge do canal a serio nao simula, engana.
     */
    const profissionalPedido = equipa.find((p) => p.full_name === contexto.profissional) ?? null;
    const objecao =
      escolhido && profissionalPedido
        ? objecaoDoProfissional(empresa, escolhido.id, profissionalPedido)
        : null;

    if (objecao) {
      texto = objecao.texto;
      opcoes = objecao.opcoes;
    } else if (escolhido) {
      const hoje = agora.toISOString().slice(0, 10);

      const encontrado = await procurarHoras(client, {
        locationId: entrada.locationId,
        serviceId: escolhido.id,
        staffId: profissionalPedido?.id ?? null,
        data: contexto.data ?? hoje,
        preferencia: contexto,
        agora,
      });

      const frase = frasearProcura(encontrado, contexto.servico ?? 'o serviço', contexto, hoje);

      texto = frase.texto;
      opcoes = frase.opcoes;
      contexto = {
        ...contexto,
        slotsOferecidos: encontrado.horas,
        ...(encontrado.data ? { data: encontrado.data } : {}),
      };
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

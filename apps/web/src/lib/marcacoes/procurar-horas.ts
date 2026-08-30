import 'server-only';

import { getAvailableSlots } from '@totalmobi/availability';
import {
  diasDoIntervalo,
  primeiroDiaComHoras,
  type HorasEncontradas,
  type Preferencia,
} from '@totalmobi/conversation';
import {
  loadAvailabilityDataset,
  toAvailabilityInput,
  type BookingClient,
} from '@totalmobi/database';
import { formatInZone } from '@totalmobi/shared';

/**
 * As horas, procuradas como uma pessoa procuraria.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * Este bloco estava escrito **três vezes** — na página pública, no WhatsApp e
 * no simulador. Sempre igual, sempre com a mesma omissão. Foi por isso que a
 * preferência horária teve de ser corrigida três vezes, e o profissional
 * escolhido outras três: cada defeito era um só, mas vivia em triplicado, e
 * corrigir dois dos três deixava um canal a mentir.
 *
 * Agora é um sítio. Os três canais têm de dar a mesma resposta à mesma
 * pergunta — se o simulador mostrasse horas diferentes do WhatsApp, deixava de
 * servir para simular.
 *
 * O QUE MUDA EM RELAÇÃO AO QUE HAVIA
 *
 * Pedia-se `from: data, to: data` — um dia. Quando esse dia não tinha nada, a
 * conversa não tinha para onde ir e repetia "não tenho horas nesse dia" a cada
 * pergunta seguinte. A informação não estava a ser mal interpretada: nunca
 * tinha sido pedida.
 */

/**
 * Duas semanas.
 *
 * Chega para responder "então quando tem?" em qualquer agenda com movimento, e
 * é curto o suficiente para o dataset não crescer sem necessidade — a procura
 * é uma só ida à base de dados, e depois o motor corre por dia em memória.
 */
export const HORIZONTE_DE_DIAS = 14;

export interface HorasParaConversa extends HorasEncontradas {
  /** O fuso da unidade, para quem precise de formatar mais alguma coisa. */
  readonly timezone: string | null;
  /**
   * A procura falhou — e isso **não** e o mesmo que nao haver horas.
   *
   * Sem este campo, um erro da base de dados e uma agenda vazia saiam daqui
   * exatamente iguais, e o cliente ouvia "nao encontrei horas" nos dois casos.
   * E o mesmo defeito do diagnostico do `/status`, que dizia "nenhum" quando o
   * que se passava era falta de permissoes: uma resposta que parece informacao
   * e e ausencia de informacao.
   */
  readonly falhou: string | null;
}

const NADA: HorasParaConversa = {
  data: null,
  horas: [],
  procurouAdiante: false,
  relaxado: false,
  timezone: null,
  falhou: null,
};

export async function procurarHoras(
  client: BookingClient,
  entrada: {
    locationId: string;
    serviceId: string;
    /** Quem a pessoa pediu. `null` ou omitido = qualquer profissional. */
    staffId?: string | null | undefined;
    /** `YYYY-MM-DD`, o dia por onde começar. */
    data: string;
    preferencia: Preferencia;
    agora: Date;
  },
): Promise<HorasParaConversa> {
  const dias = diasDoIntervalo(entrada.data, HORIZONTE_DE_DIAS);
  const ultimo = dias[dias.length - 1];
  if (!ultimo) return { ...NADA, falhou: `data invalida: ${entrada.data}` };

  const dataset = await loadAvailabilityDataset(client, {
    locationId: entrada.locationId,
    serviceId: entrada.serviceId,
    from: entrada.data,
    to: ultimo,
    // Sem isto as horas seriam de toda a gente, e oferecer a hora de outra
    // pessoa a quem pediu uma em concreto é pior do que não ter hora.
    ...(entrada.staffId ? { staffId: entrada.staffId } : {}),
  });

  if (!dataset.ok) {
    // Fica no registo do servidor: quem investiga precisa da causa, e o cliente
    // nao precisa de a ver.
    console.error('procurarHoras: dataset falhou', dataset.error);
    return { ...NADA, falhou: dataset.error.message };
  }

  const timezone = dataset.value.timezone;

  // As horas vêm do motor, dia a dia. O assistente nunca inventa uma.
  const porDia = dias.map((dia) => ({
    data: dia,
    horas: getAvailableSlots(toAvailabilityInput(dataset.value, dia, entrada.agora)).slots.map(
      (s) => ({
        iso: s.start.toISOString(),
        hora: formatInZone(s.start, timezone, 'pt-PT', 'time'),
      }),
    ),
  }));

  return { ...primeiroDiaComHoras(porDia, entrada.preferencia), timezone, falhou: null };
}

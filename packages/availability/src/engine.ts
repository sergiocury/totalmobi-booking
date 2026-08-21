import {
  addMinutes,
  overlaps,
  resolveDaySchedule,
  sliceIntoSlots,
  startOfDayInZone,
  type TimeInterval,
} from '@totalmobi/shared';

import type {
  AvailabilityInput,
  AvailabilityResult,
  BusyInterval,
  ServiceSpec,
  Slot,
  UnavailableReason,
} from './types';

/**
 * O motor de disponibilidade.
 *
 * Função pura: recebe tudo, não lê relógio nem base de dados, e dá sempre a
 * mesma resposta para a mesma entrada. É o que permite atirar-lhe milhares de
 * casos gerados e é o que permite corrê-la no servidor, no widget ou dentro de
 * uma conversa de WhatsApp sem mudar uma linha.
 *
 * O QUE ELA NÃO É
 *
 * Isto **sugere**. A verdade é a transação do M8, com a constraint de exclusão
 * a decidir quem chegou primeiro. Entre mostrar o slot e o cliente carregar no
 * botão passam segundos, e nesses segundos outra pessoa pode marcar. Uma
 * disponibilidade que se dissesse garantida seria uma mentira com um nome
 * técnico.
 *
 * AS QUATRO DECISÕES QUE DEFINEM O COMPORTAMENTO
 *
 * 1. **O serviço tem de caber no horário; os buffers podem transbordar.**
 *    Uma clínica que abre às 9 tem de conseguir marcar às 9. Se o buffer de
 *    preparação tivesse de caber dentro do horário, a primeira hora de todos os
 *    dias ficava por vender — e a preparação é trabalho de bastidores, não
 *    atendimento. Mas o buffer conta contra as outras marcações: é o
 *    `blocked_range` inteiro que tem de estar livre.
 *
 * 2. **A grelha ancora-se à meia-noite local, não ao início da janela.**
 *    Fatiar a partir do fim da marcação anterior daria inícios às 10:37. Ancorar
 *    ao dia local dá 09:00, 09:15, 09:30 — e continua a dar em fusos com
 *    desvio de meia hora, onde ancorar em UTC daria :07 e :37.
 *
 * 3. **Capacidade conta sobreposições, não ocupações.** Com `capacity` 3, o
 *    slot só desaparece à terceira marcação sobreposta. É o caso do dentista
 *    com três cadeiras, não das aulas de grupo — essas são `group_sessions`.
 *
 * 4. **Um slot é oferecido se pelo menos um profissional o puder dar**, e vem
 *    com a lista de quem pode. Quem escolhe é o passo seguinte: o cliente, se
 *    quiser alguém em concreto; a política de distribuição, se lhe for
 *    indiferente.
 */

/** Milissegundos por minuto, com nome. */
const MINUTO = 60_000;

export function getAvailableSlots(input: AvailabilityInput): AvailabilityResult {
  const { date, timezone, now, service, policy } = input;

  if (input.staff.length === 0) {
    return { slots: [], reason: 'no_staff' };
  }

  if (service.durationMinutes <= 0 || policy.slotGranularityMinutes <= 0) {
    return { slots: [], reason: 'service_does_not_fit' };
  }

  // A grelha ancora-se à meia-noite local. Ver decisão 2.
  const ancora = startOfDayInZone(date, timezone);

  // Janela de antecedência, calculada uma vez em vez de por slot.
  const maisCedo = now.getTime() + policy.minAdvanceMinutes * MINUTO;
  const maisTarde = now.getTime() + policy.maxAdvanceDays * 86_400_000;

  /** staffIds por instante de início, em milissegundos. */
  const porInicio = new Map<number, string[]>();

  // As razões acumulam-se para explicar o vazio: ter havido horário mas nada
  // ter passado no filtro do tempo é diferente de estar fechado.
  let houveJanela = false;
  let houveSlotCandidato = false;
  let houveSlotDentroDaJanela = false;

  for (const profissional of input.staff) {
    const dia = resolveDaySchedule({
      date,
      timezone,
      locationHours: input.locationHours,
      staffHours: profissional.workingHours,
      exceptions: [...input.exceptions, ...(profissional.exceptions ?? [])],
      timeOff: profissional.timeOff,
    });

    if (dia.windows.length === 0) continue;
    houveJanela = true;

    for (const janela of dia.windows) {
      // `sliceIntoSlots` recebe a duração **do serviço**, não a do bloco com
      // buffers: é o serviço que tem de caber na janela. Ver decisão 1.
      const inicios = sliceIntoSlots(
        janela,
        service.durationMinutes,
        policy.slotGranularityMinutes,
        ancora,
      );

      if (inicios.length > 0) houveSlotCandidato = true;

      for (const inicio of inicios) {
        const t = inicio.getTime();
        if (t < maisCedo || t > maisTarde) continue;
        houveSlotDentroDaJanela = true;

        if (!cabeNaAgenda(inicio, service, profissional.busy)) continue;

        const jaTem = porInicio.get(t);
        if (jaTem) jaTem.push(profissional.staffId);
        else porInicio.set(t, [profissional.staffId]);
      }
    }
  }

  if (porInicio.size === 0) {
    return { slots: [], reason: razaoDoVazio(houveJanela, houveSlotCandidato, houveSlotDentroDaJanela) };
  }

  const slots: Slot[] = [...porInicio.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, staffIds]) => ({
      start: new Date(t),
      end: new Date(t + service.durationMinutes * MINUTO),
      // Ordem estável: sem isto, a lista mudava conforme a ordem de chegada dos
      // dados e os testes de snapshot passavam a depender do acaso.
      staffIds: [...staffIds].sort(),
    }));

  return { slots, reason: null };
}

/**
 * O bloco que esta marcação ocuparia colide com o que já lá está?
 *
 * Compara `blocked_range` com `blocked_range` — o mesmo que a constraint de
 * exclusão faz na base de dados. Se aqui se comparasse só o serviço, o motor
 * ofereceria slots que a base de dados depois recusava, e o cliente via um erro
 * depois de escolher.
 */
export function cabeNaAgenda(
  inicio: Date,
  service: ServiceSpec,
  busy: readonly BusyInterval[],
): boolean {
  const bloco = blocoOcupado(inicio, service);

  let sobrepostas = 0;
  for (const ocupado of busy) {
    if (overlaps(bloco, ocupado.range)) {
      sobrepostas += 1;
      // Sair mal se atinge a capacidade evita percorrer a agenda toda de quem
      // tem o dia cheio.
      if (sobrepostas >= service.capacity) return false;
    }
  }

  return true;
}

/** O intervalo que a marcação ocuparia, buffers incluídos. */
export function blocoOcupado(inicio: Date, service: ServiceSpec): TimeInterval {
  return {
    start: addMinutes(inicio, -service.bufferBeforeMinutes),
    end: addMinutes(inicio, service.durationMinutes + service.bufferAfterMinutes),
  };
}

function razaoDoVazio(
  houveJanela: boolean,
  houveSlotCandidato: boolean,
  houveSlotDentroDaJanela: boolean,
): UnavailableReason {
  if (!houveJanela) return 'closed';
  // Havia horário mas nem um slot cabia: o serviço é maior do que o dia.
  if (!houveSlotCandidato) return 'service_does_not_fit';
  // Cabiam slots, mas todos caíam fora da antecedência permitida.
  if (!houveSlotDentroDaJanela) return 'outside_advance_window';
  return 'fully_booked';
}

/**
 * O mesmo, restrito a um profissional.
 *
 * Existe porque "quero a Dra. Ana" é metade dos pedidos reais, e porque filtrar
 * a lista completa depois seria pedir à base de dados o dobro do trabalho.
 */
export function getAvailableSlotsForStaff(
  input: AvailabilityInput,
  staffId: string,
): AvailabilityResult {
  const escolhido = input.staff.filter((s) => s.staffId === staffId);
  return getAvailableSlots({ ...input, staff: escolhido });
}

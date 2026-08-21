import type { CatalogoDoTenant } from './extractor';
import { extrair } from './extractor';
import type { IntencaoExtraida } from './intent';

/**
 * A máquina de estados da conversa.
 *
 * **Função pura.** Recebe o estado, o contexto e uma mensagem; devolve o estado
 * seguinte e o que dizer. Não fala com a base de dados, não chama o motor de
 * disponibilidade, não envia nada. Quem faz isso é o adaptador do canal.
 *
 * Isto é o que torna a conversa testável sem WhatsApp, sem Supabase e sem
 * chave de API — e é a mesma razão por que o `BookingEngine` é puro.
 *
 * O LLM INTERPRETA, NUNCA DECIDE
 *
 * O modelo transforma texto em `IntencaoExtraida` e mais nada. Não escolhe
 * horas, não confirma marcações, não sabe o que existe no catálogo. Todas as
 * decisões estão aqui, em código que se lê e se testa.
 *
 * O QUE ISTO NUNCA FAZ
 *
 * Inventar disponibilidade. Os slots vêm sempre de fora, no `contexto`. Se não
 * houver slots, o bot diz que vai ver — não sugere uma hora plausível.
 */

export type Estado =
  | 'NEW'
  | 'IDENTIFYING_INTENT'
  | 'SELECTING_SERVICE'
  | 'SELECTING_STAFF'
  | 'SELECTING_DATE'
  | 'SELECTING_SLOT'
  | 'COLLECTING_CUSTOMER_DATA'
  | 'CONFIRMING'
  | 'BOOKED'
  | 'MANAGING_BOOKING'
  | 'WAITING_HUMAN'
  | 'CLOSED';

export interface ContextoDaConversa {
  servico?: string | null;
  profissional?: string | null;
  data?: string | null;
  periodo?: string | null;
  horaMinima?: string | null;
  /** Slots oferecidos, vindos **do motor**. Nunca inventados aqui. */
  slotsOferecidos?: { iso: string; hora: string }[];
  slotEscolhido?: string | null;
  nome?: string | null;
  telefone?: string | null;
}

/** O que o adaptador tem de ir buscar antes de poder responder. */
export type Necessidade =
  | { tipo: 'nenhuma' }
  | { tipo: 'listar_servicos' }
  | { tipo: 'listar_profissionais' }
  | { tipo: 'procurar_slots'; servico: string; data: string | null; profissional: string | null }
  | { tipo: 'criar_marcacao'; contexto: ContextoDaConversa }
  | { tipo: 'cancelar_marcacao' }
  | { tipo: 'chamar_humano' }
  | { tipo: 'consultar_marcacao' };

export interface Resposta {
  estado: Estado;
  contexto: ContextoDaConversa;
  /** O que dizer. Texto simples; o adaptador decide se vira botões. */
  texto: string;
  /** Opções para botões ou lista interativa. */
  opcoes?: string[];
  necessidade: Necessidade;
}

export interface EntradaDoTurno {
  estado: Estado;
  contexto: ContextoDaConversa;
  mensagem: string;
  catalogo: CatalogoDoTenant;
  agora: Date;
  /** Já foi extraída por um LLM? Se não, extrai-se aqui. */
  intencao?: IntencaoExtraida;
  nomeDaEmpresa: string;
}

/** Junta o que a mensagem trouxe ao que a conversa já sabia. */
function fundir(contexto: ContextoDaConversa, i: IntencaoExtraida): ContextoDaConversa {
  return {
    ...contexto,
    // O que vem agora ganha ao que estava: quem corrige uma escolha espera que
    // a correção valha.
    servico: i.servico ?? contexto.servico ?? null,
    profissional: i.profissional ?? contexto.profissional ?? null,
    data: i.data ?? contexto.data ?? null,
    periodo: i.periodo ?? contexto.periodo ?? null,
    horaMinima: i.horaMinima ?? contexto.horaMinima ?? null,
  };
}

/** A pessoa escolheu uma das horas oferecidas? */
function slotEscolhido(mensagem: string, contexto: ContextoDaConversa): string | null {
  const oferecidos = contexto.slotsOferecidos ?? [];
  if (oferecidos.length === 0) return null;

  const t = mensagem.toLowerCase().trim();

  // Pela hora: "as 15:30", "15h30", "15:30"
  for (const slot of oferecidos) {
    const semDoisPontos = slot.hora.replace(':', '');
    if (
      t.includes(slot.hora) ||
      t.includes(slot.hora.replace(':', 'h')) ||
      new RegExp(`\\b${semDoisPontos}\\b`).test(t.replace(/[h:]/g, ''))
    ) {
      return slot.iso;
    }
  }

  // Pela ordem: "a primeira", "o segundo", "2"
  const ordinais = ['primeir', 'segund', 'terceir', 'quart', 'quint'];
  for (let i = 0; i < ordinais.length && i < oferecidos.length; i += 1) {
    if (t.includes(ordinais[i]!)) return oferecidos[i]!.iso;
  }

  const numero = /^(\d)$/.exec(t);
  if (numero) {
    const indice = Number(numero[1]) - 1;
    if (indice >= 0 && indice < oferecidos.length) return oferecidos[indice]!.iso;
  }

  return null;
}

export function proximoTurno(entrada: EntradaDoTurno): Resposta {
  const { estado, mensagem, catalogo, agora, nomeDaEmpresa } = entrada;
  const i = entrada.intencao ?? extrair(mensagem, catalogo, agora);
  const contexto = fundir(entrada.contexto, i);

  // ---------------------------------------------------------------------------
  // Pedir uma pessoa ganha a tudo, a partir de qualquer estado.
  //
  // Não é uma transição entre outras: é a saída de emergência. Alguém que pede
  // ajuda no meio de um formulário não pode ficar preso no formulário.
  // ---------------------------------------------------------------------------
  if (i.intent === 'falar_humano') {
    return {
      estado: 'WAITING_HUMAN',
      contexto,
      texto: 'Com certeza. Vou passar a um colega — dê-nos um momento.',
      necessidade: { tipo: 'chamar_humano' },
    };
  }

  // Enquanto um humano está a atender, o bot cala-se. Responder por cima de uma
  // pessoa é a pior experiência que este produto pode dar.
  if (estado === 'WAITING_HUMAN') {
    return { estado, contexto, texto: '', necessidade: { tipo: 'nenhuma' } };
  }

  if (i.intent === 'cancelar') {
    return {
      estado: 'MANAGING_BOOKING',
      contexto,
      texto: 'Quer mesmo cancelar a marcação? Responda "sim" para confirmar.',
      opcoes: ['Sim, cancelar', 'Não, manter'],
      necessidade: { tipo: 'cancelar_marcacao' },
    };
  }

  if (i.intent === 'consultar_marcacao') {
    return {
      estado: 'MANAGING_BOOKING',
      contexto,
      texto: 'Vou ver a sua marcação.',
      necessidade: { tipo: 'consultar_marcacao' },
    };
  }

  if (i.intent === 'saudacao' && estado === 'NEW') {
    return {
      estado: 'IDENTIFYING_INTENT',
      contexto,
      texto: `Olá! Sou o assistente de ${nomeDaEmpresa}. Quer marcar, alterar ou cancelar?`,
      opcoes: ['Marcar', 'Alterar', 'Cancelar'],
      necessidade: { tipo: 'nenhuma' },
    };
  }

  if (i.intent === 'agradecimento') {
    return {
      estado: 'CLOSED',
      contexto,
      texto: 'De nada! Até breve.',
      necessidade: { tipo: 'nenhuma' },
    };
  }

  // ---------------------------------------------------------------------------
  // Escolher uma das horas oferecidas — antes de tudo o resto, porque um "sim"
  // ou um "15:30" aqui é uma resposta à pergunta anterior, não uma intenção
  // nova.
  // ---------------------------------------------------------------------------
  if (estado === 'SELECTING_SLOT') {
    const escolhido = slotEscolhido(mensagem, contexto);

    if (escolhido) {
      const comSlot = { ...contexto, slotEscolhido: escolhido };
      const hora = contexto.slotsOferecidos?.find((s) => s.iso === escolhido)?.hora ?? '';

      if (!comSlot.nome) {
        return {
          estado: 'COLLECTING_CUSTOMER_DATA',
          contexto: comSlot,
          texto: `Boa. Fica às ${hora}. Qual é o seu nome?`,
          necessidade: { tipo: 'nenhuma' },
        };
      }

      return {
        estado: 'CONFIRMING',
        contexto: comSlot,
        texto: `Confirmo ${comSlot.servico} às ${hora}?`,
        opcoes: ['Confirmar', 'Escolher outra hora'],
        necessidade: { tipo: 'nenhuma' },
      };
    }

    // Não escolheu nenhuma e deu um dia novo: procurar outra vez.
    if (i.data && i.data !== entrada.contexto.data) {
      return pedirSlots(contexto);
    }
  }

  if (estado === 'COLLECTING_CUSTOMER_DATA') {
    const texto = mensagem.trim();

    if (!contexto.nome && texto.length >= 2 && i.intent === 'desconhecido') {
      // Quem responde a "qual é o seu nome?" escreve o nome, e um nome não é
      // uma intenção. Tratar isto como `desconhecido` e voltar a perguntar
      // seria o bot a não ouvir.
      const comNome = { ...contexto, nome: texto };
      return {
        estado: 'CONFIRMING',
        contexto: comNome,
        texto: `Obrigado, ${texto}. Confirmo a marcação?`,
        opcoes: ['Confirmar', 'Cancelar'],
        necessidade: { tipo: 'nenhuma' },
      };
    }
  }

  if (estado === 'CONFIRMING' && i.intent === 'confirmar') {
    return {
      estado: 'BOOKED',
      contexto,
      texto: 'A marcar…',
      necessidade: { tipo: 'criar_marcacao', contexto },
    };
  }

  // ---------------------------------------------------------------------------
  // O caminho da marcação.
  // ---------------------------------------------------------------------------
  if (i.intent === 'marcar' || estado === 'SELECTING_SERVICE' || estado === 'SELECTING_DATE') {
    if (!contexto.servico) {
      return {
        estado: 'SELECTING_SERVICE',
        contexto,
        texto: 'Claro. Que serviço pretende?',
        opcoes: [...catalogo.servicos],
        necessidade: { tipo: 'listar_servicos' },
      };
    }

    if (!contexto.data && !i.primeiroDisponivel) {
      return {
        estado: 'SELECTING_DATE',
        contexto,
        texto: `Para ${contexto.servico}. Que dia lhe dá jeito?`,
        opcoes: ['Hoje', 'Amanhã', 'Esta semana'],
        necessidade: { tipo: 'nenhuma' },
      };
    }

    return pedirSlots(contexto);
  }

  if (i.intent === 'precos') {
    return {
      estado: 'IDENTIFYING_INTENT',
      contexto,
      texto: 'Vou buscar a tabela de preços.',
      necessidade: { tipo: 'listar_servicos' },
    };
  }

  if (i.intent === 'horarios' || i.intent === 'morada') {
    return {
      estado: 'IDENTIFYING_INTENT',
      contexto,
      texto: 'Um momento, vou buscar essa informação.',
      necessidade: { tipo: 'nenhuma' },
    };
  }

  // ---------------------------------------------------------------------------
  // Não percebi.
  //
  // Perguntar é sempre melhor do que adivinhar: um bot que assume errado faz a
  // pessoa desfazer, e desfazer numa conversa é muito mais caro do que
  // responder a uma pergunta.
  // ---------------------------------------------------------------------------
  return {
    estado: estado === 'NEW' ? 'IDENTIFYING_INTENT' : estado,
    contexto,
    texto: 'Desculpe, não percebi. Quer marcar, alterar ou cancelar uma marcação?',
    opcoes: ['Marcar', 'Alterar', 'Cancelar', 'Falar com alguém'],
    necessidade: { tipo: 'nenhuma' },
  };
}

function pedirSlots(contexto: ContextoDaConversa): Resposta {
  return {
    estado: 'SELECTING_SLOT',
    contexto,
    // O texto não contém horas nenhumas. **O bot nunca inventa
    // disponibilidade** — quem as sabe é o motor, e o adaptador acrescenta-as
    // à resposta depois de as ir buscar.
    texto: 'Vou ver as horas disponíveis.',
    necessidade: {
      tipo: 'procurar_slots',
      servico: contexto.servico ?? '',
      data: contexto.data ?? null,
      profissional: contexto.profissional ?? null,
    },
  };
}

/**
 * A frase com as horas, construída **a partir do que o motor devolveu**.
 *
 * Existe para que haja um só sítio onde as horas viram texto — e para que esse
 * sítio receba os slots como argumento, tornando impossível inventá-los.
 */
export function frasearSlots(
  slots: { iso: string; hora: string }[],
  servico: string,
): { texto: string; opcoes: string[] } {
  if (slots.length === 0) {
    return {
      texto: 'Não tenho horas disponíveis nesse dia. Quer tentar outro?',
      opcoes: ['Outro dia', 'Falar com alguém'],
    };
  }

  const primeiros = slots.slice(0, 5);

  return {
    texto: `Para ${servico}, tenho: ${primeiros.map((s) => s.hora).join(', ')}. Qual prefere?`,
    opcoes: primeiros.map((s) => s.hora),
  };
}

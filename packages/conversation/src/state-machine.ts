import type { CatalogoDoTenant } from './extractor';
import { querRecomecar } from './ciclo-de-vida';
import { nomeDoDia } from './procura-multi-dia';
import { dataFoiVaga, extrair } from './extractor';
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
  horaMaxima?: string | null;
  /** Slots oferecidos, vindos **do motor**. Nunca inventados aqui. */
  slotsOferecidos?: { iso: string; hora: string }[];
  slotEscolhido?: string | null;
  /**
   * A marcação que está a ser mudada de hora.
   *
   * Presente = isto é uma remarcação, não uma marcação nova. É o que faz o
   * mesmo caminho — escolher dia, escolher hora, confirmar — acabar num
   * `reschedule_booking` em vez de criar uma segunda marcação.
   */
  marcacaoAMudar?: string | null;
  /**
   * A data veio de "esta semana" e não de um dia nomeado.
   *
   * Viaja no contexto porque a frase que anuncia as horas é escrita noutro
   * sítio, e sem isto dizia "nesse dia não tenho" a quem nunca nomeou um dia.
   */
  dataVaga?: boolean | null;
  nome?: string | null;
  telefone?: string | null;
}

/** O que o adaptador tem de ir buscar antes de poder responder. */
export type Necessidade =
  | { tipo: 'nenhuma' }
  | { tipo: 'listar_servicos' }
  | { tipo: 'listar_profissionais' }
  | {
      tipo: 'procurar_slots';
      servico: string;
      data: string | null;
      profissional: string | null;
    }
  | { tipo: 'criar_marcacao'; contexto: ContextoDaConversa }
  /** Ir buscar a marcação da pessoa, para depois lhe mudar a hora. */
  /** Que **dias** têm horas — não que horas tem um dia. */
  | { tipo: 'procurar_dias'; servico: string }
  | { tipo: 'preparar_remarcacao' }
  /** Mudar mesmo a hora. A pessoa já escolheu e confirmou. */
  | { tipo: 'executar_remarcacao'; contexto: ContextoDaConversa }
  /** Perguntar. Nada é cancelado por esta. */
  | { tipo: 'cancelar_marcacao' }
  /** Cancelar mesmo. A pessoa já confirmou. */
  | { tipo: 'executar_cancelamento' }
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
function fundir(
  contexto: ContextoDaConversa,
  i: IntencaoExtraida,
  mensagem: string,
): ContextoDaConversa {
  return {
    ...contexto,
    // O que vem agora ganha ao que estava: quem corrige uma escolha espera que
    // a correção valha.
    servico: i.servico ?? contexto.servico ?? null,
    profissional: i.profissional ?? contexto.profissional ?? null,
    data: i.data ?? contexto.data ?? null,
    periodo: i.periodo ?? contexto.periodo ?? null,
    horaMinima: i.horaMinima ?? contexto.horaMinima ?? null,
    horaMaxima: i.horaMaxima ?? contexto.horaMaxima ?? null,
    marcacaoAMudar: contexto.marcacaoAMudar ?? null,
    // Só se reavalia quando a mensagem trouxe uma data: uma resposta que não
    // fala de dias não torna vago o dia que já tinha sido nomeado.
    dataVaga: i.data ? dataFoiVaga(mensagem) : (contexto.dataVaga ?? false),
  };
}

/**
 * A pessoa escolheu uma das horas oferecidas?
 *
 * O `temData` existe por causa do português.
 *
 * **Três dos dias da semana são ordinais**: segunda, quarta e quinta. Com cinco
 * horas na mesa, "Teria para quarta feira?" escolhia a quarta hora — 14:15 —
 * e passava logo a pedir o nome. Aconteceu em produção a 30 de agosto de 2026:
 * a pessoa pediu quarta-feira e ficou com uma marcação a uma hora que nunca viu.
 *
 * A ambiguidade não se resolve por palavras: "a quarta" é mesmo as duas coisas.
 * Resolve-se pelo resto da frase — se dali sai uma data, a mensagem é sobre
 * dias, e os ordinais não se aplicam.
 *
 * A hora explícita continua a ganhar sempre: "14:15" não é ambíguo.
 */
function slotEscolhido(
  mensagem: string,
  contexto: ContextoDaConversa,
  temData: boolean,
): string | null {
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

  // Pela ordem: "a primeira", "o segundo", "2". Só quando a mensagem não fala
  // de dias — ver a nota no topo.
  if (!temData) {
    const ordinais = ['primeir', 'segund', 'terceir', 'quart', 'quint'];
    for (let i = 0; i < ordinais.length && i < oferecidos.length; i += 1) {
      if (t.includes(ordinais[i]!)) return oferecidos[i]!.iso;
    }
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

  /*
   * A resposta a "qual é o seu nome?" é um nome, não um pedido.
   *
   * O DEFEITO QUE ISTO CORRIGE
   *
   * O `fundir` corria sempre, e o extrator procura os nomes da equipa em
   * qualquer mensagem. Um cliente chamado Sérgio, a responder ao pedido do
   * nome numa clínica que tem um profissional chamado Sérgio, via o
   * `profissional` do contexto passar de "Ana Martins" para "Sergio" — e a
   * marcação, que até ali era da Ana, era criada na agenda dele.
   *
   * Aconteceu em produção a 30 de agosto de 2026, com esses nomes exatos.
   *
   * Não é um caso raro: os nomes dos clientes e os da equipa vêm do mesmo
   * conjunto de nomes próprios portugueses. Numa clínica com uma Ana, uma
   * Maria e um João, a colisão é quase certa.
   */
  const aPedirNome = estado === 'COLLECTING_CUSTOMER_DATA' && !entrada.contexto.nome;
  const contexto = aPedirNome ? entrada.contexto : fundir(entrada.contexto, i, mensagem);

  /*
   * Recomeçar do zero.
   *
   * Antes de tudo, e antes até do pedido de humano: quem escreve "esquece" ou
   * "recomeçar" está a dizer que o que se seguiu até aqui não serve, e
   * responder-lhe a partir do contexto antigo é a definição de não ouvir.
   *
   * A expiração automática das 24 horas não chega — quem se enganou no serviço
   * a meio de uma marcação não vai esperar um dia para corrigir. Ver
   * `ciclo-de-vida.ts`.
   */
  if (querRecomecar(mensagem)) {
    return {
      estado: 'IDENTIFYING_INTENT',
      // Contexto vazio: é isso que "recomeçar" quer dizer.
      contexto: {},
      texto: `Comecei de novo. Quer marcar, alterar ou cancelar?`,
      opcoes: ['Marcar', 'Alterar', 'Cancelar'],
      necessidade: { tipo: 'nenhuma' },
    };
  }

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

  /*
   * Remarcar.
   *
   * Segue o mesmo caminho de marcar — escolher dia, escolher hora, confirmar —
   * e acaba num `reschedule_booking` em vez de criar uma segunda marcação. É a
   * distinção que faltava: um pedido de remarcação caía no caminho de marcar e
   * o cliente ficava com duas.
   *
   * O adaptador é que vai buscar a marcação: só ele sabe o telefone de quem
   * está a falar. Aqui só se diz que é preciso.
   */
  if (i.intent === 'remarcar' && !contexto.marcacaoAMudar) {
    return {
      estado: 'SELECTING_DATE',
      contexto,
      texto: 'Vou ver a sua marcação.',
      necessidade: { tipo: 'preparar_remarcacao' },
    };
  }

  /*
   * O "sim" que faltava.
   *
   * O ciclo que se viu em produção: pedir para cancelar dava "Quer mesmo
   * cancelar? Responda sim" — e o "sim" não era tratado por ninguém, caindo no
   * "não percebi". Pior, a opção oferecida chamava-se "Sim, cancelar", que o
   * extrator lia outra vez como intenção de cancelar: a pergunta repetia-se
   * para sempre. O bot desenhava o botão que o punha a andar em círculo.
   *
   * Vem **antes** do `i.intent === 'cancelar'` de propósito: em
   * `MANAGING_BOOKING`, uma mensagem que fale em cancelar é a resposta à
   * pergunta anterior, não um pedido novo.
   */
  if (estado === 'MANAGING_BOOKING') {
    if (i.intent === 'confirmar' || CONFIRMA_CANCELAMENTO.test(mensagem)) {
      return {
        estado: 'CLOSED',
        contexto,
        texto: 'Vou tratar disso.',
        necessidade: { tipo: 'executar_cancelamento' },
      };
    }

    // Qualquer outra coisa é recuar. Não se cancela por dúvida.
    return {
      estado: 'IDENTIFYING_INTENT',
      contexto,
      texto: 'Não cancelei nada. Quer marcar, alterar ou falar com alguém?',
      opcoes: ['Marcar', 'Falar com alguém'],
      necessidade: { tipo: 'nenhuma' },
    };
  }

  if (i.intent === 'cancelar') {
    return {
      estado: 'MANAGING_BOOKING',
      contexto,
      texto: 'Quer mesmo cancelar a marcação? Responda "sim" para confirmar.',
      // Sem a palavra "cancelar" no botão: era ela que reiniciava a pergunta.
      opcoes: ['Sim, confirmo', 'Não, manter'],
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
    const escolhido = slotEscolhido(mensagem, contexto, Boolean(i.data));

    if (escolhido) {
      const comSlot = { ...contexto, slotEscolhido: escolhido };
      const hora = contexto.slotsOferecidos?.find((s) => s.iso === escolhido)?.hora ?? '';

      /*
       * Quem remarca já se identificou.
       *
       * A marcação é dela — encontrámo-la pelo número de telemóvel. Perguntar
       * "qual é o seu nome?" a quem só quer mudar a hora é o bot a não saber
       * com quem está a falar.
       */
      if (!comSlot.nome && !comSlot.marcacaoAMudar) {
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
        texto: comSlot.marcacaoAMudar
          ? `Mudo ${comSlot.servico} para as ${hora}?`
          : `Confirmo ${comSlot.servico} às ${hora}?`,
        opcoes: ['Confirmar', 'Escolher outra hora'],
        necessidade: { tipo: 'nenhuma' },
      };
    }

    // Não escolheu nenhuma e deu um dia novo: procurar outra vez.
    if (i.data && i.data !== entrada.contexto.data) {
      return pedirSlots(contexto);
    }

    /*
     * A pergunta sobre dias ganha ao "outro dia".
     *
     * As duas frases partilham palavras — "quando", "disponível" — e sem esta
     * ordem "que dias tem disponível?" seria lido como "procura noutro dia" e
     * devolvia horas outra vez.
     */
    if (contexto.servico && perguntaPorDias(mensagem)) {
      return {
        estado: 'SELECTING_DATE',
        contexto: { ...contexto, data: null, slotsOferecidos: [] },
        texto: 'Vou ver que dias tenho.',
        necessidade: { tipo: 'procurar_dias', servico: contexto.servico },
      };
    }

    /*
     * "Outro dia", "quando tem?", "o próximo que houver".
     *
     * Sem isto a conversa entrava em ciclo: a mensagem não trazia data nova, o
     * contexto mantinha a antiga, a procura repetia-se igual e saía a mesma
     * frase — vezes seguidas, até a pessoa desistir.
     *
     * Limpar a data faz a procura recomeçar de hoje e varrer os dias à frente.
     * É o que uma pessoa ao balcão faria: olhar para a frente na agenda em vez
     * de repetir "nesse dia não tenho".
     */
    if (querOutroDia(mensagem) || i.primeiroDisponivel) {
      return pedirSlots({ ...contexto, data: null, slotsOferecidos: [] });
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
        texto: `Obrigado, ${texto}. ${resumoDaMarcacao(comNome, agora)} Confirmo?`,
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
      necessidade: contexto.marcacaoAMudar
        ? { tipo: 'executar_remarcacao', contexto }
        : { tipo: 'criar_marcacao', contexto },
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

    /*
     * "Que dias tem disponível?"
     *
     * A pergunta é sobre dias e a resposta era sobre horas: cinco horas de um
     * único dia. Quem pergunta que dias tem, tem restrições de dia — trabalha,
     * viaja, só pode a partir de quinta — e recebia uma resposta que a obrigava
     * a perguntar outra vez.
     */
    if (contexto.servico && perguntaPorDias(mensagem)) {
      return {
        estado: 'SELECTING_DATE',
        contexto,
        texto: 'Vou ver que dias tenho.',
        necessidade: { tipo: 'procurar_dias', servico: contexto.servico },
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

/**
 * A pessoa está a pedir para olhar mais à frente.
 *
 * Deliberadamente largo. O custo de um falso positivo é procurar noutro dia
 * quando não era preciso — a pessoa vê horas e escolhe. O custo de um falso
 * negativo é repetir a mesma frase, que foi o defeito de origem.
 *
 * `String.raw` de propósito: escrever `\b` numa string normal dá o caractere
 * de recuo, não a fronteira de palavra, e a expressão passa a nunca
 * corresponder — silenciosamente.
 */
const PEDE_OUTRO_DIA = new RegExp(
  String.raw`\b(outro dia|outra data|noutro dia|quando|proximo|proxima|qualquer|primeiro|primeira|mais cedo|mais tarde|disponivel|disponiveis|livre|livres|vaga|vagas|tiver|houver)\b`,
);

function querOutroDia(mensagem: string): boolean {
  const t = mensagem
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp(String.raw`[\u0300-\u036f]`, 'g'), '');

  return PEDE_OUTRO_DIA.test(t);
}

/**
 * O que se está prestes a marcar, em palavras.
 *
 * PORQUE É QUE ISTO PASSOU A EXISTIR
 *
 * A confirmação dizia só "Confirmo a marcação?". Quando uma marcação pedida
 * para a Ana foi criada na agenda do Sergio, o cliente não tinha como reparar:
 * a única coisa que lhe foi mostrada antes de confirmar era a palavra
 * "marcação".
 *
 * A correção do defeito é noutro sítio — o nome do cliente já não sobrepõe o
 * profissional. Mas uma confirmação que não diz o que confirma deixa qualquer
 * erro futuro passar em silêncio, e o último momento em que alguém pode travar
 * um engano é este.
 *
 * Só se diz o que se sabe. Um campo em falta desaparece da frase em vez de
 * aparecer vazio.
 */
function resumoDaMarcacao(contexto: ContextoDaConversa, agora: Date): string {
  const partes = [contexto.servico];

  // O dia antes da hora: é o que distingue "amanhã às 9:30" de "hoje às 9:30",
  // e foi a metade que faltou numa conversa real.
  if (contexto.data) partes.push(nomeDoDia(contexto.data, agora.toISOString().slice(0, 10)));

  const hora = contexto.slotsOferecidos?.find((s) => s.iso === contexto.slotEscolhido)?.hora;
  if (hora) partes.push(`às ${hora}`);
  if (contexto.profissional) partes.push(`com ${contexto.profissional}`);

  const ditas = partes.filter(Boolean);
  return ditas.length > 0 ? `${ditas.join(' ')}.` : '';
}

/**
 * As palavras que valem por um "sim" a cancelar.
 *
 * `String.raw` de proposito: escrever a fronteira de palavra numa string
 * normal da o caractere de recuo, e a expressao passa a nunca corresponder —
 * em silencio. Ja aconteceu duas vezes neste ficheiro.
 *
 * Inclui "cancelar" porque a pessoa costuma repetir a palavra ao confirmar, e
 * aqui — dentro de `MANAGING_BOOKING` — isso e a resposta a pergunta, nao um
 * pedido novo.
 */
const CONFIRMA_CANCELAMENTO = new RegExp(
  String.raw`\b(sim|claro|confirmo|confirmar|cancelar|cancela|isso)\b`,
  'i',
);

/**
 * A pergunta é sobre dias?
 *
 * Estreito de propósito: tem de haver a palavra "dia" ou "dias" junto de uma
 * interrogação. "Marcar num dia da próxima semana" não é uma pergunta sobre
 * dias — é um pedido de marcação, e responder-lhe com uma lista de dias seria
 * dar um passo atrás.
 */
const PERGUNTA_DIAS = new RegExp(
  String.raw`\b(que|quais|quando)\b[^?]{0,30}\b(dias?|disponibilidade)\b`,
  'i',
);

function perguntaPorDias(mensagem: string): boolean {
  const t = mensagem.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  return PERGUNTA_DIAS.test(t);
}

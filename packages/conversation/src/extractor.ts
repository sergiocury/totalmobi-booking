import { intencaoSchema, type IntencaoExtraida, type Periodo } from './intent';

/**
 * Extração de intenção **sem** LLM.
 *
 * Não é um substituto pobre do modelo — é a primeira linha, e apanha a maioria
 * do tráfego real. "Bom dia", "obrigada", "quero marcar", "sim", "quero falar
 * com alguém": são metade das mensagens de uma conversa de marcação, e mandar
 * cada uma delas a um modelo é pagar por uma resposta que uma expressão regular
 * dá igual.
 *
 * O LLM entra onde isto falha — frases longas, ambíguas, com erros. Ver
 * `escalar()` no fim.
 *
 * TRÊS RAZÕES PARA ISTO EXISTIR
 *
 * 1. **Custo.** Um lembrete de marcação não pode custar mais em tokens do que
 *    a margem da consulta.
 * 2. **Latência.** Responder "bom dia" em 20 ms em vez de 800.
 * 3. **Funcionar sem chave.** O produto tem de arrancar antes de haver conta
 *    na Anthropic — e continuar a funcionar se a API estiver em baixo.
 *
 * pt-PT E pt-BR
 *
 * "Marcar" e "agendar", "consulta" e "consulta", "telemóvel" e "celular",
 * "pequeno-almoço" e "café da manhã". O produto vende nos dois lados, e um
 * extrator que só entenda um deles falha metade dos clientes.
 */

/** Remove acentos e baixa a caixa. "Sábado" e "sabado" são a mesma palavra. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PADROES: { intent: IntencaoExtraida['intent']; padroes: RegExp[]; peso: number }[] = [
  {
    intent: 'falar_humano',
    // Primeiro na lista de propósito: quem pede uma pessoa não pode ser
    // interpretado como outra coisa, mesmo que a frase também diga "marcar".
    peso: 1,
    padroes: [
      /\b(falar|fala|falo|atendimento|atendente)\b.*\b(pessoa|alguem|humano|humana|rece[cp]ao|secretaria)\b/,
      /\b(quero|queria|posso|pode|preciso)\b.*\bfalar\b/,
      /\bnao\b.*\b(robo|bot|automatico)\b/,
      /\b(passa|passe|transfere|transferir)\b.*\b(pessoa|alguem|humano)\b/,
      /\batendente\b/,
    ],
  },
  {
    intent: 'cancelar',
    peso: 0.95,
    padroes: [
      /\b(cancelar|cancela|cancelo|anular|anula|desmarcar|desmarca|desmarco)\b/,
      /\bnao\b.*\b(vou poder|posso ir|consigo ir|vou conseguir)\b/,
      /\b(desistir|desisto)\b/,
    ],
  },
  {
    intent: 'remarcar',
    peso: 0.95,
    padroes: [
      /\b(remarcar|remarca|remarco|reagendar|reagenda|adiar|adia|mudar|muda|trocar|troca|alterar|altera)\b.*\b(marcacao|consulta|hora|dia|horario|agendamento)\b/,
      /\b(marcacao|consulta|hora|horario|agendamento)\b.*\b(remarcar|reagendar|adiar|mudar|trocar|alterar)\b/,
      /\bpassar\b.*\bpara\b.*\b(outro|outra)\b/,
    ],
  },
  {
    intent: 'marcar',
    peso: 0.9,
    padroes: [
      /\b(marcar|marca|marco|agendar|agenda|agendo|marcacao|agendamento)\b/,
      /\b(queria|quero|gostaria|precisava|preciso|posso|pode|podia|da para|tem)\b.*\b(hora|vaga|consulta|horario|disponibilidade)\b/,
      /\b(ha|tem|teria|havera)\b.*\b(vaga|hora|disponibilidade|disponivel)\b/,
    ],
  },
  {
    intent: 'confirmar',
    peso: 0.85,
    padroes: [
      /^(sim|claro|ok|okay|certo|pode ser|perfeito|isso|exato|exatamente|confirmo|confirmado|combinado|fechado|esta bem|ta bem|tudo bem|pode marcar|👍|✅)\.?!?$/,
      /\b(confirmo|confirmar|confirmado)\b/,
    ],
  },
  {
    intent: 'consultar_marcacao',
    peso: 0.85,
    padroes: [
      /\b(quando|que dia|que horas|a que horas)\b.*\b(e a|é a|tenho|minha|marcada|marcacao|consulta)\b/,
      /\b(ver|consultar|saber)\b.*\b(minha|a minha)\b.*\b(marcacao|consulta|hora)\b/,
    ],
  },
  {
    intent: 'precos',
    peso: 0.85,
    padroes: [
      /\b(preco|precos|custa|custo|quanto|valor|valores|tabela|orcamento)\b/,
    ],
  },
  {
    intent: 'horarios',
    peso: 0.8,
    padroes: [
      /\b(que horas|a que horas|horario de funcionamento|abrem|abre|fecham|fecha|estao abertos|aberto)\b/,
      /\b(funcionam|funciona)\b.*\b(sabado|domingo|feriado)\b/,
    ],
  },
  {
    intent: 'morada',
    peso: 0.8,
    padroes: [
      /\b(onde|morada|endereco|localizacao|fica|ficam|como chego|como se chega|estacionamento)\b/,
    ],
  },
  {
    intent: 'agradecimento',
    peso: 0.7,
    padroes: [/^(obrigad[oa]|obg|valeu|muito obrigad[oa]|agradeco|thanks|ate ja|ate logo|adeus)\.?!?$/],
  },
  {
    intent: 'saudacao',
    peso: 0.6,
    padroes: [/^(ola|olá|oi|bom dia|boa tarde|boa noite|viva|hey|hello|boas)\.?!?$/],
  },
];

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terca-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
};

/** `YYYY-MM-DD` de um `Date`, na hora local de quem chama. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * "sexta" resolve para a **próxima** sexta, não para a de ontem.
 *
 * E se hoje for sexta, "sexta" quer dizer daqui a uma semana — quem diz "sexta"
 * a uma sexta-feira à tarde está a falar da seguinte. Quem quer dizer hoje diz
 * "hoje".
 */
export function proximoDiaDaSemana(alvo: number, agora: Date): string {
  const d = new Date(agora);
  const delta = (alvo - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return iso(d);
}

export function extrairData(texto: string, agora: Date): string | null {
  const t = normalizar(texto);

  if (/\bhoje\b/.test(t)) return iso(agora);

  // **A ordem importa.** "depois de amanhã" contém "amanhã": testar o curto
  // primeiro dava sempre um dia a menos, e um erro destes só se descobre numa
  // marcação feita no dia errado.
  if (/\bdepois d[e']?\s?amanha\b/.test(t)) {
    const d = new Date(agora);
    d.setDate(d.getDate() + 2);
    return iso(d);
  }

  if (/\bamanha\b/.test(t)) {
    const d = new Date(agora);
    d.setDate(d.getDate() + 1);
    return iso(d);
  }

  // "dia 27", "no dia 3"
  const diaDoMes = /\bdia (\d{1,2})\b/.exec(t);
  if (diaDoMes) {
    const dia = Number(diaDoMes[1]);
    const d = new Date(agora);
    d.setDate(dia);
    // Um dia já passado refere-se ao mês seguinte: a 28 de agosto, "dia 3" é
    // setembro.
    if (d < agora) d.setMonth(d.getMonth() + 1);
    return iso(d);
  }

  // "27/08" ou "27-08"
  const dataCurta = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t);
  if (dataCurta) {
    const dia = Number(dataCurta[1]);
    const mes = Number(dataCurta[2]) - 1;
    const ano = dataCurta[3]
      ? Number(dataCurta[3].length === 2 ? `20${dataCurta[3]}` : dataCurta[3])
      : agora.getFullYear();
    const d = new Date(ano, mes, dia);
    if (!dataCurta[3] && d < agora) d.setFullYear(d.getFullYear() + 1);
    return iso(d);
  }

  for (const [nome, numero] of Object.entries(DIAS_SEMANA)) {
    if (new RegExp(`\\b${nome}\\b`).test(t)) {
      return proximoDiaDaSemana(numero, agora);
    }
  }

  return null;
}

export function extrairPeriodo(texto: string): Periodo | null {
  const t = normalizar(texto);

  if (/\b(manha|manhazinha|de manha|pela manha|cedo)\b/.test(t)) return 'manha';
  if (/\b(tarde|a tarde|de tarde|pela tarde|depois de almoco)\b/.test(t)) return 'tarde';
  if (/\b(noite|a noite|de noite|ao fim do dia|fim da tarde|depois do trabalho)\b/.test(t)) {
    return 'noite';
  }

  return null;
}

/** "depois das 15", "a partir das 14h30", "antes das 12". */
export function extrairLimitesDeHora(texto: string): {
  minima: string | null;
  maxima: string | null;
} {
  const t = normalizar(texto);

  const hora = (h: string, m?: string) =>
    `${String(Number(h)).padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;

  let minima: string | null = null;
  let maxima: string | null = null;

  const depois = /\b(?:depois|apos|a partir|partir)\s*(?:das|de|dos)?\s*(\d{1,2})(?:[h:.](\d{2}))?/.exec(t);
  if (depois) minima = hora(depois[1]!, depois[2]);

  const antes = /\b(?:antes|ate)\s*(?:das|de|dos|as)?\s*(\d{1,2})(?:[h:.](\d{2}))?/.exec(t);
  if (antes) maxima = hora(antes[1]!, antes[2]);

  // "às 15", "às 15h30" — hora exata, que é mínimo e máximo ao mesmo tempo.
  if (!minima && !maxima) {
    const exata = /\b(?:as|para as|pelas)\s*(\d{1,2})(?:[h:.](\d{2}))?\b/.exec(t);
    if (exata) {
      minima = hora(exata[1]!, exata[2]);
      maxima = minima;
    }
  }

  return { minima, maxima };
}

/**
 * O nome de um serviço ou profissional, procurado no catálogo do tenant.
 *
 * Compara-se contra o que a empresa **tem**, não contra uma lista de palavras
 * do mundo. É isto que faz "Dra. Ana" de outra clínica não resolver para nada.
 */
export function encontrarNoCatalogo(texto: string, catalogo: readonly string[]): string | null {
  const t = normalizar(texto);

  // Do mais longo para o mais curto: "limpeza dentária" antes de "limpeza", e
  // "João" antes de "Jo". Quem tem nome mais específico ganha.
  const ordenado = [...catalogo].sort((a, b) => b.length - a.length);

  for (const nome of ordenado) {
    const n = normalizar(nome);
    if (n.length === 0) continue;

    /*
     * O nome inteiro, como palavra.
     *
     * Isto começava em `if (n.length < 3) continue`, e por isso um profissional
     * chamado **Jo** nunca era encontrado: duas letras, saía antes de ser
     * testado. Quem escrevia "com o Jo" recebia as horas de toda a gente e
     * acabava marcado com outra pessoa.
     *
     * O limite existia para evitar falsos positivos de um `includes` — "jo"
     * apanharia "hoje". A fronteira de palavra resolve isso sem excluir nomes
     * curtos: `jo` não casa dentro de "hoje" nem dentro de "João".
     *
     * E é nos dois sentidos: com o texto "com o João", o candidato "Jo" também
     * não casa, porque a seguir vem letra. A ordem por comprimento e a
     * fronteira, juntas, desambiguam os dois nomes.
     */
    if (comoPalavra(n).test(t)) return nome;

    /*
     * O nome inteiro como subcadeia.
     *
     * Serve o caso em que a pessoa escreve mais do que o nome tem — "limpeza
     * dentaria profunda". A partir de três letras: abaixo disso uma subcadeia
     * apanha demasiada coisa, e para esses a fronteira acima já respondeu.
     */
    if (n.length >= 3 && t.includes(n)) return nome;

    // Sem o título, para "Dra. Ana Martins" se apanhar com "com a Ana".
    const semTitulo = n
      .split(' ')
      .map((p) => p.replace(/\.$/, ''))
      .filter((p) => p.length > 0 && !/^(dra?|sra?)$/.test(p));

    // O primeiro nome conta a partir de **duas** letras, com fronteira. Ana,
    // Rui, Eva, Zé e Jo são nomes próprios comuns dos dois lados do Atlântico.
    const primeiro = semTitulo[0];
    if (primeiro && primeiro.length >= 2 && comoPalavra(primeiro).test(t)) {
      return nome;
    }

    // Os restantes só a partir de quatro: apelidos curtos dão falsos positivos.
    for (const palavra of semTitulo.slice(1)) {
      if (palavra.length >= 4 && comoPalavra(palavra).test(t)) return nome;
    }
  }

  return null;
}

/**
 * O termo como palavra inteira, com os caracteres especiais escapados.
 *
 * Sem o escape, um nome com ponto ou parêntese — "Dr. Silva (pediatria)" — não
 * dava falso positivo: dava **exceção**, e a mensagem inteira ficava sem
 * extração nenhuma. Um nome de profissional é texto que o cliente escreve, e
 * texto que o cliente escreve nunca entra numa expressão regular em cru.
 */
const ESPECIAIS_DE_REGEX = /[.*+?^${}()|[\]\\]/g;

function comoPalavra(termo: string): RegExp {
  return new RegExp(String.raw`\b${termo.replace(ESPECIAIS_DE_REGEX, String.raw`\$&`)}\b`);
}

export interface CatalogoDoTenant {
  servicos: readonly string[];
  profissionais: readonly string[];
}

/**
 * Extrair tudo o que se conseguir de uma mensagem.
 *
 * `agora` entra por parâmetro: "amanhã" depende de quando se pergunta, e uma
 * função que leia o relógio não se consegue testar em condições.
 */
export function extrair(
  mensagem: string,
  catalogo: CatalogoDoTenant,
  agora: Date,
): IntencaoExtraida {
  const t = normalizar(mensagem);

  if (t.length === 0) {
    return intencaoSchema.parse({ intent: 'desconhecido', confianca: 0 });
  }

  let melhor: { intent: IntencaoExtraida['intent']; peso: number } | null = null;

  for (const grupo of PADROES) {
    if (grupo.padroes.some((p) => p.test(t))) {
      if (!melhor || grupo.peso > melhor.peso) {
        melhor = { intent: grupo.intent, peso: grupo.peso };
      }
    }
  }

  const servico = encontrarNoCatalogo(mensagem, catalogo.servicos);
  const profissional = encontrarNoCatalogo(mensagem, catalogo.profissionais);
  const data = extrairData(mensagem, agora);
  const periodo = extrairPeriodo(mensagem);
  const { minima, maxima } = extrairLimitesDeHora(mensagem);
  const primeiroDisponivel =
    /\b(primeiro|primeira|mais cedo|quanto antes|assim que|urgente|qualquer)\b.*\b(disponivel|vaga|hora|possivel|que houver|dia)\b/.test(
      t,
    ) || /\b(o mais cedo possivel|quanto antes)\b/.test(t);

  // Nomear um serviço ou uma data sem verbo é, quase sempre, querer marcar.
  // "Limpeza dentária na sexta" não tem verbo nenhum e é evidente.
  if (!melhor && (servico || data || periodo)) {
    melhor = { intent: 'marcar', peso: 0.55 };
  }

  // Cada dado concreto sobe a confiança: quem diz o serviço **e** o dia deixa
  // menos margem para engano do que quem diz só "queria marcar".
  const extras = [servico, profissional, data, periodo, minima].filter(Boolean).length;
  const confianca = melhor ? Math.min(0.99, melhor.peso + extras * 0.02) : 0.1;

  // **Devolver sempre o que se extraiu, mesmo sem intenção reconhecida.**
  //
  // A primeira versão saía aqui com um objeto vazio quando nenhum padrão batia,
  // e deitava fora a hora e o serviço que já tinha encontrado. "a partir das
  // 14h30" é a resposta típica a "a que horas lhe dá jeito?": não tem verbo
  // nenhum e traz a informação toda.
  return intencaoSchema.parse({
    intent: melhor?.intent ?? 'desconhecido',
    servico,
    profissional,
    data,
    periodo,
    horaMinima: minima,
    horaMaxima: maxima,
    primeiroDisponivel,
    confianca,
  });
}

/**
 * Vale a pena gastar uma chamada ao modelo?
 *
 * Só quando o extrator não percebeu **e** a mensagem tem substância. Mandar
 * "asdfgh" a um LLM é queimar dinheiro para receber `desconhecido` na mesma.
 */
export function escalar(intencao: IntencaoExtraida, mensagem: string): boolean {
  if (intencao.intent !== 'desconhecido' && intencao.confianca >= 0.6) return false;

  const palavras = normalizar(mensagem).split(' ').filter((p) => p.length > 1);
  return palavras.length >= 3;
}

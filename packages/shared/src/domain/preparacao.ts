/**
 * Quando é que uma empresa está pronta para receber marcações.
 *
 * UMA DEFINIÇÃO, DOIS SÍTIOS
 *
 * O painel diz ao dono o que falta; a página pública decide se mostra o
 * formulário ou um aviso. Se cada um decidisse por si, divergiam — e a forma
 * dessa divergência seria sempre a pior possível: o painel a dizer «está tudo
 * pronto» e a página a não oferecer hora nenhuma.
 *
 * Este projeto já pagou esse preço uma vez, na fita das semanas, onde a barra
 * de resumo contava seis dias alterados e a grelha desenhava cinco. A correção
 * foi a mesma que está aqui: uma função, dois consumidores.
 *
 * PORQUÊ ESTES CINCO E NÃO TRÊS
 *
 * A porta da página pública era `serviços > 0 && unidade`. Não chegava. Uma
 * clínica com unidade e serviço mas sem ninguém que o execute — ou com equipa
 * mas sem horários — passava na porta, mostrava o formulário, e não devolvia
 * hora nenhuma. Um formulário vazio é pior do que um aviso honesto: parece
 * avariado em vez de parecer por abrir.
 *
 * O motor de disponibilidade precisa dos cinco. Faltando um, não há hora
 * possível — e é melhor dizê-lo do que deixar alguém procurá-la.
 */

/** O que se conta na base para saber se há caminho até uma hora livre. */
export interface SinaisDePreparacao {
  /** Unidades ativas — onde se atende. */
  unidades: number;
  /** Serviços ativos e marcáveis online. */
  servicos: number;
  /** Profissionais ativos que aceitam marcação online. */
  profissionais: number;
  /** Ligações ativas entre profissional e serviço. */
  ligacoes: number;
  /** Linhas de horário de trabalho. */
  horarios: number;
}

export type ChaveDePasso = 'unidades' | 'servicos' | 'equipa' | 'ligacoes' | 'horarios';

export interface PassoDePreparacao {
  chave: ChaveDePasso;
  titulo: string;
  /** Porque é que este passo existe, na linguagem de quem gere a clínica. */
  porque: string;
  /** O caminho no painel, sem o prefixo da empresa. */
  caminho: string;
  feito: boolean;
}

export interface Preparacao {
  passos: PassoDePreparacao[];
  emFalta: PassoDePreparacao[];
  /** Verdadeiro só quando todos os passos estão feitos. */
  pronta: boolean;
  /** Quantos passos estão feitos, para uma barra de progresso. */
  feitos: number;
}

/**
 * A ordem é a ordem de trabalho, não a ordem alfabética.
 *
 * Não se marcam serviços a ninguém antes de haver serviços, e não se dão
 * horários a uma equipa que ainda não existe. Quem seguir a lista de cima para
 * baixo nunca fica bloqueado a meio de um passo.
 */
export function preparacao(sinais: SinaisDePreparacao): Preparacao {
  const passos: PassoDePreparacao[] = [
    {
      chave: 'unidades',
      titulo: 'Criar a unidade',
      porque: 'Onde se atende, com morada e fuso horário. As horas dependem do fuso.',
      caminho: 'unidades',
      feito: sinais.unidades > 0,
    },
    {
      chave: 'servicos',
      titulo: 'Acrescentar serviços',
      porque: 'O que se marca, quanto tempo demora e quanto custa.',
      caminho: 'servicos',
      feito: sinais.servicos > 0,
    },
    {
      chave: 'equipa',
      titulo: 'Acrescentar a equipa',
      porque: 'Quem atende. Sem pelo menos uma pessoa não há agenda para preencher.',
      caminho: 'equipa',
      feito: sinais.profissionais > 0,
    },
    {
      chave: 'ligacoes',
      titulo: 'Dizer quem faz o quê',
      porque: 'Um serviço que ninguém executa nunca aparece com horas disponíveis.',
      caminho: 'equipa',
      feito: sinais.ligacoes > 0,
    },
    {
      chave: 'horarios',
      titulo: 'Definir horários',
      porque: 'As horas oferecidas saem daqui. Sem horários, a agenda fica vazia.',
      caminho: 'horarios',
      feito: sinais.horarios > 0,
    },
  ];

  const emFalta = passos.filter((p) => !p.feito);

  return {
    passos,
    emFalta,
    pronta: emFalta.length === 0,
    feitos: passos.length - emFalta.length,
  };
}

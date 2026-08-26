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
 *
 * OS SINAIS SÃO CONTAGENS EXATAS, NÃO «PELO MENOS UM»
 *
 * Duas vezes a mesma lição, pelo mesmo motivo. `ligacoes > 0` dava o passo por
 * feito com uma clínica de dois profissionais em que só um estava ligado a um
 * serviço — e o segundo não aparecia na página pública, sem aviso nenhum, nem
 * sequer no seletor de profissional, que se esconde quando sobra um só.
 *
 * Um sinal que responde «pelo menos um» a uma pergunta sobre «todos» está a
 * responder a outra pergunta.
 *
 * O PASSO DOS HORÁRIOS SÃO DUAS TABELAS, NÃO UMA
 *
 * A primeira versão desta função contava só `staff_working_hours` e dava o
 * passo por feito. O motor exige também `location_business_hours` — se a
 * unidade não tem horário de abertura, o dia fecha com `no_location_hours` por
 * mais que a equipa tenha horário.
 *
 * Aconteceu a sério: a 26/08 uma empresa saiu do assistente com cinco linhas de
 * horário de equipa, zero de unidade, o painel a dizer «tudo pronto» e a página
 * pública a responder «Fechado neste dia» a todas as datas. Foi exatamente a
 * divergência que esta função existe para impedir — só que desta vez estava
 * dentro dela.
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
  /**
   * Profissionais que aceitam marcação online e não executam serviço nenhum.
   *
   * Contam-se à parte porque `ligacoes > 0` é um sinal grosseiro: satisfaz-se
   * com **uma** ligação, e uma clínica com cinco pessoas e uma ligação passava
   * na verificação com quatro profissionais invisíveis.
   *
   * Invisíveis mesmo: a página pública só oferece quem executa o serviço
   * escolhido, e o seletor de profissional nem aparece quando sobra um só. Do
   * lado de fora não há nada a indicar que existem mais pessoas.
   */
  profissionaisSemServico: number;
  /**
   * Profissionais que aceitam marcação online e não têm horário nenhum.
   *
   * O mesmo problema pelo outro lado. Uma pessoa acrescentada depois de o
   * horário estar definido — pela página de Equipa, ou por se voltar ao
   * assistente — fica sem horário, e uma pessoa sem horário nunca tem uma hora
   * livre para oferecer.
   *
   * O sinal `horarios` não apanha isto: conta linhas, e as linhas das outras
   * pessoas já lá estavam.
   */
  profissionaisSemHorario: number;
  /**
   * Profissionais com serviço **e** horário — os que podem mesmo receber uma
   * marcação hoje.
   *
   * É o único sinal que a porta pública consulta. Ver `podeMarcar`.
   */
  profissionaisProntos: number;
  /** Linhas de horário de trabalho da equipa. */
  horarios: number;
  /**
   * Linhas de horário de abertura da unidade.
   *
   * Separado dos horários da equipa de propósito, porque o motor exige os dois
   * e são coisas diferentes: a unidade abre das 8h às 20h, a Dra. Ana trabalha
   * das 9h às 13h. A disponibilidade é a interseção.
   */
  horariosDaUnidade: number;
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
 * A porta da página pública: **alguém consegue marcar alguma coisa?**
 *
 * DUAS PERGUNTAS DIFERENTES, E EU ESTAVA A USAR UMA FUNÇÃO SÓ
 *
 * `preparacao()` responde a «está tudo configurado?» — é a lista do dono, e
 * tem de ser exigente: se a Maria não executa serviço nenhum, isso é um recado
 * que alguém tem de ver.
 *
 * Esta responde a «um cliente consegue marcar agora?», e tem de ser permissiva
 * pela mesma razão que a outra é exigente. Uma clínica com cinco profissionais,
 * quatro deles prontos, recebe marcações. Fechar a página por causa do quinto
 * é castigar o cliente por uma tarefa do dono.
 *
 * Era o que acontecia a 26/08: tudo configurado menos uma pessoa por ligar, e a
 * página pública a dizer «Marcação online indisponível» a toda a gente.
 *
 * O erro não foi nenhum dos sinais — foi usar a mesma resposta para as duas
 * perguntas. As duas funções partilham os sinais e divergem no critério, que é
 * o que se queria desde o início.
 */
export function podeMarcar(sinais: SinaisDePreparacao): boolean {
  return (
    sinais.unidades > 0 &&
    sinais.servicos > 0 &&
    sinais.horariosDaUnidade > 0 &&
    // Basta um. Quem estiver pronto atende; quem não estiver aparece na lista
    // do dono, não na cara do cliente.
    sinais.profissionaisProntos > 0
  );
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
      porque:
        'Um serviço que ninguém executa nunca aparece com horas. E um profissional sem ' +
        'serviços nunca aparece para ser escolhido.',
      caminho: 'equipa',
      feito: sinais.ligacoes > 0 && sinais.profissionaisSemServico === 0,
    },
    {
      chave: 'horarios',
      titulo: 'Definir horários',
      porque:
        'A que horas abre a unidade e quem trabalha quando. As horas oferecidas são a ' +
        'interseção das duas coisas, e quem não tiver horário não recebe marcações.',
      caminho: 'horarios',
      // As duas tabelas, e ninguém de fora. Ver as notas nos dois sinais.
      feito:
        sinais.horarios > 0 &&
        sinais.horariosDaUnidade > 0 &&
        sinais.profissionaisSemHorario === 0,
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

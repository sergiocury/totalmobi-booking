import { describe, expect, it } from 'vitest';

import { preparacao, type SinaisDePreparacao } from './preparacao';

const nada: SinaisDePreparacao = {
  unidades: 0,
  servicos: 0,
  profissionais: 0,
  ligacoes: 0,
  horarios: 0,
  horariosDaUnidade: 0,
  profissionaisSemServico: 0,
};

const tudo: SinaisDePreparacao = {
  unidades: 1,
  servicos: 3,
  profissionais: 2,
  ligacoes: 4,
  horarios: 10,
  horariosDaUnidade: 5,
  profissionaisSemServico: 0,
};

describe('preparacao', () => {
  it('uma empresa acabada de criar não está pronta e tem tudo por fazer', () => {
    const r = preparacao(nada);

    expect(r.pronta).toBe(false);
    expect(r.feitos).toBe(0);
    expect(r.emFalta).toHaveLength(r.passos.length);
  });

  it('com tudo configurado, está pronta', () => {
    const r = preparacao(tudo);

    expect(r.pronta).toBe(true);
    expect(r.emFalta).toEqual([]);
    expect(r.feitos).toBe(r.passos.length);
  });

  /**
   * O caso que motivou esta função.
   *
   * A porta antiga da página pública era `serviços > 0 && unidade`. Esta
   * empresa passava nela, mostrava o formulário de marcação, e não tinha uma
   * única hora para oferecer — ninguém executa o serviço e ninguém tem
   * horário.
   */
  it('unidade e serviços não chegam: sem ligações nem horários não está pronta', () => {
    const r = preparacao({ ...nada, unidades: 1, servicos: 2 });

    expect(r.pronta).toBe(false);
    expect(r.emFalta.map((p) => p.chave)).toEqual(['equipa', 'ligacoes', 'horarios']);
  });

  /**
   * O caso de 26/08, segunda parte.
   *
   * Uma clínica com dois profissionais e uma ligação. `ligacoes > 0` dava o
   * passo por feito, e a segunda pessoa não aparecia na página pública — nem
   * sequer no seletor de profissional, que se esconde quando sobra um só a
   * executar o serviço escolhido. Ninguém era avisado de nada.
   */
  it('um profissional sem serviços impede a preparação, mesmo havendo ligações', () => {
    const r = preparacao({ ...tudo, ligacoes: 1, profissionaisSemServico: 1 });

    expect(r.pronta).toBe(false);
    expect(r.emFalta.map((p) => p.chave)).toEqual(['ligacoes']);
  });

  it('equipa sem serviços atribuídos não está pronta', () => {
    const r = preparacao({ ...tudo, ligacoes: 0 });

    expect(r.pronta).toBe(false);
    expect(r.emFalta.map((p) => p.chave)).toEqual(['ligacoes']);
  });

  it('tudo menos horários da equipa não está pronta', () => {
    const r = preparacao({ ...tudo, horarios: 0 });

    expect(r.pronta).toBe(false);
    expect(r.emFalta.map((p) => p.chave)).toEqual(['horarios']);
  });

  /**
   * O caso de 26/08.
   *
   * O assistente gravava só os horários da equipa. Isto dava o passo por feito,
   * o painel dizia «tudo pronto», e a página pública respondia «Fechado neste
   * dia» a todas as datas — porque o motor fecha com `no_location_hours` se a
   * unidade não tiver horário de abertura.
   */
  it('horários de equipa sem horário de abertura da unidade não chegam', () => {
    const r = preparacao({ ...tudo, horariosDaUnidade: 0 });

    expect(r.pronta).toBe(false);
    expect(r.emFalta.map((p) => p.chave)).toEqual(['horarios']);
  });

  /**
   * A ordem é a ordem de trabalho. Quem seguir a lista de cima para baixo
   * nunca fica bloqueado a meio de um passo — não se atribuem serviços a
   * ninguém antes de haver serviços e pessoas.
   */
  it('a ordem dos passos é a ordem em que se fazem', () => {
    expect(preparacao(nada).passos.map((p) => p.chave)).toEqual([
      'unidades',
      'servicos',
      'equipa',
      'ligacoes',
      'horarios',
    ]);
  });

  it('cada passo diz para onde ir e porquê', () => {
    for (const passo of preparacao(nada).passos) {
      expect(passo.caminho, `${passo.chave} sem caminho`).not.toBe('');
      expect(passo.porque.length, `${passo.chave} sem explicação`).toBeGreaterThan(20);
    }
  });

  it('feitos e emFalta somam sempre o total de passos', () => {
    const casos: SinaisDePreparacao[] = [
      nada,
      tudo,
      { ...nada, unidades: 1 },
      { ...tudo, servicos: 0 },
      { ...tudo, profissionais: 0, ligacoes: 0 },
    ];

    for (const caso of casos) {
      const r = preparacao(caso);
      expect(r.feitos + r.emFalta.length).toBe(r.passos.length);
    }
  });

  /**
   * Há dois tipos de sinal, e convém dizê-lo em voz alta.
   *
   * Quase todos contam coisas que **têm de existir**: unidades, serviços,
   * pessoas, horários. `profissionaisSemServico` conta o contrário — um
   * problema — e por isso o seu valor bom é zero.
   *
   * Este teste existia numa versão que percorria todas as chaves e punha cada
   * uma a zero à espera que isso bloqueasse. Deixou de servir no dia em que
   * entrou um sinal invertido, e falhou. Fica separado por tipo: se alguém
   * acrescentar um sinal e não o classificar, a soma no fim não bate.
   */
  it('cada sinal que tem de existir bloqueia quando está a zero', () => {
    const temDeExistir = [
      'unidades',
      'servicos',
      'profissionais',
      'ligacoes',
      'horarios',
      'horariosDaUnidade',
    ] as const;

    for (const chave of temDeExistir) {
      expect(preparacao({ ...tudo, [chave]: 0 }).pronta, `${chave} não bloqueia`).toBe(false);
    }
  });

  it('cada sinal que conta problemas bloqueia quando é maior do que zero', () => {
    const contaProblemas = ['profissionaisSemServico'] as const;

    for (const chave of contaProblemas) {
      expect(preparacao({ ...tudo, [chave]: 1 }).pronta, `${chave} não bloqueia`).toBe(false);
    }
  });

  it('os dois tipos juntos cobrem todos os sinais', () => {
    const temDeExistir = [
      'unidades',
      'servicos',
      'profissionais',
      'ligacoes',
      'horarios',
      'horariosDaUnidade',
    ];
    const contaProblemas = ['profissionaisSemServico'];

    expect([...temDeExistir, ...contaProblemas].sort()).toEqual(Object.keys(tudo).sort());
  });
});

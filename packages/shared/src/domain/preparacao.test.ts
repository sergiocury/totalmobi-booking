import { describe, expect, it } from 'vitest';

import { preparacao, type SinaisDePreparacao } from './preparacao';

const nada: SinaisDePreparacao = {
  unidades: 0,
  servicos: 0,
  profissionais: 0,
  ligacoes: 0,
  horarios: 0,
  horariosDaUnidade: 0,
};

const tudo: SinaisDePreparacao = {
  unidades: 1,
  servicos: 3,
  profissionais: 2,
  ligacoes: 4,
  horarios: 10,
  horariosDaUnidade: 5,
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

  it('só está pronta quando nenhum sinal está a zero', () => {
    const chaves = Object.keys(nada) as (keyof SinaisDePreparacao)[];

    // Tirar qualquer um dos sinais chega para deixar de estar pronta. Se um dia
    // alguém acrescentar um sinal que não é lido por passo nenhum, isto falha.
    for (const chave of chaves) {
      expect(preparacao({ ...tudo, [chave]: 0 }).pronta, `${chave} não bloqueia`).toBe(false);
    }
  });
});

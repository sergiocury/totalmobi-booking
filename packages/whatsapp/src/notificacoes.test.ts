import { describe, expect, it } from 'vitest';

import { comporTextoDaNotificacao, type DadosDaNotificacao } from './notificacoes';

/**
 * A promessa que não tinha nada do outro lado.
 *
 * O assistente dizia "Está marcado. Vai receber a confirmação por aqui." e o
 * trabalhador da fila tinha, escrito à letra, `if (job.channel !== 'email')
 * continue;`. Os jobs de WhatsApp eram reclamados, ignorados, e ficavam presos
 * em `pending` — sem erro nenhum a dizer porquê.
 */

const BASE: DadosDaNotificacao = {
  tipo: 'booking_created',
  para: '+351912345678',
  nomeDoCliente: 'Sofia',
  nomeDaEmpresa: 'Clínica Sorriso',
  servico: 'Limpeza dentária',
  inicio: '2026-09-03T09:00:00.000Z',
  fuso: 'Europe/Lisbon',
  profissional: 'Ana Martins',
  unidade: 'Lisboa — Avenida',
  morada: 'Av. da Liberdade 1',
  urlDeGestao: 'https://booking.totalmobi.pt/m/abc',
};

describe('comporTextoDaNotificacao', () => {
  it('a confirmação diz serviço, quando, com quem e onde', () => {
    const t = comporTextoDaNotificacao(BASE)!;

    expect(t).toContain('Sofia');
    expect(t).toContain('Limpeza dentária');
    expect(t).toContain('Ana Martins');
    expect(t).toContain('Lisboa — Avenida');
    expect(t).toContain('https://booking.totalmobi.pt/m/abc');
  });

  /*
   * A hora é a da unidade, não a do servidor.
   *
   * 09:00 UTC em Lisboa é 10:00. Uma confirmação com a hora errada é pior do
   * que nenhuma: a pessoa fica com uma hora escrita e falha a consulta.
   */
  it('a hora vai no fuso da unidade', () => {
    expect(comporTextoDaNotificacao(BASE)).toContain('10:00');
  });

  it('sem hora não se inventa uma mensagem', () => {
    expect(comporTextoDaNotificacao({ ...BASE, inicio: null })).toBeNull();
  });

  it('o cancelamento não convida a gerir uma marcação que já não existe', () => {
    const t = comporTextoDaNotificacao({ ...BASE, tipo: 'cancelled' })!;

    expect(t).toContain('cancelada');
    expect(t).not.toContain('booking.totalmobi.pt/m/');
  });

  it('o lembrete é curto e diz o que interessa', () => {
    const t = comporTextoDaNotificacao({ ...BASE, tipo: 'reminder' })!;

    expect(t).toContain('embrete');
    expect(t).toContain('Limpeza dentária');
  });

  /*
   * Campos em falta desaparecem da frase.
   *
   * Uma marcação sem profissional atribuído, ou uma empresa sem morada, não
   * pode produzir "Com null" nem uma linha vazia.
   */
  it('o que falta não aparece', () => {
    const t = comporTextoDaNotificacao({
      ...BASE,
      nomeDoCliente: null,
      profissional: null,
      unidade: null,
      morada: null,
      urlDeGestao: null,
    })!;

    expect(t).not.toContain('null');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('Com ');
    expect(t.split('\n').at(-1)?.trim()).not.toBe('');
  });

  it('sem morada, a unidade vai sozinha', () => {
    const t = comporTextoDaNotificacao({ ...BASE, morada: null })!;

    expect(t).toContain('Lisboa — Avenida');
    expect(t).not.toContain('—  ');
  });
});

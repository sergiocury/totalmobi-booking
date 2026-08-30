import { describe, expect, it } from 'vitest';

import { deveRecomecar, HORAS_ATE_EXPIRAR, querRecomecar } from './ciclo-de-vida';

const AGORA = new Date('2026-08-30T12:00:00.000Z');
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

describe('deveRecomecar', () => {
  it('continua a mesma conversa dentro da janela', () => {
    expect(deveRecomecar({ estado: 'SELECTING_SLOT', ultimaEntrada: horasAtras(2) }, AGORA)).toBe(
      false,
    );
  });

  /*
   * O caso que se viu vir a caminho: quem marcou uma limpeza em agosto e volta
   * em outubro continuava na conversa de agosto, com o serviço, a data e as
   * horas antigas no contexto — a responder a um pedido já cumprido.
   */
  it('recomeça passadas 24 horas', () => {
    expect(
      deveRecomecar(
        { estado: 'SELECTING_SLOT', ultimaEntrada: horasAtras(HORAS_ATE_EXPIRAR) },
        AGORA,
      ),
    ).toBe(true);

    expect(deveRecomecar({ estado: 'SELECTING_SLOT', ultimaEntrada: horasAtras(72) }, AGORA)).toBe(
      true,
    );
  });

  it('mesmo à justa dentro da janela, continua', () => {
    const quase = new Date(AGORA.getTime() - (HORAS_ATE_EXPIRAR * 3_600_000 - 60_000));

    expect(deveRecomecar({ estado: 'SELECTING_SLOT', ultimaEntrada: quase }, AGORA)).toBe(false);
  });

  /*
   * Um pedido cumprido não se continua.
   *
   * Quem acabou de marcar e escreve outra vez está a começar assunto novo —
   * retomar deixá-lo-ia a "escolher a hora" de uma marcação que já existe.
   */
  it('recomeça depois de marcar, mesmo que seja logo a seguir', () => {
    expect(deveRecomecar({ estado: 'BOOKED', ultimaEntrada: horasAtras(0.1) }, AGORA)).toBe(true);
    expect(deveRecomecar({ estado: 'CLOSED', ultimaEntrada: horasAtras(0.1) }, AGORA)).toBe(true);
  });

  it('sem entrada nenhuma registada, não há o que retomar', () => {
    expect(deveRecomecar({ estado: 'SELECTING_SLOT', ultimaEntrada: null }, AGORA)).toBe(true);
  });

  /*
   * Um registo com data futura — relógios trocados — não deve provocar um
   * recomeço: deitaria fora uma conversa a decorrer por causa de um relógio.
   */
  it('uma data futura não deita a conversa fora', () => {
    const futuro = new Date(AGORA.getTime() + 3_600_000);

    expect(deveRecomecar({ estado: 'SELECTING_SLOT', ultimaEntrada: futuro }, AGORA)).toBe(false);
  });

  it('esperar num estado a meio não é o mesmo que ter acabado', () => {
    expect(
      deveRecomecar({ estado: 'COLLECTING_CUSTOMER_DATA', ultimaEntrada: horasAtras(1) }, AGORA),
    ).toBe(false);
  });
});

describe('querRecomecar', () => {
  it('reconhece os pedidos claros', () => {
    for (const m of [
      'recomeçar',
      'quero recomeçar',
      'vamos começar de novo',
      'esquece',
      'esqueça isso tudo',
      'menu',
      'voltar ao início',
      'do zero',
    ]) {
      expect(querRecomecar(m), m).toBe(true);
    }
  });

  /*
   * Estreito de propósito, ao contrário do reconhecimento de "outro dia".
   *
   * Um falso positivo aqui deita fora o que a pessoa já disse. Nenhuma destas
   * frases pode custar-lhe o serviço e a data que já escolheu.
   */
  it('não se deixa apanhar por conversa normal', () => {
    for (const m of [
      'quero marcar uma limpeza',
      'pode ser às 15:00',
      'o meu nome é Ana',
      'começa a doer',
      'no início da tarde',
      'sim, confirmo',
    ]) {
      expect(querRecomecar(m), m).toBe(false);
    }
  });
});

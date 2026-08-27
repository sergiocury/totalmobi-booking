import { describe, expect, it } from 'vitest';

import { filtrarPorPreferencia, nomeDoPeriodo } from './preferencia-horaria';

/** Um dia normal de clínica: 09:00 às 19:30, de meia em meia hora. */
const DIA = Array.from({ length: 22 }, (_, i) => {
  const minutos = 9 * 60 + i * 30;
  const hora = `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
  return { iso: `2026-08-31T${hora}:00.000Z`, hora };
});

const horas = (r: { horas: { hora: string }[] }) => r.horas.map((h) => h.hora);

describe('filtrarPorPreferencia', () => {
  it('sem preferência devolve tudo', () => {
    const r = filtrarPorPreferencia(DIA, {});

    expect(r.horas).toHaveLength(DIA.length);
    expect(r.relaxado).toBe(false);
  });

  /**
   * O caso que motivou esta função.
   *
   * "segunda 31 à tarde" devolvia 09:00, 09:15, 09:30 — as primeiras do dia.
   * O extrator tinha percebido "tarde" e guardado no contexto; ninguém o lia.
   */
  it('de tarde não devolve horas da manhã', () => {
    const r = filtrarPorPreferencia(DIA, { periodo: 'tarde' });

    expect(horas(r)[0]).toBe('12:00');
    expect(horas(r).every((h) => h >= '12:00' && h < '18:00')).toBe(true);
    expect(r.relaxado).toBe(false);
  });

  it('de manhã pára ao meio-dia', () => {
    const r = filtrarPorPreferencia(DIA, { periodo: 'manha' });

    expect(horas(r).at(-1)).toBe('11:30');
    expect(horas(r).every((h) => h < '12:00')).toBe(true);
  });

  it('à noite começa às 18:00', () => {
    const r = filtrarPorPreferencia(DIA, { periodo: 'noite' });

    expect(horas(r)[0]).toBe('18:00');
  });

  it('a hora mínima corta o que vem antes', () => {
    const r = filtrarPorPreferencia(DIA, { horaMinima: '15:00' });

    expect(horas(r)[0]).toBe('15:00');
    expect(horas(r).every((h) => h >= '15:00')).toBe(true);
  });

  it('período e hora mínima aplicam-se os dois', () => {
    const r = filtrarPorPreferencia(DIA, { periodo: 'tarde', horaMinima: '16:00' });

    expect(horas(r)[0]).toBe('16:00');
    expect(horas(r).every((h) => h >= '16:00' && h < '18:00')).toBe(true);
  });

  /**
   * Quando o pedido não pode ser cumprido, devolve-se tudo **e diz-se**.
   *
   * Devolver vazio seria mentir — há horas nesse dia. Devolver tudo em silêncio
   * é o defeito de origem. O `relaxado` deixa o adaptador escrever "de tarde não
   * tenho, mas de manhã tenho", que é o que uma pessoa ao balcão diria.
   */
  it('sem nada no período pedido, devolve tudo e assinala', () => {
    const soManha = DIA.filter((s) => s.hora < '12:00');
    const r = filtrarPorPreferencia(soManha, { periodo: 'tarde' });

    expect(r.horas).toHaveLength(soManha.length);
    expect(r.relaxado).toBe(true);
  });

  it('um dia sem horas nenhumas não é "relaxado" — é vazio', () => {
    const r = filtrarPorPreferencia([], { periodo: 'tarde' });

    expect(r.horas).toEqual([]);
    expect(r.relaxado).toBe(false);
  });

  it('não altera a lista que recebe', () => {
    const copia = [...DIA];
    filtrarPorPreferencia(DIA, { periodo: 'tarde' });

    expect(DIA).toEqual(copia);
  });

  it('as fronteiras pertencem ao período que começa', () => {
    // 12:00 é tarde, não manhã. 18:00 é noite, não tarde.
    expect(horas(filtrarPorPreferencia(DIA, { periodo: 'manha' }))).not.toContain('12:00');
    expect(horas(filtrarPorPreferencia(DIA, { periodo: 'tarde' }))).toContain('12:00');
    expect(horas(filtrarPorPreferencia(DIA, { periodo: 'tarde' }))).not.toContain('18:00');
    expect(horas(filtrarPorPreferencia(DIA, { periodo: 'noite' }))).toContain('18:00');
  });
});

describe('nomeDoPeriodo', () => {
  it('dá a forma que entra numa frase', () => {
    expect(nomeDoPeriodo('manha')).toBe('de manhã');
    expect(nomeDoPeriodo('tarde')).toBe('de tarde');
    expect(nomeDoPeriodo('noite')).toBe('à noite');
  });

  it('o que não reconhece não ganha nome', () => {
    expect(nomeDoPeriodo('madrugada')).toBeNull();
    expect(nomeDoPeriodo(null)).toBeNull();
    expect(nomeDoPeriodo(undefined)).toBeNull();
  });
});

describe('um período desconhecido não estraga a resposta', () => {
  it('ignora-se e mostram-se as horas todas', () => {
    // O contexto vem de `jsonb`: pode trazer um valor de outra versão.
    const r = filtrarPorPreferencia(DIA, { periodo: 'madrugada' });

    expect(r.horas).toHaveLength(DIA.length);
    expect(r.relaxado).toBe(false);
  });
});

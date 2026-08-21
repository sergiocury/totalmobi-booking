import { describe, expect, it } from 'vitest';

import { DomainErrorCode } from './errors';
import { e164ToWaId, formatPhoneForDisplay, maskPhone, normalizePhone, waIdToE164 } from './phone';

describe('normalizePhone', () => {
  it('normaliza as várias formas do mesmo número português', () => {
    // Este é o teste que impede clientes duplicados: as quatro entradas são a
    // mesma pessoa e têm de dar exatamente a mesma string.
    const variants = ['+351912345678', '912345678', '00351912345678', '+351 912 345 678'];
    const results = variants.map((v) => normalizePhone(v, 'PT'));

    expect(results.every((r) => r.ok)).toBe(true);
    const values = new Set(results.map((r) => (r.ok ? r.value : 'erro')));
    expect(values).toEqual(new Set(['+351912345678']));
  });

  it('normaliza um número brasileiro', () => {
    const result = normalizePhone('11 98765-4321', 'BR');
    expect(result.ok && result.value).toBe('+5511987654321');
  });

  it('não precisa do país quando o número já traz o indicativo', () => {
    expect(normalizePhone('+351912345678').ok).toBe(true);
    expect(normalizePhone('+5511987654321').ok).toBe(true);
  });

  it('rejeita o que não é um número válido', () => {
    for (const input of ['', '   ', 'abc', '123', '+351 1']) {
      const result = normalizePhone(input, 'PT');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(DomainErrorCode.INVALID_PHONE);
    }
  });

  it('rejeita um número local sem país indicado', () => {
    // Sem contexto, `912345678` é ambíguo: recusar é melhor do que adivinhar
    // e guardar o número de outro país.
    expect(normalizePhone('912345678').ok).toBe(false);
  });
});

describe('conversão wa_id ↔ E.164', () => {
  it('converte o wa_id da Meta, que vem sem +', () => {
    expect(waIdToE164('351912345678').ok && waIdToE164('351912345678').value).toBe(
      '+351912345678',
    );
  });

  it('faz o caminho inverso', () => {
    expect(e164ToWaId('+351912345678')).toBe('351912345678');
  });

  it('rejeita wa_id vazio', () => {
    expect(waIdToE164('').ok).toBe(false);
  });
});

describe('apresentação', () => {
  it('formata para leitura humana', () => {
    expect(formatPhoneForDisplay('+351912345678')).toBe('+351 912 345 678');
  });

  it('devolve a entrada quando não consegue formatar, em vez de rebentar', () => {
    expect(formatPhoneForDisplay('não é um número')).toBe('não é um número');
  });

  it('mascara tudo menos os últimos quatro dígitos', () => {
    expect(maskPhone('+351912345678')).toBe('********5678');
    expect(maskPhone('+12')).toBe('****');
  });
});

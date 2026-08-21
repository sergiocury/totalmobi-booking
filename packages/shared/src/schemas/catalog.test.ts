import { describe, expect, it } from 'vitest';

import {
  createServiceSchema,
  createStaffSchema,
  resolveEffectiveService,
  slugify,
  totalBlockedMinutes,
} from './catalog';

const TENANT = '11111111-1111-4111-8111-111111111111';

describe('slugify', () => {
  it('tira acentos e normaliza', () => {
    expect(slugify('Limpeza Dentária')).toBe('limpeza-dentaria');
    expect(slugify('Barbearia do Zé')).toBe('barbearia-do-ze');
    expect(slugify('Massagem  de   Relaxamento')).toBe('massagem-de-relaxamento');
  });

  it('não deixa hífenes nas pontas', () => {
    expect(slugify('  Corte!  ')).toBe('corte');
    expect(slugify('--- teste ---')).toBe('teste');
  });

  it('trunca aos 50 caracteres do schema', () => {
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(50);
  });
});

describe('createServiceSchema', () => {
  const base = {
    tenantId: TENANT,
    name: 'Limpeza dentária',
    slug: 'limpeza-dentaria',
    durationMinutes: 45,
  };

  it('aceita o mínimo e preenche os valores por omissão', () => {
    const parsed = createServiceSchema.parse(base);
    expect(parsed.capacity).toBe(1);
    expect(parsed.bufferBeforeMinutes).toBe(0);
    expect(parsed.isActive).toBe(true);
    expect(parsed.bookableOnline).toBe(true);
    expect(parsed.requiresConfirmation).toBe(false);
  });

  it('recusa durações impossíveis', () => {
    for (const durationMinutes of [0, 4, 1441, -30]) {
      expect(createServiceSchema.safeParse({ ...base, durationMinutes }).success).toBe(false);
    }
  });

  it('recusa uma promoção acima do preço', () => {
    // Uma "promoção" mais cara que o preço normal é sempre erro de digitação.
    const result = createServiceSchema.safeParse({ ...base, price: 20, promoPrice: 50 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['promoPrice']);
    }
  });

  it('aceita promoção igual ao preço', () => {
    expect(createServiceSchema.safeParse({ ...base, price: 50, promoPrice: 50 }).success).toBe(
      true,
    );
  });

  it('distingue `null` de `0` nas políticas', () => {
    // `null` = herda do tenant; `0` = decisão explícita de não exigir
    // antecedência. Tratá-los como iguais faria um serviço herdar as 2 horas do
    // tenant quando alguém quis mesmo permitir marcação imediata.
    const herda = createServiceSchema.parse({ ...base, minAdvanceMinutes: null });
    const zero = createServiceSchema.parse({ ...base, minAdvanceMinutes: 0 });
    expect(herda.minAdvanceMinutes).toBeNull();
    expect(zero.minAdvanceMinutes).toBe(0);
  });

  it('recusa slug com maiúsculas ou espaços', () => {
    expect(createServiceSchema.safeParse({ ...base, slug: 'Limpeza Dentaria' }).success).toBe(
      false,
    );
  });
});

describe('createStaffSchema', () => {
  it('aceita um profissional sem conta nem contactos', () => {
    // O caso mais comum num salão pequeno: três pessoas na agenda, um só login.
    const parsed = createStaffSchema.parse({ tenantId: TENANT, fullName: 'Marta Ferreira' });
    expect(parsed.acceptsOnlineBooking).toBe(true);
    expect(parsed.concurrentCapacity).toBe(1);
    expect(parsed.priority).toBe(0);
  });

  it('recusa telefone que não esteja em E.164', () => {
    expect(
      createStaffSchema.safeParse({ tenantId: TENANT, fullName: 'Ana', phone: '912345678' })
        .success,
    ).toBe(false);
  });

  it('recusa fuso horário inválido', () => {
    expect(
      createStaffSchema.safeParse({
        tenantId: TENANT,
        fullName: 'Ana',
        timezone: 'Europe/Lisboa',
      }).success,
    ).toBe(false);
  });
});

describe('resolveEffectiveService — o preço que o cliente vê é o que paga', () => {
  const servico = { durationMinutes: 45, price: 65, promoPrice: null };

  it('sem sobreposição, vale o serviço', () => {
    expect(resolveEffectiveService(servico, null)).toEqual({ durationMinutes: 45, price: 65 });
  });

  it('a sobreposição do profissional ganha', () => {
    // A sénior demora menos e leva mais.
    expect(
      resolveEffectiveService(servico, { durationMinutesOverride: 30, priceOverride: 80 }),
    ).toEqual({ durationMinutes: 30, price: 80 });
  });

  it('sobrepõe só a duração, mantendo o preço', () => {
    expect(resolveEffectiveService(servico, { durationMinutesOverride: 60 })).toEqual({
      durationMinutes: 60,
      price: 65,
    });
  });

  it('a promoção do serviço vale quando o profissional não define preço', () => {
    expect(resolveEffectiveService({ ...servico, promoPrice: 50 }, null).price).toBe(50);
  });

  it('o preço do profissional ganha à promoção do serviço', () => {
    // Um preço específico é uma decisão mais recente e mais concreta do que
    // uma promoção geral do catálogo.
    expect(
      resolveEffectiveService({ ...servico, promoPrice: 50 }, { priceOverride: 80 }).price,
    ).toBe(80);
  });

  it('serviço sem preço devolve null, não zero', () => {
    // `0` significa gratuito, o que é uma afirmação. `null` é "por definir".
    expect(resolveEffectiveService({ durationMinutes: 30, price: null }, null).price).toBeNull();
  });
});

describe('totalBlockedMinutes', () => {
  it('soma os buffers à duração', () => {
    expect(totalBlockedMinutes(45, 5, 10)).toBe(60);
  });

  it('sem buffers é a própria duração', () => {
    expect(totalBlockedMinutes(30)).toBe(30);
  });
});

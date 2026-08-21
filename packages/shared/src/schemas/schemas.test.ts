import { describe, expect, it } from 'vitest';

import { hasPermission, roleAtLeast } from '../domain/roles';
import { dateRangeSchema, slugSchema, timezoneSchema } from './common';
import { createTenantSchema, isReservedSlug, RESERVED_SLUGS } from './tenant';
import { createLocationSchema } from './tenancy';

describe('slugSchema', () => {
  it('aceita slugs bem formados', () => {
    for (const slug of ['clinica-sorriso', 'studio-bella', 'abc', 'barbearia-do-ze-2']) {
      expect(slugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it('rejeita o que quebraria um URL', () => {
    for (const slug of ['ab', 'Clinica', 'com espaço', '-inicio', 'fim-', 'dois--hifens', 'acentuação']) {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    }
  });
});

describe('slugs reservados', () => {
  it('bloqueia os que colidiriam com rotas da aplicação', () => {
    for (const slug of ['admin', 'api', 'app', 'console', 'status', 'm', 'widget']) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it('é indiferente a maiúsculas', () => {
    expect(isReservedSlug('ADMIN')).toBe(true);
  });

  it('deixa passar um nome normal', () => {
    expect(isReservedSlug('clinica-sorriso')).toBe(false);
  });

  it('todos os reservados são slugs sintaticamente válidos', () => {
    // Se um reservado não passasse no slugSchema, a lista teria uma entrada
    // morta que nunca chegaria a ser comparada.
    for (const slug of RESERVED_SLUGS) {
      // `m` tem um caractere: é reservado precisamente por causa da rota /m/<token>,
      // e nunca seria aceite como slug de tenant de qualquer forma.
      if (slug.length >= 3) {
        expect(slugSchema.safeParse(slug).success).toBe(true);
      }
    }
  });
});

describe('timezoneSchema', () => {
  it('aceita identificadores IANA', () => {
    expect(timezoneSchema.safeParse('Europe/Lisbon').success).toBe(true);
    expect(timezoneSchema.safeParse('America/Sao_Paulo').success).toBe(true);
  });

  it('aceita as abreviaturas antigas que a tzdata ainda reconhece', () => {
    // `WET` continua a ser uma zona real na base de dados IANA (herança dos
    // nomes antigos da Europa Ocidental), por isso é aceite. Não é a forma que
    // queremos guardar — a UI oferece sempre `Europe/Lisbon` — mas recusá-la
    // seria contrariar a tzdata, e a validação segue a tzdata.
    expect(timezoneSchema.safeParse('WET').success).toBe(true);
  });

  it('rejeita o que não existe na tzdata', () => {
    for (const value of ['Europe/Lisboa', 'Marte/Olympus', 'Horário de Lisboa', '']) {
      expect(timezoneSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('createTenantSchema', () => {
  it('preenche os valores por omissão portugueses', () => {
    const parsed = createTenantSchema.parse({
      slug: 'clinica-sorriso',
      displayName: 'Clínica Sorriso',
      email: 'GERAL@Clinicasorriso.PT',
    });

    expect(parsed.countryCode).toBe('PT');
    expect(parsed.defaultTimezone).toBe('Europe/Lisbon');
    expect(parsed.defaultLocale).toBe('pt-PT');
    expect(parsed.defaultCurrency).toBe('EUR');
    expect(parsed.segment).toBe('other');
    // O email é normalizado para minúsculas na entrada, para o índice único
    // não deixar passar duplicados que só diferem em maiúsculas.
    expect(parsed.email).toBe('geral@clinicasorriso.pt');
  });

  it('rejeita telefone que não esteja em E.164', () => {
    const result = createTenantSchema.safeParse({
      slug: 'teste-abc',
      displayName: 'Teste',
      email: 'a@b.pt',
      phone: '912345678',
    });
    expect(result.success).toBe(false);
  });
});

describe('createLocationSchema', () => {
  it('exige o fuso horário sem valor por omissão herdado em silêncio', () => {
    const semFuso = createLocationSchema.safeParse({
      tenantId: '11111111-1111-4111-8111-111111111111',
      name: 'Lisboa',
      slug: 'lisboa',
    });
    expect(semFuso.success).toBe(false);

    const comFuso = createLocationSchema.safeParse({
      tenantId: '11111111-1111-4111-8111-111111111111',
      name: 'Lisboa',
      slug: 'lisboa',
      timezone: 'Europe/Lisbon',
    });
    expect(comFuso.success).toBe(true);
  });
});

describe('dateRangeSchema', () => {
  it('aceita um intervalo normal', () => {
    expect(dateRangeSchema.safeParse({ from: '2026-08-17', to: '2026-08-24' }).success).toBe(true);
  });

  it('rejeita intervalo invertido', () => {
    expect(dateRangeSchema.safeParse({ from: '2026-08-24', to: '2026-08-17' }).success).toBe(false);
  });

  it('rejeita intervalos absurdos que poriam a base de dados de joelhos', () => {
    expect(dateRangeSchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(false);
  });
});

describe('papéis e permissões', () => {
  it('a hierarquia é staff < manager < tenant_admin', () => {
    expect(roleAtLeast('tenant_admin', 'manager')).toBe(true);
    expect(roleAtLeast('manager', 'staff')).toBe(true);
    expect(roleAtLeast('staff', 'manager')).toBe(false);
  });

  it('o staff não gere membros nem integrações', () => {
    expect(hasPermission('staff', 'members.manage')).toBe(false);
    expect(hasPermission('staff', 'integrations.manage')).toBe(false);
    expect(hasPermission('staff', 'bookings.read.all')).toBe(false);
  });

  it('o manager gere a operação mas não a empresa', () => {
    expect(hasPermission('manager', 'bookings.read.all')).toBe(true);
    expect(hasPermission('manager', 'reports.view')).toBe(true);
    expect(hasPermission('manager', 'members.manage')).toBe(false);
    expect(hasPermission('manager', 'branding.manage')).toBe(false);
  });

  it('o tenant_admin faz tudo dentro do tenant', () => {
    expect(hasPermission('tenant_admin', 'members.manage')).toBe(true);
    expect(hasPermission('tenant_admin', 'settings.manage')).toBe(true);
    expect(hasPermission('tenant_admin', 'bookings.read.own')).toBe(true);
  });
});

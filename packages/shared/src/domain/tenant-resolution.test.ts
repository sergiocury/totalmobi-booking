import { describe, expect, it } from 'vitest';

import {
  SEGMENTOS_RESERVADOS,
  firstSegment,
  isPublicPath,
  normalizeHost,
  resolveTenant,
  type ResolutionInput,
} from './tenant-resolution';

const PLATFORM = ['booking.totalmobi.pt', 'localhost'];

const resolve = (host: string, pathname: string, locale?: string) =>
  resolveTenant({ host, pathname, platformHosts: PLATFORM, ...(locale ? { locale } : {}) } as ResolutionInput);

describe('normalizeHost', () => {
  it('tira a porta e passa a minúsculas', () => {
    expect(normalizeHost('Localhost:3000')).toBe('localhost');
    expect(normalizeHost('Booking.Totalmobi.PT')).toBe('booking.totalmobi.pt');
  });
});

describe('firstSegment', () => {
  it('devolve o primeiro segmento', () => {
    expect(firstSegment('/clinica-sorriso/servicos')).toBe('clinica-sorriso');
  });

  it('salta o prefixo de idioma', () => {
    expect(firstSegment('/pt-PT/clinica-sorriso', 'pt-PT')).toBe('clinica-sorriso');
  });

  it('devolve null na raiz', () => {
    expect(firstSegment('/')).toBeNull();
    expect(firstSegment('/pt-PT', 'pt-PT')).toBeNull();
  });
});

describe('resolveTenant — domínio da plataforma', () => {
  it('trata o primeiro segmento como slug de tenant', () => {
    const r = resolve('booking.totalmobi.pt', '/clinica-sorriso');
    expect(r.source).toBe('path_slug');
    expect(r.identifier).toBe('clinica-sorriso');
    expect(r.requiresSession).toBe(false);
  });

  it('a página pública do tenant nunca exige sessão', () => {
    // É a decisão de produto PD-1: o consumidor marca sem criar conta.
    const r = resolve('booking.totalmobi.pt', '/studio-bella/marcar');
    expect(r.requiresSession).toBe(false);
  });

  it('/app é o painel e exige sessão', () => {
    const r = resolve('booking.totalmobi.pt', '/app/agenda');
    expect(r.source).toBe('none');
    expect(r.identifier).toBeNull();
    expect(r.requiresSession).toBe(true);
    expect(r.isPlatformConsole).toBe(false);
  });

  it('/console é o painel da Totalmobi', () => {
    const r = resolve('booking.totalmobi.pt', '/console/tenants');
    expect(r.isPlatformConsole).toBe(true);
    expect(r.requiresSession).toBe(true);
  });

  it('rotas reservadas não são confundidas com slugs de tenant', () => {
    // Um tenant com slug "api" ou "console" sequestraria a aplicação inteira.
    // A tabela booking.reserved_slugs impede a criação; isto é a segunda linha.
    for (const seg of ['api', 'app', 'console', 'auth', 'login', 'm', 'widget', 'status']) {
      const r = resolve('booking.totalmobi.pt', `/${seg}/qualquer-coisa`);
      expect(r.source).toBe('none');
      expect(r.identifier).toBeNull();
    }
  });

  it('os webhooks nunca exigem sessão nem são redirecionados', () => {
    const r = resolve('booking.totalmobi.pt', '/api/webhooks/whatsapp');
    expect(r.requiresSession).toBe(false);
  });

  it('o link tokenizado do cliente final não exige sessão', () => {
    const r = resolve('booking.totalmobi.pt', '/m/abc123');
    expect(r.source).toBe('none');
    expect(r.requiresSession).toBe(false);
  });

  it('a raiz é contexto de plataforma', () => {
    const r = resolve('booking.totalmobi.pt', '/');
    expect(r.source).toBe('none');
    expect(r.requiresSession).toBe(false);
  });

  it('localhost comporta-se como domínio da plataforma', () => {
    const r = resolve('localhost', '/clinica-sorriso');
    expect(r.source).toBe('path_slug');
    expect(r.identifier).toBe('clinica-sorriso');
  });
});

describe('resolveTenant — domínio próprio do cliente', () => {
  it('resolve o tenant pelo host', () => {
    const r = resolve('agenda.clinicadente.pt', '/');
    expect(r.source).toBe('custom_domain');
    expect(r.identifier).toBe('agenda.clinicadente.pt');
    expect(r.requiresSession).toBe(false);
  });

  it('o primeiro segmento NÃO é slug num domínio próprio', () => {
    // Em agenda.clinicadente.pt/servicos, "servicos" é uma página, não um
    // tenant. Confundir os dois faria a clínica ver a agenda de outra empresa
    // caso existisse um tenant com esse slug.
    const r = resolve('agenda.clinicadente.pt', '/servicos');
    expect(r.source).toBe('custom_domain');
    expect(r.identifier).toBe('agenda.clinicadente.pt');
  });

  it('/app num domínio próprio continua a ser o painel', () => {
    const r = resolve('agenda.clinicadente.pt', '/app/agenda');
    expect(r.source).toBe('custom_domain');
    expect(r.requiresSession).toBe(true);
  });

  it('subdomínio da plataforma não é tratado como domínio próprio', () => {
    const r = resolve('staging.booking.totalmobi.pt', '/clinica-sorriso');
    expect(r.source).toBe('path_slug');
  });
});

describe('isPublicPath', () => {
  it('reconhece os caminhos que dispensam sessão', () => {
    for (const p of ['/api/webhooks/whatsapp', '/api/public/availability', '/login', '/m/tok', '/_next/static/x']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it('o painel não é público', () => {
    expect(isPublicPath('/app/agenda')).toBe(false);
    expect(isPublicPath('/console')).toBe(false);
  });
});

describe('os segmentos reservados cobrem as rotas reais', () => {
  /**
   * O teste que impede a regressão de voltar.
   *
   * Ao ligar o link público, `/marcar` e `/design` passaram a ser tratados como
   * slugs de empresa e devolviam 404 — sem erro, sem aviso, só uma rota que
   * deixou de existir. Este teste lê as pastas de topo da aplicação e exige que
   * cada uma esteja reservada.
   *
   * Lê o disco de propósito. Uma lista escrita à mão dentro do teste seria uma
   * segunda cópia da lista que estamos a verificar.
   */
  it('cada pasta de topo em apps/web/src/app está reservada', async () => {
    const { readdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');

    const raiz = join(process.cwd(), 'apps', 'web', 'src', 'app');
    if (!existsSync(raiz)) {
      // O pacote também corre isolado, fora do monorepo. Aí não há nada a
      // comparar, e falhar seria falhar por uma razão que não é a do teste.
      return;
    }

    const pastas = readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      // As rotas dinâmicas e os grupos não são segmentos literais.
      .filter((e) => !e.name.startsWith('[') && !e.name.startsWith('('))
      .map((e) => e.name);

    const emFalta = pastas.filter((nome) => !SEGMENTOS_RESERVADOS.includes(nome));

    expect(emFalta, `rotas por reservar: ${emFalta.join(', ')}`).toEqual([]);
  });
});

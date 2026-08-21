import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { checkContrast, AA_NON_TEXT, AA_NORMAL_TEXT } from '@totalmobi/shared';

/**
 * O design system tem de cumprir a regra que impõe aos clientes.
 *
 * Este teste existe porque a primeira versão dos tokens **não cumpria**: o
 * `--ink-subtle` dava 3,53:1 sobre branco e o `--brand-soft` dos badges dava
 * 4,35:1 — ambos abaixo dos 4,5:1 exigidos. Passaram despercebidos porque
 * "cinzento suave" parece bem até alguém tentar ler com pouca luz.
 *
 * Lê o CSS a sério em vez de repetir os valores aqui. Duplicá-los faria o teste
 * passar para sempre enquanto o ficheiro real derivava — que é o modo mais
 * comum de um teste de design system se tornar inútil.
 */

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'),
  'utf8',
);

/**
 * Extrai as variáveis de cor de cada tema.
 *
 * `light` = o `:root` de topo. `dark` = o bloco `:root[data-theme='dark']`.
 *
 * O tema deixou de depender de `@media (prefers-color-scheme: dark)` para
 * poder ser trocado dentro da aplicação — o sistema continua a ser respeitado,
 * mas por um script que escreve o atributo antes da primeira pintura.
 */
const DARK_SELECTOR = ":root[data-theme='dark']";

function readTokens(scheme: 'light' | 'dark'): Record<string, string> {
  const darkStart = CSS.indexOf(DARK_SELECTOR);
  if (darkStart < 0) {
    throw new Error(
      `Não encontrei o bloco ${DARK_SELECTOR} em tokens.css. Se o seletor do tema escuro mudou, este teste tem de acompanhar — senão passa a medir o tema claro duas vezes e deixa de provar nada.`,
    );
  }

  const region = scheme === 'light' ? CSS.slice(0, darkStart) : CSS.slice(darkStart);

  const tokens: Record<string, string> = {};
  for (const match of region.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

const SCHEMES = ['light', 'dark'] as const;

describe.each(SCHEMES)('tokens — modo %s', (scheme) => {
  const t = readTokens(scheme);

  it('define todas as cores essenciais', () => {
    for (const key of [
      '--surface',
      '--surface-sunken',
      '--surface-raised',
      '--ink',
      '--ink-muted',
      '--ink-subtle',
      '--brand',
      '--danger',
      '--success',
      '--warning',
    ]) {
      expect(t[key], `falta ${key} no modo ${scheme}`).toBeDefined();
    }
  });

  /**
   * Cada tom de texto contra **todas** as superfícies.
   *
   * A primeira versão só media contra `--surface` e deixou passar o
   * `--ink-subtle` a 4,20:1 dentro dos cartões, que usam `--surface-raised`.
   * No modo escuro a superfície elevada é a mais CLARA — logo é lá que o
   * contraste com um cinzento é pior, e não na base. Medir só uma superfície
   * é medir o caso fácil.
   */
  const TEXTOS = ['--ink', '--ink-muted', '--ink-subtle'] as const;
  const SUPERFICIES = ['--surface', '--surface-sunken', '--surface-raised', '--surface-overlay'] as const;

  const pares = TEXTOS.flatMap((fg) => SUPERFICIES.map((bg) => [fg, bg] as const));

  it.each(pares)('%s sobre %s cumpre AA para texto', (fg, bg) => {
    const check = checkContrast(t[fg]!, t[bg]!, AA_NORMAL_TEXT)!;
    expect(
      check.passes,
      `${fg} (${t[fg]}) sobre ${bg} (${t[bg]}) dá ${check.ratio}:1, mínimo 4.5`,
    ).toBe(true);
  });

  it.each([
    ['--brand', '--surface'],
    ['--brand', '--brand-soft'],
    ['--danger', '--surface'],
    ['--danger', '--danger-soft'],
    ['--success', '--surface'],
    ['--success', '--success-soft'],
    ['--warning', '--surface'],
    ['--warning', '--warning-soft'],
  ])('%s sobre %s cumpre AA — são cores com texto por cima', (fg, bg) => {
    const check = checkContrast(t[fg]!, t[bg]!, AA_NORMAL_TEXT)!;
    expect(
      check.passes,
      `${fg} (${t[fg]}) sobre ${bg} (${t[bg]}) dá ${check.ratio}:1, mínimo 4.5`,
    ).toBe(true);
  });

  // O texto dentro de um botão pintado. A cor tem de acompanhar o modo: no
  // escuro o `--danger` é claro e precisa de texto preto. Um `text-white`
  // escrito no componente dava 2,79:1 e passou despercebido até à auditoria.
  it.each([
    ['--brand-ink', '--brand'],
    ['--danger-ink', '--danger'],
  ])('%s dentro de um botão %s cumpre AA', (ink, fill) => {
    const check = checkContrast(t[ink]!, t[fill]!, AA_NORMAL_TEXT)!;
    expect(check.passes, `${ink} (${t[ink]}) sobre ${fill} (${t[fill]}) dá ${check.ratio}:1`).toBe(
      true,
    );
  });

  it('os contornos são distinguíveis do fundo (1.4.11, 3:1)', () => {
    // `--line-strong` desenha a fronteira dos campos de formulário. Se não se
    // distinguir do fundo, o utilizador não vê onde é para escrever.
    const check = checkContrast(t['--line-strong']!, t['--surface']!, AA_NON_TEXT)!;
    expect(check.passes, `--line-strong sobre --surface dá ${check.ratio}:1, mínimo 3`).toBe(true);
  });
});

describe('coerência entre modos', () => {
  it('o modo escuro inverte a ordem das superfícies', () => {
    // No claro, o elevado é mais claro que o fundo. No escuro é o contrário —
    // manter a lógica do claro produziria cartões que parecem buracos.
    const light = readTokens('light');
    const dark = readTokens('dark');

    const lum = (hex: string) => {
      const check = checkContrast(hex, '#000000')!;
      return check.ratio;
    };

    expect(lum(light['--surface-raised']!)).toBeGreaterThanOrEqual(
      lum(light['--surface-sunken']!),
    );
    expect(lum(dark['--surface-raised']!)).toBeGreaterThanOrEqual(lum(dark['--surface-sunken']!));
  });

  it('respeita prefers-reduced-motion', () => {
    expect(CSS).toContain('prefers-reduced-motion: reduce');
    expect(CSS).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it('o foco é sempre visível', () => {
    expect(CSS).toContain(':focus-visible');
    expect(CSS).toMatch(/outline:\s*2px solid/);
  });

  it('cada tema declara o seu color-scheme', () => {
    // Sem isto, os controlos nativos do browser — scrollbars, seletores de
    // data, o menu de um `<select>` — continuam claros dentro de uma página
    // escura.
    expect(CSS).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(CSS).toMatch(/:root\[data-theme='dark'\]\s*\{[^}]*color-scheme:\s*dark/);
  });

  it('os dois temas definem exatamente as mesmas variáveis de cor', () => {
    // Uma variável presente só num tema é um buraco silencioso: no outro tema
    // herda o valor errado e ninguém repara até alguém ver o ecrã.
    const light = new Set(Object.keys(readTokens('light')));
    const dark = new Set(Object.keys(readTokens('dark')));

    const soNoClaro = [...light].filter((k) => !dark.has(k));
    const soNoEscuro = [...dark].filter((k) => !light.has(k));

    expect(soNoClaro, `definidas só no tema claro: ${soNoClaro.join(', ')}`).toEqual([]);
    expect(soNoEscuro, `definidas só no tema escuro: ${soNoEscuro.join(', ')}`).toEqual([]);
  });
});

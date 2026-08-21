/**
 * Contraste de cor segundo a WCAG 2.2.
 *
 * Isto existe por causa de um requisito de produto, não de estética: o tenant
 * escolhe a cor da marca, e a plataforma **recusa** as combinações que tornem o
 * texto ilegível (`FR-WL-2`). Um cliente com uma cor amarela clara não pode
 * transformar o botão "Confirmar marcação" em algo que ninguém lê — e a
 * responsabilidade legal de acessibilidade também é nossa, não só dele.
 *
 * Lógica pura, sem browser: dá para testar com uma tabela de valores conhecidos.
 *
 * Nota sobre a norma: a WCAG 2.2 usa rácio de luminância, que é conhecido por
 * julgar mal alguns pares (sobretudo cores saturadas). A WCAG 3 traz o APCA, que
 * modela melhor a perceção, mas ainda é rascunho. Ficamos pelo 2.2 porque é o
 * que é exigível hoje — e é o que uma auditoria vai medir.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

/** `#RRGGBB` ou `#RGB` → componentes 0–255. `null` se não for uma cor válida. */
export function parseHex(hex: string): Rgb | null {
  const cleaned = hex.trim().replace(/^#/, '');

  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/**
 * Luminância relativa (WCAG 2.x, §relative luminance).
 *
 * A correção de gama não é opcional: sem ela, um cinzento a 50% dá uma
 * luminância de 0,5 quando na realidade dá ~0,21, e os rácios saem todos
 * errados de forma plausível — o pior tipo de erro.
 */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Rácio entre 1 (idênticas) e 21 (preto sobre branco). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRatioHex(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  return contrastRatio(ca, cb);
}

/**
 * Nível atingido.
 *
 * `AA-large` (3:1) só vale para texto ≥ 24 px, ou ≥ 18,66 px a negrito. Um botão
 * com texto de 15 px precisa de 4,5:1 — é por isso que os limites do design
 * system exigem `AA`, e não `AA-large`.
 */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
/** Limite para componentes de interface e contornos (WCAG 2.2, 1.4.11). */
export const AA_NON_TEXT = 3;

export interface ContrastCheck {
  readonly ratio: number;
  readonly level: ContrastLevel;
  readonly passes: boolean;
}

export function checkContrast(
  foreground: string,
  background: string,
  minimum: number = AA_NORMAL_TEXT,
): ContrastCheck | null {
  const ratio = contrastRatioHex(foreground, background);
  if (ratio === null) return null;

  return {
    ratio: Math.round(ratio * 100) / 100,
    level: contrastLevel(ratio),
    passes: ratio >= minimum,
  };
}

// --- Ajuste de cor --------------------------------------------------------

function toLinear(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const s = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return s * 255;
}

/** Escurece ou clareia mantendo o matiz, no espaço linear. */
function scaleLuminance(color: Rgb, factor: number): Rgb {
  return {
    r: fromLinear(toLinear(color.r) * factor),
    g: fromLinear(toLinear(color.g) * factor),
    b: fromLinear(toLinear(color.b) * factor),
  };
}

export interface AdjustedColor {
  /** A cor que passa. Igual à original se ela já passava. */
  readonly color: string;
  readonly ratio: number;
  readonly adjusted: boolean;
  /** Direção do ajuste, para explicar ao utilizador o que aconteceu. */
  readonly direction: 'darker' | 'lighter' | 'none';
  /**
   * O resultado atinge mesmo o mínimo pedido?
   *
   * Quase sempre `true`. É `false` quando o **fundo** torna o objetivo
   * impossível: contra um cinzento de luminância intermédia (à volta de
   * `#808080`), nem o preto puro nem o branco puro chegam a 4,5:1.
   *
   * Quem chama tem de distinguir os dois casos. Numa configuração de marca, a
   * mensagem certa deixa de ser «corrigimos a sua cor» e passa a ser «este
   * fundo não permite texto legível — escolha outro fundo». Sem este campo, o
   * produto aceitaria em silêncio uma combinação que ninguém consegue ler.
   */
  readonly meetsMinimum: boolean;
}

/**
 * A cor mais próxima da escolhida que atinge o contraste exigido.
 *
 * O produto **não** rejeita a cor da marca com uma mensagem seca — propõe a
 * alternativa mais parecida que funciona. Rejeitar sem alternativa faz o cliente
 * desistir do white-label ou pedir uma exceção; propor mantém a marca dele
 * reconhecível e o produto legível.
 *
 * Procura por bisseção sobre a luminância, mantendo o matiz. 24 iterações dão
 * precisão muito acima do que um ecrã distingue.
 */
export function adjustForContrast(
  foreground: string,
  background: string,
  minimum: number = AA_NORMAL_TEXT,
): AdjustedColor | null {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return null;

  const initial = contrastRatio(fg, bg);
  if (initial >= minimum) {
    return {
      color: toHex(fg),
      ratio: Math.round(initial * 100) / 100,
      adjusted: false,
      direction: 'none',
      meetsMinimum: true,
    };
  }

  // Contra um fundo claro escurece-se; contra um fundo escuro clareia-se.
  const backgroundIsLight = relativeLuminance(bg) > 0.5;
  const direction: 'darker' | 'lighter' = backgroundIsLight ? 'darker' : 'lighter';

  // O extremo garante que existe solução: preto ou branco puros dão sempre o
  // maior contraste possível contra o fundo em causa.
  const extreme: Rgb = backgroundIsLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

  if (contrastRatio(extreme, bg) < minimum) {
    // Só acontece com fundos de luminância intermédia, onde nem o preto nem o
    // branco chegam. Devolve-se o melhor possível, marcado como ajustado.
    const best = contrastRatio(extreme, bg);
    return {
      color: toHex(extreme),
      ratio: Math.round(best * 100) / 100,
      adjusted: true,
      direction,
      meetsMinimum: false,
    };
  }

  const at = (mix: number): Rgb => ({
    r: fg.r + (extreme.r - fg.r) * mix,
    g: fg.g + (extreme.g - fg.g) * mix,
    b: fg.b + (extreme.b - fg.b) * mix,
  });

  let low = 0;
  let high = 1;

  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    // mid = 0 → a cor original; mid = 1 → o extremo.
    if (contrastRatio(at(mid), bg) >= minimum) {
      high = mid;
    } else {
      low = mid;
    }
  }

  // A bisseção trabalha em vírgula flutuante, mas a cor devolvida é um hex de
  // 8 bits por canal. O arredondamento pode fazê-la cair **abaixo** do mínimo:
  // acontecia com #6B797E sobre #F1F4F5, que dava 4,4999… e era mostrado como
  // "4,5:1" — a função a prometer uma coisa e a entregar outra, com uma
  // mensagem que parecia certa.
  //
  // Por isso avança-se em passos pequenos até a cor JÁ QUANTIZADA cumprir.
  let mix = high;
  let quantized = parseHex(toHex(at(mix)))!;

  while (contrastRatio(quantized, bg) < minimum && mix < 1) {
    mix = Math.min(1, mix + 0.004);
    quantized = parseHex(toHex(at(mix)))!;
  }

  const finalRatio = contrastRatio(quantized, bg);

  return {
    color: toHex(quantized),
    ratio: Math.round(finalRatio * 100) / 100,
    adjusted: true,
    direction,
    meetsMinimum: finalRatio >= minimum,
  };
}

/**
 * Variante de uma cor de marca para superfícies — fundos de destaque, estados
 * `hover`, avisos. Mantém o matiz e mexe só na luminância.
 */
export function tintColor(hex: string, amount: number): string | null {
  const color = parseHex(hex);
  if (!color) return null;
  // amount > 1 clareia, < 1 escurece.
  return toHex(scaleLuminance(color, amount));
}

/**
 * Escolhe preto ou branco para texto sobre a cor indicada.
 *
 * É o que decide a cor do texto dentro de um botão pintado com a marca do
 * tenant, e tem de ser calculado — não assumido. Uma marca amarela precisa de
 * texto preto; uma azul-escura precisa de branco.
 */
export function readableTextOn(background: string): '#FFFFFF' | '#000000' | null {
  const bg = parseHex(background);
  if (!bg) return null;

  const white = contrastRatio({ r: 255, g: 255, b: 255 }, bg);
  const black = contrastRatio({ r: 0, g: 0, b: 0 }, bg);

  return white >= black ? '#FFFFFF' : '#000000';
}

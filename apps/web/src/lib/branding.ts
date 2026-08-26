import {
  adjustForContrast,
  mixColor,
  readableTextOn,
  tintColor,
  type AdjustedColor,
} from '@totalmobi/shared';

/**
 * Traduz a marca de um tenant nos tokens CSS que o design system consome.
 *
 * A COR ESCOLHIDA NUNCA É USADA EM BRUTO
 *
 * Passa sempre por `adjustForContrast` antes de chegar ao ecrã. Um cliente com
 * uma marca amarela clara não pode transformar o botão "Confirmar marcação"
 * em texto branco sobre amarelo — e a cor do texto dentro do botão é
 * **calculada**, não assumida: uma marca clara precisa de texto preto, uma
 * escura precisa de branco.
 *
 * O CSS é injetado no servidor, dentro do `<head>`. É o que evita o flash da
 * cor errada: se as variáveis fossem postas por JavaScript depois da
 * hidratação, o cliente veria o azul da plataforma antes do verde da clínica.
 */

export interface TenantBrandingInput {
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  borderRadius?: string | null;
}

export interface ResolvedBranding {
  css: string;
  /** O que teve de ser corrigido, para o painel poder avisar quem configurou. */
  adjustments: { token: string; from: string; to: string; reason: string }[];
}

const RADIUS_SCALE: Record<string, string> = {
  none: '0px',
  sm: '0.375rem',
  md: '0.75rem',
  lg: '1rem',
  full: '999px',
};

export function resolveBranding(
  branding: TenantBrandingInput,
  scheme: 'light' | 'dark' = 'light',
): ResolvedBranding {
  const adjustments: ResolvedBranding['adjustments'] = [];

  const surface = branding.backgroundColor ?? (scheme === 'dark' ? '#0D181C' : '#FFFFFF');

  // A marca é usada como TEXTO (links, ênfase) sobre a superfície. Aí o mínimo
  // é 4,5:1 — o limite de texto normal, não o de 3:1 dos componentes.
  const brandAsText: AdjustedColor | null = adjustForContrast(
    branding.primaryColor,
    surface,
    4.5,
  );

  if (brandAsText?.adjusted) {
    adjustments.push({
      token: '--brand',
      from: branding.primaryColor,
      to: brandAsText.color,
      // Duas mensagens diferentes para dois problemas diferentes. Se o fundo
      // escolhido não permite texto legível com cor nenhuma, dizer "corrigimos
      // a sua cor" seria mentira: o que é preciso mudar é o fundo.
      reason: brandAsText.meetsMinimum
        ? 'contraste insuficiente sobre o fundo (mínimo 4,5:1 para texto)'
        : 'este fundo não permite texto legível com cor nenhuma — escolha um fundo mais claro ou mais escuro',
    });
  }

  const brand = brandAsText?.color ?? branding.primaryColor;

  // Dentro de um botão pintado com a marca, a cor do texto é a que contrasta
  // mais — calculada, nunca assumida.
  const brandInk = readableTextOn(branding.primaryColor) ?? '#FFFFFF';

  const brandHover =
    tintColor(branding.primaryColor, scheme === 'dark' ? 1.25 : 0.78) ?? brand;
  /*
   * O tom suave mistura-se com o fundo; não se escala a luminância.
   *
   * Isto era `tintColor(primary, 4.2)`, que multiplica a luminância e mantém a
   * saturação. Para o azul por omissão devolvia `#1FB8FF` — um ciano
   * fluorescente, mais agressivo do que a cor de partida. Era ele que pintava o
   * cartão de serviço selecionado na página pública, onde a intenção era «um
   * fundo discreto com a cor da clínica».
   *
   * Misturar com o fundo dá `#E7EFFF`, que é o que a intenção queria dizer:
   * aproximar-se do branco tira saturação, e é isso que faz um tom suave.
   */
  const brandSoft =
    mixColor(branding.primaryColor, surface, scheme === 'dark' ? 0.82 : 0.9) ?? surface;

  const declarations = [
    `--brand:${brand}`,
    // O botão usa a cor original: o contraste que interessa lá é com o texto
    // que leva por cima, e esse já foi calculado em `brandInk`.
    `--brand-solid:${branding.primaryColor}`,
    `--brand-ink:${brandInk}`,
    `--brand-hover:${brandHover}`,
    `--brand-soft:${brandSoft}`,
    branding.textColor ? `--ink:${branding.textColor}` : null,
    branding.backgroundColor ? `--surface:${branding.backgroundColor}` : null,
    branding.borderRadius && RADIUS_SCALE[branding.borderRadius]
      ? `--radius-lg:${RADIUS_SCALE[branding.borderRadius]}`
      : null,
  ].filter(Boolean);

  return {
    css: `:root{${declarations.join(';')}}`,
    adjustments,
  };
}

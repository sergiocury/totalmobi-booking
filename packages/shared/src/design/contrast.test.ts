import { describe, expect, it } from 'vitest';

import {
  adjustForContrast,
  checkContrast,
  contrastLevel,
  contrastRatioHex,
  parseHex,
  readableTextOn,
  relativeLuminance,
  toHex,
} from './contrast';

describe('parseHex', () => {
  it('aceita as duas formas', () => {
    expect(parseHex('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('0E7C86')).toEqual({ r: 14, g: 124, b: 134 });
  });

  it('rejeita o que não é cor', () => {
    for (const value of ['#GGGGGG', '#12345', 'azul', '', '#']) {
      expect(parseHex(value)).toBeNull();
    }
  });

  it('faz ida e volta', () => {
    expect(toHex(parseHex('#0E7C86')!)).toBe('#0E7C86');
  });
});

describe('relativeLuminance', () => {
  it('bate com os valores da norma nos extremos', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });

  it('aplica a correção de gama', () => {
    // Um cinzento a 50% de valor NÃO dá 0,5 de luminância. Sem a correção de
    // gama daria — e todos os rácios sairiam errados de forma plausível.
    const meioCinzento = relativeLuminance({ r: 128, g: 128, b: 128 });
    expect(meioCinzento).toBeCloseTo(0.2159, 3);
    expect(meioCinzento).not.toBeCloseTo(0.5, 1);
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco dá 21:1, o máximo', () => {
    expect(contrastRatioHex('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('a mesma cor dá 1:1', () => {
    expect(contrastRatioHex('#0E7C86', '#0E7C86')).toBeCloseTo(1, 5);
  });

  it('é simétrico', () => {
    const a = contrastRatioHex('#0E7C86', '#FFFFFF')!;
    const b = contrastRatioHex('#FFFFFF', '#0E7C86')!;
    expect(a).toBeCloseTo(b, 6);
  });

  it('devolve null para entrada inválida', () => {
    expect(contrastRatioHex('nao-e-cor', '#FFFFFF')).toBeNull();
  });
});

describe('contrastLevel', () => {
  it('aplica os limites da norma', () => {
    expect(contrastLevel(21)).toBe('AAA');
    expect(contrastLevel(7)).toBe('AAA');
    expect(contrastLevel(4.5)).toBe('AA');
    expect(contrastLevel(3)).toBe('AA-large');
    expect(contrastLevel(2.9)).toBe('fail');
  });
});

describe('as cores do seed passam AA', () => {
  it('a marca da Clínica Sorriso sobre branco', () => {
    const check = checkContrast('#0E7C86', '#FBFDFD')!;
    expect(check.passes).toBe(true);
    expect(check.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('a marca do Studio Bella sobre branco', () => {
    const check = checkContrast('#B0446A', '#FFFBFC')!;
    expect(check.passes).toBe(true);
  });

  it('o texto principal sobre o fundo', () => {
    expect(checkContrast('#0B2027', '#FFFFFF')!.level).toBe('AAA');
  });
});

describe('adjustForContrast — o requisito FR-WL-2', () => {
  it('deixa passar sem tocar a cor que já cumpre', () => {
    const result = adjustForContrast('#0E7C86', '#FFFFFF')!;
    expect(result.adjusted).toBe(false);
    expect(result.color).toBe('#0E7C86');
    expect(result.direction).toBe('none');
  });

  it('escurece uma marca clara de mais sobre fundo branco', () => {
    // O caso real: o cliente escolhe amarelo e o botão fica ilegível.
    const result = adjustForContrast('#FFE14D', '#FFFFFF')!;
    expect(result.adjusted).toBe(true);
    expect(result.direction).toBe('darker');
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('clareia sobre fundo escuro', () => {
    const result = adjustForContrast('#1A2E35', '#0B1418')!;
    expect(result.adjusted).toBe(true);
    expect(result.direction).toBe('lighter');
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('a cor proposta cumpre mesmo o mínimo pedido, JÁ QUANTIZADA a hex', () => {
    // A propriedade que interessa: seja qual for a cor de entrada, o que sai
    // passa. Se falhasse, o produto propunha uma alternativa que também não
    // servia — pior do que não propor nada.
    //
    // A verificação é feita sobre a cor devolvida (reanalisada do hex), e não
    // sobre o `ratio` que a função reporta. É a diferença que apanhou o bug:
    // a bisseção convergia em vírgula flutuante e o arredondamento para 8 bits
    // fazia a cor cair para 4,4999…, exibido como "4,5:1".
    const fundos = ['#FFFFFF', '#F1F4F5', '#0D181C', '#182529', '#808080'];
    const cores = [
      '#FFE14D', '#FFFFFF', '#F0F0F0', '#7FFFD4', '#FF00FF',
      '#00FF00', '#123456', '#6B797E', '#000000', '#0E7C86',
    ];

    for (const fundo of fundos) {
      for (const cor of cores) {
        const result = adjustForContrast(cor, fundo, 4.5)!;
        const real = contrastRatioHex(result.color, fundo)!;

        if (result.meetsMinimum) {
          expect(
            real,
            `${cor} sobre ${fundo} devolveu ${result.color} com ${real.toFixed(4)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        } else {
          // `meetsMinimum: false` só é aceitável quando o objetivo é mesmo
          // impossível — e nesse caso a resposta tem de ser o extremo, que é o
          // melhor que existe. Devolver um meio-termo seria desistir cedo.
          expect(['#FFFFFF', '#000000']).toContain(result.color);
        }
      }
    }
  });

  it('avisa quando o fundo torna o mínimo impossível', () => {
    // Um cinzento de luminância intermédia não deixa nenhum texto chegar a
    // 4,5:1 — nem preto nem branco. O produto tem de saber a diferença entre
    // «corrigimos a sua cor» e «este fundo não serve para texto».
    const impossivel = adjustForContrast('#FFE14D', '#808080', 4.5)!;
    expect(impossivel.meetsMinimum).toBe(false);
    expect(impossivel.ratio).toBeLessThan(4.5);

    const possivel = adjustForContrast('#FFE14D', '#FFFFFF', 4.5)!;
    expect(possivel.meetsMinimum).toBe(true);
  });

  it('o `ratio` reportado corresponde à cor devolvida', () => {
    // Um relatório que não bate certo com o resultado é pior do que nenhum:
    // leva quem lê a confiar numa coisa que não aconteceu.
    for (const cor of ['#FFE14D', '#7FFFD4', '#6B797E']) {
      const result = adjustForContrast(cor, '#F1F4F5', 4.5)!;
      const real = contrastRatioHex(result.color, '#F1F4F5')!;
      expect(result.ratio).toBeCloseTo(Math.round(real * 100) / 100, 2);
    }
  });

  it('mantém-se próxima da cor original em vez de saltar para preto', () => {
    // Um amarelo ajustado tem de continuar a parecer amarelo. Se o ajuste
    // devolvesse sempre preto, o white-label deixava de existir.
    const result = adjustForContrast('#FFE14D', '#FFFFFF')!;
    const rgb = parseHex(result.color)!;
    expect(rgb.r).toBeGreaterThan(rgb.b);
    expect(rgb.g).toBeGreaterThan(rgb.b);
    expect(result.color).not.toBe('#000000');
  });

  it('respeita um mínimo mais exigente', () => {
    const aa = adjustForContrast('#0E7C86', '#FFFFFF', 4.5)!;
    const aaa = adjustForContrast('#0E7C86', '#FFFFFF', 7)!;
    expect(aa.adjusted).toBe(false);
    expect(aaa.adjusted).toBe(true);
    expect(aaa.ratio).toBeGreaterThanOrEqual(7);
  });

  it('devolve null para entrada inválida', () => {
    expect(adjustForContrast('nao-e-cor', '#FFFFFF')).toBeNull();
  });
});

describe('readableTextOn', () => {
  it('escolhe preto sobre cores claras e branco sobre escuras', () => {
    expect(readableTextOn('#FFE14D')).toBe('#000000');
    expect(readableTextOn('#0B2027')).toBe('#FFFFFF');
    expect(readableTextOn('#0E7C86')).toBe('#FFFFFF');
  });

  it('a escolha é sempre a de maior contraste', () => {
    for (const cor of ['#FFE14D', '#0B2027', '#0E7C86', '#B0446A', '#808080']) {
      const escolha = readableTextOn(cor)!;
      const outra = escolha === '#FFFFFF' ? '#000000' : '#FFFFFF';
      expect(contrastRatioHex(escolha, cor)!).toBeGreaterThanOrEqual(
        contrastRatioHex(outra, cor)!,
      );
    }
  });
});

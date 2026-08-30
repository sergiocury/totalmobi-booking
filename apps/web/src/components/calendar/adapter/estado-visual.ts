/**
 * Como um bloco da agenda mostra o seu estado.
 *
 * O QUE FALTAVA
 *
 * Os blocos distinguiam só "ocupa a agenda" de "não ocupa": uma marcação
 * confirmada e uma por confirmar eram desenhadas exatamente da mesma maneira.
 * Quem carregava em confirmar não via nada mudar e ficava sem saber se a ação
 * tinha corrido — que foi o relato de quem estava a usar isto a sério.
 *
 * COR **E** SÍMBOLO
 *
 * A cor sozinha não chega: cerca de 8% dos homens não distingue verde de
 * vermelho, e um fundo ligeiramente diferente não se vê num bloco de 20 px numa
 * agenda cheia. Por isso o estado também vai em texto — um `✓` que se lê em
 * qualquer ecrã, e no `title` por extenso para quem usa leitor.
 */

export interface EstadoVisual {
  /** Classes do bloco. */
  readonly classes: string;
  /** Símbolo antes da hora. Vazio quando não há nada a assinalar. */
  readonly marca: string;
  /** O estado por palavras, para o `title` e para leitores de ecrã. */
  readonly etiqueta: string;
}

const CONFIRMADOS: ReadonlySet<string> = new Set([
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
]);

export function estadoVisual(status: string, ativo: boolean): EstadoVisual {
  // Cancelada, falta, remarcada: já não ocupa a agenda.
  if (!ativo) {
    return {
      classes: 'border-dashed border-(--line) bg-(--surface-sunken) opacity-60',
      marca: '',
      etiqueta: 'sem efeito',
    };
  }

  if (CONFIRMADOS.has(status)) {
    return {
      classes: 'border-(--brand) bg-(--brand-soft)',
      marca: '✓ ',
      etiqueta: 'confirmada',
    };
  }

  return {
    classes: 'border-(--line-strong) bg-(--surface)',
    marca: '',
    etiqueta: 'por confirmar',
  };
}

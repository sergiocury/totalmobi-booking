import 'server-only';

import {
  estadoDosPrecos as estadoPuro,
  resolverPreco as resolverPuro,
  type Periodicidade,
} from '@totalmobi/shared';

/**
 * A casca que liga a lógica ao ambiente.
 *
 * Três linhas de propósito. A decisão de que preço cobrar é pura e vive em
 * `packages/shared/src/domain/precos-stripe.ts`, com dez testes — aqui só se
 * diz de onde vêm as variáveis.
 *
 * `server-only` no topo faz o build **falhar** se alguém importar isto de um
 * componente de cliente.
 */

const doAmbiente = (nome: string): string | undefined => process.env[nome];

export function resolverPreco(codigo: string, periodo: Periodicidade) {
  return resolverPuro(codigo, periodo, doAmbiente);
}

export function estadoDosPrecos() {
  return estadoPuro(doAmbiente);
}

export type { Periodicidade };

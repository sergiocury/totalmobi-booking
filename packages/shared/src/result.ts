/**
 * `Result` para operações de domínio que podem falhar de forma esperada.
 *
 * Porquê e não exceções: um slot ocupado, uma política de cancelamento
 * ultrapassada ou um telefone inválido não são situações excecionais — são
 * respostas normais do domínio, e o compilador deve obrigar a tratá-las.
 * Exceções ficam para o que é mesmo imprevisto (rede em baixo, bug).
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Aplica `fn` ao valor de sucesso, deixando o erro intacto. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Encadeia operações que também devolvem `Result`. */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Devolve o valor de sucesso ou o substituto indicado. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Devolve o valor ou lança. Usar apenas em testes e em fronteiras onde a falha
 * já foi tratada — nunca como atalho para não tratar o erro.
 */
export function unwrapOrThrow<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrapOrThrow chamado sobre um erro: ${JSON.stringify(result.error)}`);
}

/** Recolhe uma lista de resultados: falha no primeiro erro. */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

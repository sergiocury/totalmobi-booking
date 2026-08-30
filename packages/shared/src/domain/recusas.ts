import { DomainErrorCode } from '../errors';

/**
 * Porque é que não se pôde fazer — em palavras para quem está do outro lado.
 *
 * O QUE ISTO CORRIGE
 *
 * Pedir para remarcar uma consulta que era daí a três horas devolvia:
 *
 *   "Não consegui mudar a hora. Vou pedir a um colega que trate disso."
 *
 * A recusa estava **certa** — a empresa exige 24 horas de antecedência — e a
 * mensagem escondia-a por completo. Quem a lê fica a pensar que o sistema
 * falhou, quando o que houve foi uma regra a ser cumprida. E a promessa do
 * colega era falsa: nada avisava ninguém.
 *
 * Uma recusa sem motivo é indistinguível de uma avaria. É o mesmo defeito do
 * `/status` que dizia "nenhum" quando lhe faltavam permissões, e da procura que
 * dizia "não encontrei horas" quando a base de dados tinha dado erro.
 *
 * O QUE **NÃO** SE DIZ
 *
 * Nada que a pessoa não possa usar. "Sem permissão" ou "constraint violada" são
 * verdades inúteis: para quem está a marcar, o que interessa é se pode tentar
 * outra coisa ou se tem de falar com alguém.
 */
export function motivoDaRecusa(codigo: string): string | null {
  switch (codigo) {
    case DomainErrorCode.CANCELLATION_WINDOW_CLOSED:
      // A mensagem do SQL traz o número de horas; quem chama junta-a a esta.
      return 'está demasiado em cima da hora';

    case DomainErrorCode.OUTSIDE_WORKING_HOURS:
      return 'essa hora está fora do horário de atendimento';

    case DomainErrorCode.SLOT_TAKEN:
      return 'essa hora acabou de ser ocupada';

    case DomainErrorCode.BOOKING_NOT_FOUND:
    case DomainErrorCode.NOT_FOUND:
      return 'não encontrei essa marcação';

    default:
      // Sem motivo que se possa explicar, é melhor não inventar um.
      return null;
  }
}

/**
 * A regra da empresa, tal como o SQL a escreveu.
 *
 * As funções de marcação levantam exceções com o texto já em português e com o
 * número de horas lá dentro — "A remarcação exige 24 horas de antecedência".
 * Esse texto é bom para o cliente e é a única fonte que sabe o número.
 *
 * Só se aproveita quando **é mesmo** uma regra de antecedência: qualquer outra
 * mensagem do Postgres pode ter detalhes internos que ninguém deve ler.
 */
export function regraDeAntecedencia(codigo: string, mensagem: string): string | null {
  if (codigo !== DomainErrorCode.CANCELLATION_WINDOW_CLOSED) return null;

  return /\d+\s*horas?/.test(mensagem) ? mensagem.replace(/\.$/, '') : null;
}

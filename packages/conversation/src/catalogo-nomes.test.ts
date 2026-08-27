import { describe, expect, it } from 'vitest';

import { encontrarNoCatalogo } from './extractor';

/**
 * O reconhecimento de nomes no catálogo da empresa.
 *
 * Estes casos vieram todos de uso real, e o mais caro foi o "Jo": a função
 * exigia três letras e um profissional com nome de duas nunca era encontrado.
 * Quem escrevia "com o Jo" recebia as horas de toda a gente e acabava marcado
 * com outra pessoa.
 */
describe('encontrarNoCatalogo', () => {
  const EQUIPA = ['Sergio Cury', 'Anaa', 'Jo', 'João'];

  it('encontra um nome de duas letras', () => {
    expect(encontrarNoCatalogo('queria marcar com o Jo a tarde', EQUIPA)).toBe('Jo');
  });

  /**
   * Os dois sentidos da desambiguação, que é o que torna o nome curto seguro.
   *
   * A ordem por comprimento tenta "João" primeiro; a fronteira de palavra
   * impede que "Jo" case dentro dele.
   */
  it('não confunde Jo com João, em nenhuma direção', () => {
    expect(encontrarNoCatalogo('com o João', EQUIPA)).toBe('João');
    expect(encontrarNoCatalogo('com o Jo', EQUIPA)).toBe('Jo');
  });

  it('um nome curto não casa dentro de outra palavra', () => {
    // "hoje" contém "jo". Era este o risco que o limite de três letras tapava,
    // e que a fronteira de palavra tapa melhor.
    expect(encontrarNoCatalogo('queria marcar hoje', EQUIPA)).toBeNull();
    expect(encontrarNoCatalogo('pode ser em jornada dupla', EQUIPA)).toBeNull();
  });

  it('apanha o primeiro nome de um nome composto', () => {
    expect(encontrarNoCatalogo('com o Sergio', EQUIPA)).toBe('Sergio Cury');
  });

  it('apanha pelo apelido, que é mais longo', () => {
    expect(encontrarNoCatalogo('com o Cury', EQUIPA)).toBe('Sergio Cury');
  });

  it('ignora o título', () => {
    expect(encontrarNoCatalogo('com a Ana', ['Dra. Ana Martins'])).toBe('Dra. Ana Martins');
  });

  it('serviços compostos ganham aos simples', () => {
    const SERVICOS = ['Limpeza', 'Limpeza dentária'];
    expect(encontrarNoCatalogo('queria uma limpeza dentária', SERVICOS)).toBe('Limpeza dentária');
  });

  it('acentos não impedem o reconhecimento', () => {
    expect(encontrarNoCatalogo('queria uma limpeza dentaria', ['Limpeza dentária'])).toBe(
      'Limpeza dentária',
    );
  });

  /**
   * Um nome com pontuação entrava numa expressão regular sem ser escapado.
   * Não dava falso positivo — dava exceção, e a mensagem inteira ficava sem
   * extração nenhuma.
   */
  it('nomes com pontuação não rebentam a busca', () => {
    const COM_PONTUACAO = ['Dr. Silva (pediatria)', 'Ana'];

    expect(() => encontrarNoCatalogo('marcar com a Ana', COM_PONTUACAO)).not.toThrow();
    expect(encontrarNoCatalogo('marcar com a Ana', COM_PONTUACAO)).toBe('Ana');
    expect(encontrarNoCatalogo('com o Dr. Silva (pediatria)', COM_PONTUACAO)).toBe(
      'Dr. Silva (pediatria)',
    );
  });

  it('sem ninguém referido devolve nulo', () => {
    expect(encontrarNoCatalogo('queria marcar para amanhã', EQUIPA)).toBeNull();
  });

  it('um catálogo vazio não encontra nada', () => {
    expect(encontrarNoCatalogo('com o Jo', [])).toBeNull();
  });
});

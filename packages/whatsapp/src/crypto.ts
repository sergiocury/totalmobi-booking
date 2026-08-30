import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifra dos tokens de integração.
 *
 * O token da Meta de um cliente permite enviar mensagens em nome dele. Guardá-lo
 * em texto simples significa que qualquer cópia da base de dados — um `pg_dump`
 * para depurar, um backup mal guardado, uma política de RLS mal escrita no
 * futuro — passa a ser uma fuga com consequências reais para o negócio dele.
 *
 * AES-256-GCM: cifra **e** autentica. Com CBC, alguém que conseguisse escrever
 * na coluna podia alterar o texto cifrado sem ser detetado; com GCM, a
 * decifragem falha.
 *
 * O `keyId` viaja com o texto cifrado para que rodar a chave não obrigue a
 * reautenticar toda a gente: a chave nova cifra o que for novo, e a antiga
 * continua a decifrar o que já lá está até ser reescrito.
 *
 * FORMATO
 *
 *   [12 bytes IV][16 bytes tag de autenticação][resto: texto cifrado]
 *
 * Tudo num só `bytea`. Guardar as três partes em colunas separadas convidaria a
 * que uma delas fosse esquecida numa cópia.
 */

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

export interface ChaveDeCifra {
  id: string;
  /** 32 bytes. Em base64 nas variáveis de ambiente. */
  chave: Buffer;
}

export function lerChave(base64: string, id: string): ChaveDeCifra {
  const chave = Buffer.from(base64, 'base64');

  if (chave.length !== 32) {
    throw new Error(
      `Chave de cifra inválida: ${chave.length} bytes, esperados 32. Gerar com: openssl rand -base64 32`,
    );
  }

  return { id, chave };
}

export function cifrar(texto: string, chave: ChaveDeCifra): Buffer {
  // IV novo a cada cifragem. Reutilizar um IV em GCM não enfraquece a cifra —
  // destrói-a por completo.
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chave.chave, iv);

  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, cifrado]);
}

export function decifrar(dados: Buffer, chave: ChaveDeCifra): string {
  if (dados.length < TAMANHO_IV + TAMANHO_TAG) {
    throw new Error('Dados cifrados demasiado curtos para conterem IV e tag.');
  }

  const iv = dados.subarray(0, TAMANHO_IV);
  const tag = dados.subarray(TAMANHO_IV, TAMANHO_IV + TAMANHO_TAG);
  const cifrado = dados.subarray(TAMANHO_IV + TAMANHO_TAG);

  const decipher = createDecipheriv(ALGORITMO, chave.chave, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
}

/**
 * Esconde um token para poder aparecer num log ou num ecrã.
 *
 * Existe para que ninguém tenha desculpa para imprimir o token inteiro "só
 * para confirmar qual é". Mostra o suficiente para distinguir dois tokens e de
 * menos para usar um.
 */
export function mascarar(token: string): string {
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

/**
 * O token cifrado, seja qual for a forma como foi guardado.
 *
 * O QUE ESTA MESMO NA COLUNA
 *
 * `access_token_encrypted` e `bytea`, e o PostgREST devolve `bytea` como uma
 * barra invertida seguida de `x` e do hexadecimal - nunca base64. Mas o lado
 * que escreve faz `cifrar(...).toString('base64')` e entrega essa **string** ao
 * insert, e o Postgres guarda os caracteres do base64 como bytes.
 *
 * Resultado: o conteudo esta codificado duas vezes. Ve-se a olho - os primeiros
 * bytes lidos sao `482b545341`, que em ASCII da `H+TSA`, letras de base64 e nao
 * um cabecalho de dados cifrados.
 *
 * PORQUE E QUE SE TENTAM AS DUAS
 *
 * A cifra e autenticada (GCM). Uma tentativa errada nao devolve lixo - falha,
 * com a etiqueta de autenticacao a recusar. Isso torna a propria decifra num
 * discriminador fiavel, em vez de se adivinhar o formato por heuristica.
 *
 * A ordem comeca pelo formato correto, para que o dia em que a escrita for
 * corrigida isto continue certo sem se lhe tocar.
 */
export function decifrarTokenGuardado(
  guardado: string,
  keyId: string,
  chaveBase64: string,
): string {
  const chave = lerChave(chaveBase64, keyId);

  // O prefixo com que o Postgres devolve `bytea`: uma barra invertida e um `x`.
  const PREFIXO_HEX = String.raw`\x`;

  const bytes = guardado.startsWith(PREFIXO_HEX)
    ? Buffer.from(guardado.slice(PREFIXO_HEX.length), 'hex')
    : Buffer.from(guardado, 'base64');

  try {
    // O formato certo: os bytes da coluna sao os dados cifrados.
    return decifrar(bytes, chave);
  } catch {
    // O formato herdado: os bytes da coluna sao o texto base64 dos dados.
    return decifrar(Buffer.from(bytes.toString('utf8'), 'base64'), chave);
  }
}

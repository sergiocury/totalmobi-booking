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

#!/usr/bin/env node
/**
 * Corre SQL no projeto Supabase pela Management API.
 *
 *   node sbsql.mjs -f ficheiro.sql
 *   node sbsql.mjs -q "select 1"
 *
 * POR QUE É QUE ISTO É NODE E NÃO BASH
 *
 * A primeira versão era um script bash que fazia `SQL=$(cat ficheiro)` e passava
 * o conteúdo ao node por variável de ambiente. Em Git Bash no Windows esse
 * caminho não é limpo em UTF-8: o `í` de "Clínica" chegou à base de dados como
 * EF BF BD — o carácter U+FFFD de substituição. Corrompido em silêncio, sem
 * erro nenhum, e de forma irreversível (o byte original perdeu-se).
 *
 * Aqui o ficheiro é lido em UTF-8 pelo Node e vai direto para o corpo JSON do
 * pedido. Não passa pelo shell nem pelo ambiente em momento nenhum.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN. Gerar em supabase.com/dashboard/account/tokens.');
  process.exit(2);
}
const REF = process.env.SUPABASE_PROJECT_REF ?? 'ulpsaxhocvezcohbndpz';

const [flag, value] = process.argv.slice(2);

let sql;
if (flag === '-f') {
  sql = readFileSync(value, 'utf8');
} else if (flag === '-q') {
  sql = value;
} else {
  console.error('uso: node sbsql.mjs -f <ficheiro.sql> | -q "<sql>"');
  process.exit(2);
}

// Rede de segurança: se o ficheiro já vier com o carácter de substituição, algo
// o corrompeu antes de chegar aqui. Mais vale parar do que gravar lixo.
if (sql.includes('�')) {
  console.error('ABORTADO: o SQL contém U+FFFD — o ficheiro está corrompido na origem.');
  process.exit(1);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'User-Agent': 'curl/8.4.0', // sem UA, a Cloudflare devolve 403 (erro 1010)
    'Content-Type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await response.text();

if (!response.ok) {
  console.error(`HTTP ${response.status}`);
  console.error(text);
  process.exit(1);
}

// Escreve também em ficheiro, para poder ser inspecionado sem passar pela
// consola do Windows, que não sabe imprimir acentos.
writeFileSync(join(HERE, 'last-result.json'), text, 'utf8');

try {
  console.log(JSON.stringify(JSON.parse(text), null, 1));
} catch {
  console.log(text);
}

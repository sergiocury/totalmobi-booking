#!/usr/bin/env node
/**
 * Valida a sintaxe de todas as migrations com o analisador real do PostgreSQL.
 *
 * `libpg-query` embrulha o parser do próprio PostgreSQL 17 — a mesma gramática
 * que o servidor usa. Não substitui aplicar as migrations (não vê tipos, nem
 * colunas inexistentes, nem comportamento de RLS), mas apanha em segundos toda
 * a classe de erros de sintaxe, que é a que mais custa descobrir a meio de uma
 * migração já a correr em produção.
 *
 * Existe porque nesta máquina o Docker Desktop não arranca e não há Postgres
 * local. Continua a valer a pena mesmo depois de haver: é instantâneo e cabe no CI.
 *
 *     npm run check:sql
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import { parse } from 'libpg-query';

const ROOT = process.cwd();
const TARGETS = ['supabase/migrations', 'supabase/seed'];
const EXTRA_FILES = ['supabase/seed.sql'];

/** Converte o deslocamento em caracteres devolvido pelo parser em linha/coluna. */
function locate(sql, cursorPosition) {
  if (!cursorPosition || cursorPosition < 1) return null;
  const upTo = sql.slice(0, cursorPosition - 1);
  const line = upTo.split('\n').length;
  const column = cursorPosition - (upTo.lastIndexOf('\n') + 1);
  const lineText = sql.split('\n')[line - 1] ?? '';
  return { line, column, lineText: lineText.trim() };
}

async function collectFiles() {
  const files = [];

  for (const dir of TARGETS) {
    let entries;
    try {
      entries = await readdir(join(ROOT, dir));
    } catch {
      continue;
    }
    for (const name of entries.sort()) {
      if (name.endsWith('.sql')) files.push(join(ROOT, dir, name));
    }
  }

  for (const file of EXTRA_FILES) {
    try {
      await readFile(join(ROOT, file));
      files.push(join(ROOT, file));
    } catch {
      // não existe, segue
    }
  }

  return files;
}

async function main() {
  const files = await collectFiles();

  if (files.length === 0) {
    console.error('check:sql — nenhum ficheiro .sql encontrado. Está a correr na raiz do projeto?');
    process.exit(1);
  }

  let failed = 0;

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const sql = await readFile(file, 'utf8');

    try {
      const result = await parse(sql);
      const statements = result?.stmts?.length ?? 0;
      console.log(`  ✅ ${rel} — ${statements} instruções`);
    } catch (error) {
      failed += 1;
      const where = locate(sql, error?.cursorPosition);
      console.error(`\n  ❌ ${rel}`);
      console.error(`     ${error?.message ?? error}`);
      if (where) {
        console.error(`     linha ${where.line}, coluna ${where.column}`);
        console.error(`     → ${where.lineText}`);
      }
      console.error('');
    }
  }

  console.log('');

  if (failed > 0) {
    console.error(`check:sql — ${failed} de ${files.length} ficheiros com erro de sintaxe.`);
    process.exit(1);
  }

  console.log(
    `✅ check:sql — ${files.length} ficheiros analisados com a gramática do PostgreSQL 17, sintaxe válida.`,
  );
  console.log(
    '   Nota: isto NÃO substitui aplicar as migrations. Tipos, referências e RLS só se',
  );
  console.log('   provam contra uma base de dados a sério (`supabase db reset`).');
}

main().catch((error) => {
  console.error('check:sql falhou:', error);
  process.exit(1);
});

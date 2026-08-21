#!/usr/bin/env node
/**
 * Procura segredos em ficheiros que chegam ao browser.
 *
 * Porque existe: `import 'server-only'` protege contra a importação acidental,
 * mas não contra alguém colar uma chave num componente de cliente, nem contra
 * uma variável mal chamada `NEXT_PUBLIC_…`. Isto é a rede de apanha, e falha o
 * CI antes de o problema ir para produção.
 *
 * Correr depois do `next build`:  npm run build && npm run check:secrets
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

const SCAN_DIRS = ['apps/web/.next/static', 'apps/web/.next/server/app', 'apps/web/public'];

const PATTERNS = [
  {
    name: 'Chave de gestão do Supabase',
    regex: /\bsbp_[a-f0-9]{40,}\b/g,
  },
  {
    name: 'Chave da API da Anthropic',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'Chave secreta do Stripe',
    regex: /\bsk_(live|test)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: 'Chave da API do Resend',
    regex: /\bre_[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'Token da Meta / WhatsApp',
    regex: /\bEAA[A-Za-z0-9]{60,}\b/g,
  },
  {
    /**
     * JWT com role=service_role. A chave `anon` também é um JWT e *deve* estar
     * no bundle — por isso a deteção é pelo payload descodificado, não pelo
     * formato. Um JWT no bundle não é, por si só, um problema.
     */
    name: 'Chave service_role do Supabase',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    verify: (match) => {
      try {
        const payload = match.split('.')[1];
        const decoded = Buffer.from(payload, 'base64url').toString('utf8');
        return decoded.includes('service_role');
      } catch {
        return false;
      }
    },
  },
];

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.pdf']);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot === -1 ? '' : entry.name.slice(dot);
      if (!SKIP_EXTENSIONS.has(ext)) yield full;
    }
  }
}

async function main() {
  const findings = [];
  let scanned = 0;
  let scannedAnyDir = false;

  for (const relDir of SCAN_DIRS) {
    const dir = join(ROOT, relDir);
    if (!existsSync(dir)) continue;
    scannedAnyDir = true;

    for await (const file of walk(dir)) {
      const info = await stat(file);
      // Ficheiros muito grandes são source maps ou assets; um segredo colado
      // aparece sempre também no ficheiro compilado, que é pequeno.
      if (info.size > 8 * 1024 * 1024) continue;

      const content = await readFile(file, 'utf8').catch(() => null);
      if (content === null) continue;
      scanned += 1;

      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0;
        const matches = content.match(pattern.regex);
        if (!matches) continue;

        for (const match of new Set(matches)) {
          if (pattern.verify && !pattern.verify(match)) continue;
          findings.push({
            file: relative(ROOT, file),
            pattern: pattern.name,
            preview: `${match.slice(0, 12)}…`,
          });
        }
      }
    }
  }

  if (!scannedAnyDir) {
    console.warn(
      'check:secrets — nada para verificar. Correr `npm run build` primeiro; sem build, este passo não prova nada.',
    );
    process.exit(0);
  }

  if (findings.length > 0) {
    console.error(`\n❌ Encontrados ${findings.length} possíveis segredos em código de cliente:\n`);
    for (const f of findings) {
      console.error(`   ${f.pattern}`);
      console.error(`     ${f.file}`);
      console.error(`     ${f.preview}\n`);
    }
    console.error('Rodar imediatamente as chaves expostas e mover a leitura para um módulo');
    console.error('com `import \'server-only\'`. Ver docs/SECURITY.md, secção 5.\n');
    process.exit(1);
  }

  console.log(`✅ check:secrets — ${scanned} ficheiros analisados, nenhum segredo encontrado.`);
}

main().catch((error) => {
  console.error('check:secrets falhou:', error);
  process.exit(1);
});

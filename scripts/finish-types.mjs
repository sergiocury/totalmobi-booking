#!/usr/bin/env node
/**
 * Põe o cabeçalho explicativo nos tipos gerados pelo Supabase CLI.
 *
 * O `supabase gen types` escreve o ficheiro do zero, o que apagava a nota que
 * explica porque é que os aliases vivem noutro sítio e porque é que o gerador
 * emite `type` e não `interface`. Sem essa nota, a primeira pessoa a "arrumar"
 * o ficheiro reintroduz o bug do `never`.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const GERADO = 'packages/database/src/types/.generated.ts';
const DESTINO = 'packages/database/src/types/database.types.ts';

const CABECALHO = `/**
 * Tipos do schema \`booking\`.
 *
 * ⚠️ FICHEIRO GERADO — não editar à mão.
 *
 *     npm run db:types:remote    (produção, precisa de SUPABASE_ACCESS_TOKEN)
 *     npm run db:types           (base local, quando existir)
 *
 * Os aliases de linha (\`ServiceRow\`, \`StaffRow\`…) vivem em \`rows.ts\`, FORA
 * deste ficheiro — senão desapareciam na geração seguinte.
 *
 * O gerador emite \`type\` e não \`interface\`: uma \`interface\` não é atribuível a
 * \`Record<string, unknown>\`, o cliente resolveria \`Schema\` para \`never\`, e
 * todos os \`.select()\` do projeto passariam a devolver \`never\` sem uma única
 * mensagem que apontasse para a causa.
 */

`;

const gerado = readFileSync(GERADO, 'utf8');

if (!gerado.includes('export type Database')) {
  console.error('A geração falhou: o ficheiro não tem `export type Database`.');
  process.exit(1);
}

writeFileSync(DESTINO, CABECALHO + gerado, 'utf8');
unlinkSync(GERADO);
console.log(`tipos escritos em ${DESTINO} (${gerado.length} bytes)`);

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Toda a tabela criada no schema `booking` tem de dar privilégios ao
 * `service_role`.
 *
 * PORQUE É QUE ISTO É UM TESTE E NÃO UMA NOTA NA DOCUMENTAÇÃO
 *
 * A `0001` decide, de propósito, não dar privilégios por omissão a objetos
 * futuros: «cada tabela nova tem de receber grants explícitos, o que obriga a
 * pensar em quem a pode ler». É uma boa decisão, e tem um custo — quem
 * escrever uma migration e se esquecer do grant não recebe erro nenhum. A
 * migration aplica-se com sucesso, a tabela existe, e só falha mais tarde, em
 * produção, na primeira escrita.
 *
 * Foi o que aconteceu com a `0034`: `stripe_webhook_events` e
 * `tenant_subscriptions` nasceram sem grants. O webhook do Stripe entregava,
 * a assinatura era válida, e o insert devolvia 42501. O Stripe via 500 em
 * todos os eventos e a tabela de diagnóstico ficava vazia — porque escrever
 * nela era exatamente o que falhava.
 *
 * O RLS não tapa este buraco: uma política só é consultada depois de a role
 * ter direito à tabela. `service_role` ignora RLS, mas não ignora `grant`.
 *
 * Lê o disco de propósito. Uma lista de tabelas escrita à mão dentro do teste
 * seria uma segunda cópia daquilo que estamos a verificar, e a cópia que se
 * esquece é sempre a que não dói.
 */
describe('grants das migrations', () => {
  const raiz = join(process.cwd(), 'supabase', 'migrations');

  it('cada tabela em booking dá privilégios ao service_role', () => {
    if (!existsSync(raiz)) return; // o pacote também corre fora do monorepo

    const criadas = new Map<string, string>();
    const comGrant = new Set<string>();

    for (const nome of readdirSync(raiz).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(raiz, nome), 'utf8');

      for (const m of sql.matchAll(/create table (?:if not exists )?booking\.(\w+)/gi)) {
        if (!criadas.has(m[1]!)) criadas.set(m[1]!, nome);
      }

      // `grant <o quê> on <alvos> to <roles>;` — os alvos podem ser vários,
      // separados por vírgula, e as funções não contam: têm a sua própria
      // linha de grants e não são tabelas.
      for (const m of sql.matchAll(/grant\s+[\w\s,]*?\s+on\s+([^;]+?)\s+to\s+([^;]+);/gi)) {
        const [, alvos, roles] = m;
        if (!roles!.includes('service_role')) continue;
        if (/function/i.test(alvos!)) continue;
        for (const t of alvos!.matchAll(/booking\.(\w+)/g)) comGrant.add(t[1]!);
      }
    }

    expect(criadas.size, 'não foram encontradas tabelas — o padrão deixou de bater').toBeGreaterThan(
      0,
    );

    const emFalta = [...criadas.entries()]
      .filter(([tabela]) => !comGrant.has(tabela))
      .map(([tabela, ficheiro]) => `${tabela} (${ficheiro})`);

    expect(emFalta, `tabelas sem grant para service_role: ${emFalta.join(', ')}`).toEqual([]);
  });
});

#!/usr/bin/env node
/**
 * Convida alguém para um tenant, a partir da linha de comandos.
 *
 *   node scripts/dev-invite.mjs <email> <slug-do-tenant> [papel] [--app=<url>]
 *
 * Existe para exercitar o fluxo de convites sem ter de construir primeiro a UI
 * de gestão de equipa (Milestone 5). Usa exatamente o mesmo caminho que a
 * aplicação: `generateLink` → `/auth/confirm` → `/convite/<id>`.
 *
 * Lê as variáveis de `apps/web/.env.local`, que é onde o Next as procura.
 *
 * PORQUE É QUE O `--app` EXISTE
 *
 * O `.env.local` tem `NEXT_PUBLIC_APP_URL=http://localhost:3000`, e é isso que
 * queremos em desenvolvimento. Mas o link do convite **leva o URL lá dentro**:
 * gerado com o valor do ficheiro, aponta para a máquina de quem o correu, e
 * quem o receber abre uma página que não existe.
 *
 * Não é um detalhe de conveniência. O convite gasta um token de uso único —
 * abri-lo no sítio errado queima-o, e é preciso gerar outro. Por isso o destino
 * passa a dizer-se em voz alta em vez de se herdar em silêncio.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function loadEnv() {
  const raw = readFileSync(join(process.cwd(), 'apps/web/.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]] ??= match[2];
  }
}

loadEnv();

const argv = process.argv.slice(2);
const flagApp = argv.find((a) => a.startsWith('--app='));
const [email, slug, role = 'tenant_admin'] = argv.filter((a) => !a.startsWith('--'));

if (!email || !slug) {
  console.error('uso: node scripts/dev-invite.mjs <email> <slug-do-tenant> [papel] [--app=<url>]');
  process.exit(2);
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = (flagApp?.slice('--app='.length) ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  .replace(/\/+$/, '');

// O Supabase só honra o `redirect_to` se ele estiver na lista de permitidos; se
// não estiver, ignora-o **em silêncio** e usa o Site URL. O link sairia bonito
// e levaria a outro sítio. Mais vale falhar aqui.
if (!/^https?:\/\//.test(APP)) {
  console.error(`--app tem de ser um URL completo (recebido: "${APP}")`);
  process.exit(2);
}

const headers = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, 'Accept-Profile': 'booking', 'Content-Profile': 'booking', ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const [tenant] = await rest(`tenants?slug=eq.${slug}&select=id,display_name`);
if (!tenant) throw new Error(`tenant "${slug}" não encontrado`);

// 1. Gerar o link. NÃO envia email — é o que evita o limite de 2/hora.
let link = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ type: 'invite', email, redirect_to: `${APP}/auth/confirm` }),
}).then((r) => r.json());

let otpType = 'invite';
if (!link.hashed_token) {
  // Conta já existe: `invite` recusa, `magiclink` serve.
  link = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: `${APP}/auth/confirm` }),
  }).then((r) => r.json());
  otpType = 'magiclink';
}

if (!link.hashed_token) {
  throw new Error(`não foi possível gerar o link: ${JSON.stringify(link).slice(0, 200)}`);
}

// 2. Criar o membership pendente (accepted_at fica null → sem acesso ainda).
const existing = await rest(
  `memberships?tenant_id=eq.${tenant.id}&user_id=eq.${link.id}&select=id`,
);

let membershipId;
if (existing.length > 0) {
  membershipId = existing[0].id;
} else {
  const [created] = await rest('memberships', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ tenant_id: tenant.id, user_id: link.id, role }),
  });
  membershipId = created.id;
}

const acceptUrl =
  `${APP}/auth/confirm?token_hash=${link.hashed_token}` +
  `&type=${otpType}&proximo=${encodeURIComponent(`/convite/${membershipId}`)}`;

console.log('');
console.log(`convidado : ${email}`);
console.log(`destino   : ${APP}`);
console.log(`empresa   : ${tenant.display_name} (${slug})`);
console.log(`papel     : ${role}`);
console.log(`membership: ${membershipId}  (accepted_at = null → sem acesso até aceitar)`);
console.log('');
console.log(acceptUrl);
console.log('');

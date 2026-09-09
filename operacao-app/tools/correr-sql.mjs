/**
 * Corre um ficheiro .sql contra o Postgres do Supabase.
 *
 * Existe porque o `psql` não está instalado em todas as máquinas, e porque
 * colar 700 linhas no SQL Editor do Studio é um convite a correr metade.
 *
 * Uso:
 *   node tools/correr-sql.mjs db/schema.sql
 *   node tools/correr-sql.mjs db/schema.sql --dry-run
 *
 * A ligação vem de DATABASE_URL, lida de operacao-app/.env ou do ambiente.
 * Obtém-a em: Supabase → Project Settings → Database → Connection string → URI
 * (usar a do "Session pooler" se a rede bloquear IPv6).
 *
 * ⚠ DATABASE_URL contém a password da base de dados. Nunca a metas no
 *   .env.example, nunca a commites, nunca a passes em linha de comando num
 *   computador partilhado.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── .env, sem dependências ──────────────────────────────────────────── */

function carregarEnv() {
  const caminho = join(RAIZ, ".env");
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, chave, bruto] = m;
    if (process.env[chave]) continue; // o ambiente ganha ao ficheiro
    process.env[chave] = bruto.replace(/^["']|["']$/g, "");
  }
}

carregarEnv();

/* ── Argumentos ──────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ficheiro = args.find((a) => !a.startsWith("--"));

if (!ficheiro) {
  console.error("Uso: node tools/correr-sql.mjs <ficheiro.sql> [--dry-run]");
  process.exit(1);
}

const caminhoSql = resolve(RAIZ, ficheiro);
if (!existsSync(caminhoSql)) {
  console.error(`✗ Ficheiro não encontrado: ${caminhoSql}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "✗ DATABASE_URL em falta.\n\n" +
      "  Supabase → Project Settings → Database → Connection string → URI\n" +
      "  Depois:  echo 'DATABASE_URL=postgresql://...' >> operacao-app/.env\n\n" +
      "  (o .env está no .gitignore — a password nunca vai para o repositório)"
  );
  process.exit(1);
}

/* ── Aviso de destino ────────────────────────────────────────────────── */

// Mostra a que base nos vamos ligar, SEM a password. Aplicar SQL na base
// errada é o erro que mais custa a desfazer.
function destinoLegivel(u) {
  try {
    const p = new URL(u);
    return `${p.hostname}${p.pathname}`;
  } catch {
    return "(não consegui interpretar a DATABASE_URL)";
  }
}

const sql = readFileSync(caminhoSql, "utf8");

console.log(`ficheiro : ${ficheiro}  (${sql.split(/\r?\n/).length} linhas)`);
console.log(`destino  : ${destinoLegivel(url)}`);
console.log(`modo     : ${dryRun ? "DRY-RUN (reverte no fim)" : "APLICAR"}`);
console.log("");

/* ── Execução ────────────────────────────────────────────────────────── */

const cliente = new pg.Client({
  connectionString: url,
  // O Supabase serve um certificado próprio; sem isto a ligação é recusada
  // em muitas máquinas. O canal continua cifrado.
  ssl: { rejectUnauthorized: false },
});

// As mensagens do RAISE NOTICE dentro do esquema são o relatório de
// verificação. Sem isto passavam despercebidas.
cliente.on("notice", (n) => {
  if (n.message) console.log(`  · ${n.message}`);
});

try {
  await cliente.connect();
} catch (e) {
  console.error(`✗ Não foi possível ligar: ${e.message}`);
  console.error(
    "\n  Se o erro for de rede/IPv6, usa a connection string do 'Session pooler'\n" +
      "  em vez da 'Direct connection'."
  );
  process.exit(1);
}

try {
  // Tudo numa transação: ou entra o ficheiro inteiro, ou não entra nada.
  // Mais vale não aplicar do que aplicar metade.
  await cliente.query("BEGIN");
  await cliente.query(sql);

  if (dryRun) {
    await cliente.query("ROLLBACK");
    console.log("\n✓ o SQL corre sem erros — revertido, nada foi gravado");
  } else {
    await cliente.query("COMMIT");
    console.log("\n✓ aplicado");
  }
} catch (e) {
  await cliente.query("ROLLBACK").catch(() => {});
  console.error(`\n✗ FALHOU — nada foi gravado.\n`);
  console.error(`  ${e.message}`);
  if (e.hint) console.error(`  sugestão: ${e.hint}`);
  if (e.position) {
    const ate = sql.slice(0, Number(e.position));
    console.error(`  linha ${ate.split(/\r?\n/).length} do ficheiro`);
  }
  process.exitCode = 1;
} finally {
  await cliente.end();
}

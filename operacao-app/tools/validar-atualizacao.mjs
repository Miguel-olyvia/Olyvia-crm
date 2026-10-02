/**
 * Prova o caminho de ATUALIZAÇÃO da produção — não a instalação limpa.
 *
 * A produção já tem os ficheiros antigos aplicados à mão. O que lá vai correr
 * é só a sequência nova de `docs/onde-estamos.md` §0:
 *
 *     seguranca.sql → tempos.sql → rpcs-tarefas.sql → medicoes.sql → obras.sql
 *
 * Este script monta duas bases:
 *   A) a produção de hoje: a sequência ANTIGA (lida do git, no commit-base)
 *      seguida da sequência de atualização;
 *   B) uma instalação limpa com os ficheiros atuais.
 * e exige que fiquem iguais: mesmas policies, mesmas funções (corpo e
 * search_path), mesmos privilégios e mesmas colunas. Se a ordem de
 * atualização deixar uma função antiga por cima de uma nova, é aqui que se vê.
 *
 *     node tools/validar-atualizacao.mjs [commit-base]     (default a8e096da)
 */

import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, DADOS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "a8e096da";
const atual = (f) => readFileSync(join(RAIZ, "db", f), "utf8");
const antigo = (f) =>
  execFileSync("git", ["show", `${BASE}:operacao-app/db/${f}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 26 });

const ANTIGA = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
];
const ATUALIZACAO = ["seguranca.sql", "tempos.sql", "rpcs-tarefas.sql", "medicoes.sql", "obras.sql"];
const LIMPA = [...ANTIGA, "seguranca.sql", "tempos.sql", "obras.sql"];

async function montar(nome, passos) {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(STUBS_CRM);
  await db.exec(DADOS_CRM);
  for (const [rotulo, sql] of passos) {
    try {
      await db.exec(sql);
    } catch (e) {
      console.log(`✗ ${nome}: ${rotulo} falhou — ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`→ ${nome}: ${passos.length} ficheiros aplicados`);
  return db;
}

// O que conta como "a base é a mesma".
const RETRATO = {
  policies: `SELECT tablename || '.' || policyname AS k,
                    cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
                    coalesce(qual, '') || ' | ' || coalesce(with_check, '') AS v
               FROM pg_policies WHERE tablename LIKE 'ops\\_%'`,
  funcoes: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k,
                   md5(replace(p.prosrc, E'\r', '')) || ' | ' || coalesce(array_to_string(p.proconfig, ','), '') ||
                   ' | secdef=' || p.prosecdef AS v
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND (p.proname LIKE 'ops\\_%' OR p.proname LIKE 'rpc\\_ops\\_%')`,
  privilegios_funcoes: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k,
                   coalesce(array_to_string(ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY 1), ','), '(default)') AS v
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND (p.proname LIKE 'ops\\_%' OR p.proname LIKE 'rpc\\_ops\\_%')`,
  privilegios_tabelas: `SELECT table_name || '.' || grantee AS k,
                   string_agg(privilege_type, ',' ORDER BY privilege_type) AS v
              FROM information_schema.role_table_grants
             WHERE table_schema = 'public' AND table_name LIKE 'ops\\_%'
             GROUP BY table_name, grantee`,
  colunas: `SELECT table_name || '.' || column_name AS k,
                   data_type || ' | null=' || is_nullable || ' | ' || coalesce(column_default, '') AS v
              FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name LIKE 'ops\\_%'`,
  restricoes: `SELECT conrelid::regclass::text || '.' || conname AS k, pg_get_constraintdef(oid) AS v
              FROM pg_constraint WHERE conrelid::regclass::text LIKE 'ops\\_%'`,
  triggers: `SELECT tgrelid::regclass::text || '.' || tgname AS k, pg_get_triggerdef(oid) AS v
              FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'ops\\_%'`,
};

async function retrato(db) {
  const r = {};
  for (const [nome, sql] of Object.entries(RETRATO)) {
    r[nome] = new Map((await db.query(sql)).rows.map((x) => [x.k, x.v]));
  }
  return r;
}

const prod = await montar("produção atualizada", [
  ...ANTIGA.map((f) => [`${f} (antigo, ${BASE})`, antigo(f)]),
  ...ATUALIZACAO.map((f) => [f, atual(f)]),
]);
const limpa = await montar("instalação limpa", LIMPA.map((f) => [f, atual(f)]));

const [a, b] = [await retrato(prod), await retrato(limpa)];
let falhas = 0;
for (const nome of Object.keys(RETRATO)) {
  const dif = [];
  for (const k of new Set([...a[nome].keys(), ...b[nome].keys()])) {
    if (a[nome].get(k) !== b[nome].get(k)) {
      dif.push(`    ${k}\n      produção: ${a[nome].get(k) ?? "(não existe)"}\n      limpa:    ${b[nome].get(k) ?? "(não existe)"}`);
    }
  }
  if (dif.length === 0) {
    console.log(`  ✓ ${nome}: iguais (${b[nome].size})`);
  } else {
    falhas += dif.length;
    console.log(`  ✗ ${nome}: ${dif.length} diferença(s)\n${dif.slice(0, 15).join("\n")}`);
  }
}

if (falhas) {
  console.log(`\n✗ a atualização da produção NÃO dá o mesmo que uma instalação limpa`);
  process.exit(1);
}
console.log("\n✓ atualizar a produção pela ordem de §0 dá exatamente a mesma base que instalar de novo");

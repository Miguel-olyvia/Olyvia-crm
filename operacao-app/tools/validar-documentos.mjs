/**
 * Documentos na ordem, e o histórico do equipamento.
 *
 *     npm run validar-documentos
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const todos = async (sql, p = []) => (await db.query(sql, p)).rows;

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };
const conferir = (c, m) => (c ? ok(m) : mau(m));

const ORG = "11111111-1111-1111-1111-111111111111";
const ENT = "77777777-7777-7777-7777-777777777777";
const CLI = "22222222-2222-2222-2222-222222222222";

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE TABLE IF NOT EXISTS storage.buckets (
    id text PRIMARY KEY, name text, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE IF NOT EXISTS storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text, name text, owner uuid, created_at timestamptz DEFAULT now());
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('${ENT}', 'Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '${ENT}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql",
  "rpcs-tarefas.sql", "planos.sql", "correcoes-modelo.sql", "anexos.sql", "mapa.sql",
  "campos-ordem.sql",
]) {
  await db.exec(ler(f));
}
await db.exec(ler("documentos-e-ativos.sql"));
// Um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("documentos-e-ativos.sql"));

console.log("\n─── o que se pode anexar ────────────────");
{
  const tipos = (await todos(
    `SELECT unnest(allowed_mime_types) AS m FROM storage.buckets WHERE id = 'operacoes'`
  )).map((r) => r.m);

  const precisa = {
    "PDF": "application/pdf",
    "Word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "CSV": "text/csv",
  };
  for (const [nome, mime] of Object.entries(precisa)) {
    conferir(tipos.includes(mime), `aceita ${nome}`);
  }

  // Os que já lá estavam não se perdem por correr isto.
  for (const [nome, mime] of Object.entries({
    "fotografias": "image/jpeg",
    "fotos do iPhone": "image/heic",
    "notas de voz": "audio/mpeg",
  })) {
    conferir(tipos.includes(mime), `continua a aceitar ${nome}`);
  }

  // Um bucket que aceita tudo aceita também um executável.
  for (const mau of [
    "application/x-msdownload",
    "application/x-sh",
    "application/octet-stream",
  ]) {
    conferir(!tipos.includes(mau), `NÃO aceita ${mau}`);
  }

  conferir(new Set(tipos).size === tipos.length, "sem tipos repetidos, mesmo depois de duas passagens");
}

console.log("\n─── o histórico do equipamento ──────────");
let at;
{
  const loc = (await um(
    `INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo)
     VALUES ($1,$2,'L-1','Piso 22','espaco') RETURNING id`, [ORG, CLI])).id;
  const loc2 = (await um(
    `INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo)
     VALUES ($1,$2,'L-2','Piso 23','espaco') RETURNING id`, [ORG, CLI])).id;

  at = (await um(
    `INSERT INTO public.ops_ativo (organization_id, local_id, codigo, nome, criticidade)
     VALUES ($1,$2,'A-1','Extintor do hall','normal') RETURNING id`, [ORG, loc])).id;

  const criado = await um(
    `SELECT tipo, descricao FROM public.ops_evento
      WHERE entidade='ativo' AND entidade_id=$1`, [at]);
  conferir(criado?.tipo === "criado", "criar um equipamento fica no histórico");
  conferir(criado?.descricao.includes("Extintor do hall"), "com o nome dele");

  await db.query(
    `UPDATE public.ops_ativo SET criticidade='critica' WHERE id=$1`, [at]);
  const alt = await um(
    `SELECT tipo, antes, depois FROM public.ops_evento
      WHERE entidade='ativo' AND entidade_id=$1 AND tipo='alterado'`, [at]);
  conferir(!!alt, "mudar a criticidade fica no histórico");
  conferir(alt?.antes?.criticidade === "normal" && alt?.depois?.criticidade === "critica",
    "com o antes e o depois");

  // `atualizado_em` muda sempre e não conta nada a quem lê.
  const antes = (await um(
    `SELECT count(*)::int AS n FROM public.ops_evento WHERE entidade='ativo' AND entidade_id=$1`,
    [at])).n;
  await db.query(`UPDATE public.ops_ativo SET atualizado_em=now() WHERE id=$1`, [at]);
  const depois = (await um(
    `SELECT count(*)::int AS n FROM public.ops_evento WHERE entidade='ativo' AND entidade_id=$1`,
    [at])).n;
  conferir(antes === depois, "mexer só na data de atualização NÃO escreve nada");

  await db.query(`UPDATE public.ops_ativo SET local_id=$2 WHERE id=$1`, [at, loc2]);
  conferir(
    !!(await um(`SELECT 1 FROM public.ops_evento
                  WHERE entidade='ativo' AND entidade_id=$1 AND tipo='mudou_de_sitio'`, [at])),
    "mudar de sítio tem um nome próprio no histórico"
  );

  await db.query(`UPDATE public.ops_ativo SET ativo=false WHERE id=$1`, [at]);
  conferir(
    !!(await um(`SELECT 1 FROM public.ops_evento
                  WHERE entidade='ativo' AND entidade_id=$1 AND tipo='desativado'`, [at])),
    "desativar também"
  );
  await db.query(`UPDATE public.ops_ativo SET ativo=true WHERE id=$1`, [at]);
  conferir(
    !!(await um(`SELECT 1 FROM public.ops_evento
                  WHERE entidade='ativo' AND entidade_id=$1 AND tipo='reativado'`, [at])),
    "e reativar"
  );
}

console.log("\n─── sem sessão, grava na mesma ──────────");
{
  // Uma importação corre sem ninguém. O histórico fica com autor nulo em vez
  // de a importação rebentar por causa dele.
  const ev = await um(
    `SELECT autor_id FROM public.ops_evento
      WHERE entidade='ativo' AND entidade_id=$1 ORDER BY criado_em LIMIT 1`, [at]);
  conferir(ev !== undefined, "o histórico existe mesmo sem utilizador");
  conferir(ev?.autor_id === null, "com autor nulo, e não inventado");
}

console.log("\n─── o módulo continua contido ───────────");
{
  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  conferir(fk.n === 0, "zero chaves estrangeiras de ops_* para fora");
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ documentos aceites, e o equipamento passa a ter memória");

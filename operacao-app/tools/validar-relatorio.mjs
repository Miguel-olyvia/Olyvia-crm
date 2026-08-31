/**
 * Prova que o relatório só sai quando devia, e para quem devia.
 *
 * É a coisa mais perigosa que o módulo faz: escreve para fora, e um email
 * mandado não se chama de volta. Por isso o que aqui se testa não é só "o
 * email sai" — é sobretudo **quando NÃO sai**.
 *
 *     npm run validar-relatorio
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
const GESTOR = "33333333-3333-3333-3333-333333333333";

await db.exec(STUBS_CRM);

// A fila de saída do CRM, tal como ela é. O módulo escreve aqui e mais nada.
await db.exec(`
  CREATE TABLE IF NOT EXISTS public.scheduled_emails (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    organization_id uuid,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    to_email text NOT NULL,
    subject text,
    body_html text,
    template_id uuid,
    smtp_id uuid,
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    sent_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.anew_entity_emails (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL,
    email text NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`);

await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('${ENT}', 'Padaria Central');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '${ENT}');
  INSERT INTO public.anew_users (id, name, email, auth_user_id)
    VALUES ('${GESTOR}', 'Rita Gestora', 'rita@olyvia.pt', '44444444-4444-4444-4444-444444444444');
`);

for (const f of ["schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql"]) {
  await db.exec(ler(f));
}
await db.exec(ler("anexos.sql"));
await db.exec(ler("assinaturas.sql"));
await db.exec(ler("relatorio-automatico.sql"));
// Um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("relatorio-automatico.sql"));

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
  VALUES ('${ORG}', '${GESTOR}', 'gestor');
`);

let n = 0;
async function criarOrdem(titulo) {
  n += 1;
  const r = await um(
    `INSERT INTO public.ops_ordem
       (organization_id, codigo, origem, estado, cliente_id, titulo, fechada_em)
     VALUES ($1, $2, 'preventiva', 'fechada', $3, $4, now())
     RETURNING id`,
    [ORG, `OT-${String(n).padStart(4, "0")}`, CLI, titulo]
  );
  return r.id;
}

/** Confirmar é escrever o evento — é isso que o gatilho ouve. */
async function confirmar(ordemId, autor = GESTOR) {
  await db.query(
    `INSERT INTO public.ops_evento
       (organization_id, entidade, entidade_id, tipo, autor_id, antes, depois)
     VALUES ($1, 'ordem', $2, 'confirmar', $3, '{}'::jsonb, '{}'::jsonb)`,
    [ORG, ordemId, autor]
  );
}

const naFila = async (ordemId) =>
  (await todos(`SELECT * FROM public.scheduled_emails WHERE entity_id = $1`, [ordemId]));

const ligar = (v) =>
  db.query(
    `INSERT INTO public.ops_definicao (organization_id, chave, valor)
     VALUES ($1, 'relatorio_automatico', $2)
     ON CONFLICT (organization_id, chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [ORG, v]
  );

console.log("\n─── desligado à nascença ────────────────");
{
  const o = await criarOrdem("Sem ninguém ter ligado nada");
  await db.query(`INSERT INTO public.anew_entity_emails (entity_id, email, is_primary)
                  VALUES ($1, 'cliente@exemplo.pt', true)`, [ENT]);
  await confirmar(o);
  conferir(
    (await naFila(o)).length === 0,
    "uma organização acabada de instalar não escreve a cliente nenhum"
  );
  conferir(
    (await um(`SELECT public.ops_definicao_de($1,'relatorio_automatico') AS v`, [ORG])).v === "nao",
    "e a definição diz 'nao' sem ninguém a ter criado"
  );
}

console.log("\n─── ligado ──────────────────────────────");
await ligar("sim");
{
  const o = await criarOrdem("Manutenção do forno");
  await confirmar(o);
  const fila = await naFila(o);
  conferir(fila.length === 1, "confirmar a ordem põe o email na fila");
  if (fila.length === 1) {
    const e = fila[0];
    conferir(e.to_email === "cliente@exemplo.pt", "vai para o email da ficha do cliente");
    conferir(e.status === "pending", "fica pendente, para o cron o levar");
    conferir(e.entity_type === "ops_ordem", "identificado como ordem de Operações");
    conferir(
      e.subject.includes("Manutenção do forno"),
      "o assunto diz o código e o título"
    );
    conferir(
      e.user_id === "44444444-4444-4444-4444-444444444444",
      "sai pelo SMTP de quem confirmou, e não de quem executou"
    );
    conferir(e.template_id === null, "sem template — o corpo vai escrito");
  }
}

console.log("\n─── o que NÃO manda ─────────────────────");
{
  const o = await criarOrdem("Só fechada, não confirmada");
  await db.query(
    `INSERT INTO public.ops_evento (organization_id, entidade, entidade_id, tipo, autor_id, antes, depois)
     VALUES ($1,'ordem',$2,'fechar',$3,'{}'::jsonb,'{}'::jsonb)`,
    [ORG, o, GESTOR]
  );
  conferir(
    (await naFila(o)).length === 0,
    "fechar não manda nada — só confirmar (trabalho por rever não sai de casa)"
  );
}
{
  const o = await criarOrdem("Confirmada duas vezes");
  await confirmar(o);
  await confirmar(o);
  conferir(
    (await naFila(o)).length === 1,
    "reabrir e voltar a confirmar não manda o mesmo email outra vez"
  );
}
{
  // Um cliente sem email na ficha: é uma ficha por preencher, não um erro.
  const ent2 = "88888888-8888-8888-8888-888888888888";
  const cli2 = "99999999-9999-9999-9999-999999999999";
  await db.exec(`
    INSERT INTO public.anew_entities (id, display_name) VALUES ('${ent2}','Sem Email Lda');
    INSERT INTO public.anew_clients (id, organization_id, entity_id)
      VALUES ('${cli2}','${ORG}','${ent2}');
  `);
  n += 1;
  const o = (await um(
    `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo)
     VALUES ($1,$2,'preventiva','fechada',$3,'Cliente sem email') RETURNING id`,
    [ORG, `OT-${String(n).padStart(4, "0")}`, cli2]
  )).id;
  await confirmar(o);
  conferir((await naFila(o)).length === 0, "sem email na ficha não se inventa destinatário");

  const est = await um(`SELECT estado FROM public.ops_ordem WHERE id = $1`, [o]);
  conferir(est.estado === "fechada", "e a ordem confirma-se na mesma — o email é acessório");
}
{
  await ligar("nao");
  const o = await criarOrdem("Depois de desligarem");
  await confirmar(o);
  conferir((await naFila(o)).length === 0, "desligar desliga mesmo");
  await ligar("sim");
}

console.log("\n─── o corpo do email ────────────────────");
{
  const o = await criarOrdem("Inspeção anual");
  await db.query(
    `INSERT INTO public.ops_ordem_tarefa (ordem_id, posicao, nome, tipo, estado, valor_num, unidade)
     VALUES ($1, 1, 'Pressão do circuito', 'medicao', 'nao_conforme', 2.4, 'bar')`,
    [o]
  );
  const html = (await um(`SELECT public.ops_relatorio_html($1) AS h`, [o])).h;
  conferir(html.includes("Inspeção anual"), "leva o título da ordem");
  conferir(html.includes("Padaria Central"), "leva o nome do cliente");
  conferir(html.includes("Pressão do circuito"), "leva as tarefas");
  conferir(html.includes("2,4 bar"), "leva o valor medido com a unidade, e em portugues");
  conferir(html.includes("Não conforme"), "diz o que não ficou conforme");
  conferir(!html.includes("<script"), "não leva script nenhum");
}
{
  // Um cliente chamado `<script>` não pode partir o email de quem o recebe.
  const ent3 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const cli3 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  await db.exec(`
    INSERT INTO public.anew_entities (id, display_name)
      VALUES ('${ent3}', '<script>alert(1)</script> & Filhos');
    INSERT INTO public.anew_clients (id, organization_id, entity_id)
      VALUES ('${cli3}','${ORG}','${ent3}');
  `);
  n += 1;
  const o = (await um(
    `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo)
     VALUES ($1,$2,'preventiva','fechada',$3,'Ordem normal') RETURNING id`,
    [ORG, `OT-${String(n).padStart(4, "0")}`, cli3]
  )).id;
  const html = (await um(`SELECT public.ops_relatorio_html($1) AS h`, [o])).h;
  conferir(!html.includes("<script>alert"), "um nome com HTML lá dentro é escapado");
  conferir(html.includes("&lt;script&gt;"), "e aparece como texto, que é o que é");
  conferir(html.includes("&amp; Filhos"), "o & também");
}

console.log("\n─── quem pode ligar isto ────────────────");
{
  conferir(
    (await um(`SELECT count(*)::int AS n FROM pg_proc
                WHERE proname = 'rpc_ops_definir' AND prosecdef`)).n === 1,
    "a definição só se muda por RPC, e a RPC é SECURITY DEFINER"
  );
  conferir(
    (await um(`SELECT count(*)::int AS n FROM pg_policies
                WHERE tablename = 'ops_definicao' AND cmd <> 'SELECT'`)).n === 0,
    "não há política de escrita direta na tabela"
  );
  conferir(
    (await um(`SELECT has_table_privilege('anon','public.ops_definicao','SELECT') AS p`)).p === false,
    "quem não tem sessão não lê as definições"
  );
  conferir(
    (await um(`SELECT has_function_privilege('authenticated','public.ops_agendar_relatorio(uuid,uuid)','EXECUTE') AS p`)).p === false,
    "ninguém chama o envio à mão — só o gatilho"
  );
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

  const escreve = await um(`
    SELECT count(*)::int AS n FROM pg_proc p
     WHERE p.proname LIKE 'ops\\_%'
       AND p.prosrc ILIKE '%INSERT INTO public.scheduled_emails%'`);
  conferir(escreve.n === 1, "só uma função escreve na fila de emails");
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ o relatório só sai quando devia, e para quem devia");

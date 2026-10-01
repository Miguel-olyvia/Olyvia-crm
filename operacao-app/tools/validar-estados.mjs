/**
 * A máquina de estados existe duas vezes, de propósito:
 *
 *   · `src/domain/estados.ts` — no browser, para desenhar os botões certos e
 *     responder de imediato;
 *   · `rpc_ops_transitar_ordem` — na base, a que manda (versão em vigor:
 *     db/tempos.sql).
 *
 * Duas cópias da mesma regra divergem sempre, mais cedo ou mais tarde. Este
 * teste não compara texto: corre TODAS as combinações de
 *
 *     estado (7) × transição (9) × função (5) × está na ordem? (2)
 *              × contexto (completo / sem motivo e com tarefa pendente)
 *
 * contra as duas, e exige que digam o mesmo — sim ou não, e para onde.
 * Se alguém mudar uma sem a outra, é aqui que se sabe.
 *
 * Importa o TypeScript diretamente (Node ≥ 22.6 apaga os tipos sozinho).
 *
 *     npm run validar-estados
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, PRIVILEGIOS_SUPABASE, AUTENTICACAO_REAL } from "./_stubs-crm.mjs";
import { avaliar, TRANSICOES } from "../src/domain/estados.ts";
import { ESTADOS, FUNCOES } from "../src/domain/tipos.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";
const ROLE = "dddd0000-0000-0000-0000-00000000000d";
const OUTRO = "99990000-0000-0000-0000-000000000099";

// Uma pessoa por função. O índice dá ids previsíveis.
const pessoa = (i) => `5555000${i}-0000-0000-0000-00000000000${i}`;
const auth = (i) => `6666000${i}-0000-0000-0000-00000000000${i}`;

await db.exec(STUBS_CRM);
await db.exec(PRIVILEGIOS_SUPABASE);
await db.exec(AUTENTICACAO_REAL);
for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql",
]) {
  try { await db.exec(ler(f)); }
  catch (e) { console.error(`✗ ${f} não correu: ${e.message}`); process.exit(1); }
}

await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES ('${ROLE}','${ORG}','Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT '${ROLE}'::uuid, code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_users (id, auth_user_id, name, email)
    VALUES ('${OUTRO}', NULL, 'Outra pessoa', 'outro@x.pt');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
    VALUES ('${ORG}','${OUTRO}','tecnico');
  ${FUNCOES.map((f, i) => `
    INSERT INTO public.anew_users (id, auth_user_id, name, email)
      VALUES ('${pessoa(i)}','${auth(i)}','${f}','${f}@x.pt');
    INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
      VALUES ('${pessoa(i)}','${ORG}','${ROLE}','active');
    INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
      VALUES ('${ORG}','${pessoa(i)}','${f}');`).join("\n")}
`);

const CONTEXTOS = {
  completo: { motivo: "motivo", retoma: true, pendente: false },
  "sem motivo, tarefa pendente": { motivo: null, retoma: false, pendente: true },
};

/** O que a base diz: { ok, para } — corre e desfaz tudo. */
async function naBase(estado, transicao, i, atribuido, c) {
  const ordem = "0e000000-0000-0000-0000-000000000001";
  const sql = `
    BEGIN;
    INSERT INTO public.ops_ordem (id, organization_id, codigo, origem, estado, cliente_id, titulo,
                                  responsavel_id, pausa_motivo, pausa_retoma_prevista)
    VALUES ('${ordem}','${ORG}','OT-X','corretiva','${estado}','${CLI}','X',
            '${atribuido ? pessoa(i) : OUTRO}',
            ${estado === "pausada" ? "'parada', now() + interval '1 day'" : "NULL, NULL"});
    ${c.pendente ? `INSERT INTO public.ops_ordem_tarefa (ordem_id, nome, obrigatoria) VALUES ('${ordem}','T', true);` : ""}
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${auth(i)}';
    SELECT public.rpc_ops_transitar_ordem('${ordem}','${transicao}',
             ${c.motivo ? `'${c.motivo}'` : "NULL"},
             ${c.retoma ? "now() + interval '1 day'" : "NULL"}) AS r;
    ROLLBACK;`;
  try {
    const res = await db.exec(sql);
    const linha = res.flatMap((x) => x.rows ?? []).at(-1);
    const r = typeof linha?.r === "string" ? JSON.parse(linha.r) : linha?.r;
    return { ok: true, para: r?.para };
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    return { ok: false, motivo: e.message.split("\n")[0] };
  }
}

let combinacoes = 0;
const divergencias = [];

for (const [nomeCtx, c] of Object.entries(CONTEXTOS)) {
  for (const estado of ESTADOS) {
    for (const transicao of TRANSICOES) {
      for (const [i, funcao] of FUNCOES.entries()) {
        for (const atribuido of [true, false]) {
          combinacoes++;
          const ts = avaliar(estado, transicao, {
            funcao,
            atribuido,
            tarefas: c.pendente ? [{ estado: "pendente", obrigatoria: true }] : [],
            motivo: c.motivo,
            retomaPrevista: c.retoma ? new Date(Date.now() + 86400000) : null,
          });
          const sql = await naBase(estado, transicao, i, atribuido, c);
          const igual = ts.ok === sql.ok && (!ts.ok || ts.para === sql.para);
          if (!igual) {
            divergencias.push(
              `${estado} --${transicao}--> [${funcao}${atribuido ? ", na ordem" : ""}; ${nomeCtx}]: ` +
              `TS ${ts.ok ? `→ ${ts.para}` : `recusa (${ts.motivo})`} · ` +
              `SQL ${sql.ok ? `→ ${sql.para}` : `recusa (${sql.motivo})`}`);
          }
        }
      }
    }
  }
}

console.log(`\n─── ${combinacoes} combinações, TypeScript contra a base ───`);
if (divergencias.length) {
  for (const d of divergencias.slice(0, 40)) console.log(`  ✗ ${d}`);
  if (divergencias.length > 40) console.log(`  … e mais ${divergencias.length - 40}`);
  console.error(`\n✗ ${divergencias.length} combinação(ões) em que o browser e a base discordam`);
  process.exit(1);
}
console.log(`  ✓ as ${combinacoes} dizem o mesmo — sim ou não, e para onde`);
console.log("\n✓ src/domain/estados.ts e rpc_ops_transitar_ordem são a mesma máquina");

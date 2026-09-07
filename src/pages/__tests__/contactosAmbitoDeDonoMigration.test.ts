/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Os contactos das fichas (email, telefone, morada) vazavam. Medido AO VIVO na
// nike a 2026-09-07, pela API directa do PostgREST com o token da conta
// teste-scope-membro (ambito OWNED, dona de 9 leads): 256 emails visiveis, dos
// quais so 9 eram das suas fichas -- os outros 247 eram de leads de colegas.
// Tambem 187 telefones, 35 anew_entity_addresses e 22 anew_addresses. A ficha
// (anew_leads) ja estava fechada desde 18/11, mas o email e o telefone dela
// nao. Causa: as politicas de contacto usavam is_entity_in_user_scope, que da
// acesso org-only, sem ambito de dono.
//
// A migracao 20261119030000 fecha as tres operacoes (SELECT/UPDATE/DELETE) das
// quatro tabelas: um contacto so e visivel se ALGUMA lead OU cliente do
// entity_id estiver no ambito de dono da pessoa, com o ambito resolvido UMA VEZ
// POR CONSULTA (o mesmo motor crm_scope_keys de 20261118030000). Preserva os
// ramos de organizacao e de criador (cabecalhos de org/utilizador nao partem) e
// abandona so o ramo anew_contacts, que esta vazio (confirmado ao vivo).
//
// Estes testes leem o SQL das duas migracoes (correccao + reversao escrita ao
// lado) e confirmam as propriedades que importam:
//   1. a funcao recebe as chaves JA resolvidas e nao resolve ambito por dentro;
//   2. cada politica embrulha crm_scope_keys num (SELECT ...) -> uma vez por
//      consulta, nunca uma vez por linha;
//   3. as doze politicas (3 operacoes x 4 tabelas) sao mesmo alteradas, com o
//      codigo de permissao certo por operacao (view/edit/delete);
//   4. os ramos organizacao/criador ficam; is_entity_in_user_scope sai;
//   5. o INSERT e o WITH CHECK ficam intactos;
//   6. a reversao repoe as doze e nao larga a funcao.
//
// RESSALVA, a dizer por escrito: projeto/CLAUDE.md pede testes de integracao
// reais (pgTAP ou Supabase local) e desaconselha string-matching sobre o .sql.
// Aqui nao ha alternativa possivel nesta maquina: a base local esta proibida e
// a migracao esta POR APLICAR, portanto nao existe ambiente onde a politica
// possa ser exercida ainda. Este teste e uma rede contra regressoes de FORMA (a
// forma ingenua que resolveria o ambito por linha, uma politica esquecida, uma
// operacao de escrita deixada aberta, o WITH CHECK apertado por engano), NAO
// uma prova de comportamento. A prova de comportamento e a contagem descrita no
// fim da migracao (256 -> so as proprias), corrida contra o remoto antes e
// depois do db push. O vermelho ja foi colhido ao vivo antes de escrever isto.

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261119030000_contactos_ambito_de_dono.sql",
);
// A reversao foi movida para fora de supabase/migrations/ de proposito: uma
// migracao de reversao na pasta de migracoes seria aplicada pelo proximo
// "db push" e desfazia a correccao. Fica guardada, mas nunca pendente.
const reversalPath = resolve(
  process.cwd(),
  "supabase/reversoes-guardadas/20261119040000_reverter_ambito_contactos.sql",
);

function stripLineComments(raw: string) {
  return raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

function normalize(raw: string) {
  return raw.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim();
}

function sqlOf(path: string) {
  return normalize(stripLineComments(readFileSync(path, "utf8")));
}

/** Corpo de cada ALTER POLICY, indexado pelo nome da politica. */
function alteredPolicies(sql: string) {
  const bodies = new Map<string, string>();
  const parts = sql.split("alter policy ");
  for (const part of parts.slice(1)) {
    const name = part.split(/\s+/)[0];
    const end = part.search(
      /;\s*(alter policy|comment on|create |revoke |grant )|;\s*$/,
    );
    bodies.set(name, end === -1 ? part : part.slice(0, end));
  }
  return bodies;
}

/** O corpo da funcao entre os marcadores $function$. */
function functionBody(rawSql: string) {
  const norm = normalize(stripLineComments(rawSql));
  const first = norm.indexOf("$function$");
  const second = norm.indexOf("$function$", first + 1);
  return norm.slice(first + "$function$".length, second);
}

const ENTITY_CONTACT_POLICIES = [
  { name: "authenticated_select_anew_entity_emails", op: "view", table: "anew_entity_emails" },
  { name: "authenticated_update_anew_entity_emails", op: "edit", table: "anew_entity_emails" },
  { name: "authenticated_delete_anew_entity_emails", op: "delete", table: "anew_entity_emails" },
  { name: "authenticated_select_anew_entity_phones", op: "view", table: "anew_entity_phones" },
  { name: "authenticated_update_anew_entity_phones", op: "edit", table: "anew_entity_phones" },
  { name: "authenticated_delete_anew_entity_phones", op: "delete", table: "anew_entity_phones" },
  { name: "authenticated_select_anew_entity_addresses", op: "view", table: "anew_entity_addresses" },
  { name: "authenticated_update_anew_entity_addresses", op: "edit", table: "anew_entity_addresses" },
  { name: "authenticated_delete_anew_entity_addresses", op: "delete", table: "anew_entity_addresses" },
];

const ADDRESS_POLICIES = [
  { name: "authenticated_select_anew_addresses", op: "view" },
  { name: "authenticated_update_anew_addresses", op: "edit" },
  { name: "authenticated_delete_anew_addresses", op: "delete" },
];

const ALL_POLICY_NAMES = [
  ...ENTITY_CONTACT_POLICIES.map((p) => p.name),
  ...ADDRESS_POLICIES.map((p) => p.name),
];

const PERM = { view: "leads.view", edit: "leads.edit", delete: "leads.delete" } as const;
const CPERM = { view: "clients.view", edit: "clients.edit", delete: "clients.delete" } as const;

describe("migration: ambito de dono nos contactos das fichas", () => {
  it("cria as duas migracoes forward-only (correccao e reversao)", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(reversalPath)).toBe(true);
  });

  it("a funcao recebe entity_id + as DUAS listas de chaves ja resolvidas", () => {
    const sql = sqlOf(migrationPath);
    expect(sql).toContain(
      "create or replace function public.is_entity_contact_in_owner_scope( _entity_id uuid, _lead_scope_keys text[], _client_scope_keys text[] ) returns boolean",
    );
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("stable");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path to 'public'");
    expect(sql).toContain(
      "revoke all on function public.is_entity_contact_in_owner_scope(uuid, text[], text[]) from public, anon",
    );
    expect(sql).toContain(
      "grant execute on function public.is_entity_contact_in_owner_scope(uuid, text[], text[]) to authenticated, service_role",
    );
  });

  it("a funcao NAO resolve ambito por dentro -- recebe-o pronto", () => {
    const body = functionBody(readFileSync(migrationPath, "utf8"));
    // Toda a resolucao de ambito e do chamador (InitPlan). Se alguem meter
    // crm_scope_keys ou resolve_lead_access_context DENTRO da funcao, ela passa
    // a resolver por linha e o custo explode.
    expect(body).not.toContain("crm_scope_keys");
    expect(body).not.toContain("resolve_lead_access_context");
    // Mas usa mesmo as chaves recebidas, nos dois ramos.
    expect(body).toContain("= any (_lead_scope_keys)");
    expect(body).toContain("= any (_client_scope_keys)");
    // A regra e "org:*, org:assigned_to, org:created_by" em cada ramo.
    expect(body).toContain("(l.organization_id::text || ':*') = any (_lead_scope_keys)");
    expect(body).toContain(
      "(l.organization_id::text || ':' || l.assigned_to::text) = any (_lead_scope_keys)",
    );
    expect(body).toContain(
      "(l.organization_id::text || ':' || l.created_by::text) = any (_lead_scope_keys)",
    );
  });

  it("preserva os ramos organizacao e criador, e abandona o ramo anew_contacts", () => {
    const body = functionBody(readFileSync(migrationPath, "utf8"));
    // Cabecalhos de organizacao: inalterado (get_user_visible_org_ids).
    expect(body).toContain("from public.anew_organizations o");
    expect(body).toContain("get_user_visible_org_ids(v_auth_uid)");
    // Ramo do criador, palavra por palavra de is_entity_in_user_scope.
    expect(body).toContain("from public.anew_entities e");
    expect(body).toContain("e.created_by = v_auth_uid");
    expect(body).toContain("from public.anew_users au");
    // anew_contacts esta vazio: o ramo org-only nao volta a entrar.
    expect(body).not.toContain("anew_contacts");
  });

  it("a fuga fecha-se: is_entity_in_user_scope sai das politicas de contacto", () => {
    const sql = sqlOf(migrationPath);
    // A migracao substitui completamente a funcao org-only nestas tabelas.
    expect(sql).not.toContain("is_entity_in_user_scope");
  });

  it("altera as doze politicas (3 operacoes x 4 tabelas), sem deixar nenhuma", () => {
    const bodies = alteredPolicies(sqlOf(migrationPath));
    expect([...bodies.keys()].sort()).toEqual([...ALL_POLICY_NAMES].sort());
  });

  it("cada politica de contacto direto embrulha o ambito num (SELECT ...)", () => {
    const bodies = alteredPolicies(sqlOf(migrationPath));
    for (const { name, op } of ENTITY_CONTACT_POLICIES) {
      const body = bodies.get(name);
      expect(body, `politica ${name} em falta`).toBeDefined();
      expect(body).toContain("public.is_entity_contact_in_owner_scope(");
      // Subquery escalar sem correlacao -> InitPlan -> uma vez por consulta.
      expect(body).toContain(`(select public.crm_scope_keys('${PERM[op]}'::text))`);
      expect(body).toContain(`(select public.crm_scope_keys('${CPERM[op]}'::text))`);
      // O contacto e resolvido pela coluna entity_id da propria linha.
      expect(body).toContain("is_entity_contact_in_owner_scope( entity_id,");
    }
  });

  it("anew_addresses mantem o ramo de morada de organizacao separado", () => {
    const bodies = alteredPolicies(sqlOf(migrationPath));
    for (const { name, op } of ADDRESS_POLICIES) {
      const body = bodies.get(name);
      expect(body, `politica ${name} em falta`).toBeDefined();
      // Morada da entidade -> ambito de dono, via a nova funcao sobre ea.entity_id.
      expect(body).toContain("from public.anew_entity_addresses ea");
      expect(body).toContain(
        "public.is_entity_contact_in_owner_scope( ea.entity_id,",
      );
      expect(body).toContain(`(select public.crm_scope_keys('${PERM[op]}'::text))`);
      expect(body).toContain(`(select public.crm_scope_keys('${CPERM[op]}'::text))`);
      // Morada de organizacao: ramo inalterado.
      expect(body).toContain("from public.anew_org_addresses oa");
      expect(body).toContain(
        "oa.org_id in (select public.get_user_visible_org_ids((select auth.uid())))",
      );
    }
  });

  it("todo o crm_scope_keys esta embrulhado em (SELECT ...) -- nada corre por linha", () => {
    const sql = sqlOf(migrationPath);
    const total = sql.match(/crm_scope_keys\s*\(/g)?.length ?? 0;
    const wrapped = sql.match(/\(select public\.crm_scope_keys\s*\(/g)?.length ?? 0;
    expect(total).toBeGreaterThan(0);
    expect(wrapped).toBe(total);
    // 4 tabelas x 3 operacoes x 2 codigos (leads + clients) = 24 chamadas.
    expect(total).toBe(24);
  });

  it("nao toca no INSERT nem no WITH CHECK, e nao mexe em dados", () => {
    const sql = sqlOf(migrationPath);
    expect(sql).not.toContain("with check");
    expect(sql).not.toContain("alter policy authenticated_insert");
    expect(sql).not.toContain("system_admin_pii_default_deny");
    expect(sql).not.toContain("drop policy");
    expect(sql).not.toContain("drop function");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("insert into");
    expect(sql).not.toContain("update public.");
  });

  it("o cabecalho explica a fuga com os numeros medidos e como se reverte", () => {
    const raw = readFileSync(migrationPath, "utf8");
    expect(raw).toContain("256");
    expect(raw).toContain("247");
    expect(raw).toContain("InitPlan");
    expect(raw).toContain("20261119040000_reverter_ambito_contactos.sql");
    expect(raw).toContain("ANTES DO db push");
  });

  it("usa CRLF, como o resto do repositorio", () => {
    for (const path of [migrationPath, reversalPath]) {
      const raw = readFileSync(path, "utf8");
      expect(raw.includes("\r\n")).toBe(true);
      expect(raw.replaceAll("\r\n", "").includes("\n")).toBe(false);
    }
  });
});

describe("migration: reversao do ambito dos contactos", () => {
  it("repoe as mesmas doze politicas", () => {
    const bodies = alteredPolicies(sqlOf(reversalPath));
    expect([...bodies.keys()].sort()).toEqual([...ALL_POLICY_NAMES].sort());
  });

  it("volta a is_entity_in_user_scope e larga o ambito de dono", () => {
    const reversal = sqlOf(reversalPath);
    expect(reversal).toContain("is_entity_in_user_scope(entity_id, auth.uid())");
    expect(reversal).not.toContain("crm_scope_keys");
    expect(reversal).not.toContain("is_entity_contact_in_owner_scope(");
  });

  it("nao larga a funcao nem toca no INSERT / WITH CHECK", () => {
    const reversal = sqlOf(reversalPath);
    const raw = readFileSync(reversalPath, "utf8");
    expect(reversal).not.toContain("drop function");
    expect(reversal).not.toContain("drop policy");
    expect(reversal).not.toContain("with check");
    expect(reversal).not.toContain("alter policy authenticated_insert");
    expect(raw).toContain("is_entity_contact_in_owner_scope NAO SE APAGA");
  });
});

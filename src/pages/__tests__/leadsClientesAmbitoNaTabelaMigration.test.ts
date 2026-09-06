/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// O ambito das leads e dos clientes so era aplicado na RPC. A leitura directa
// da tabela isolava apenas por organizacao: medido na nike a 2026-09-06, a
// conta teste-scope-membro@example.com (ambito OWNED, dona de 9 leads e 2
// clientes) contava 382 leads e 97 clientes -- exactamente o mesmo que o
// admin. Estes testes leem o SQL das duas migracoes (a correccao e a reversao
// escrita ao lado dela) e confirmam as propriedades que importam:
//
//   1. o ambito e mesmo resolvido nas seis politicas das duas tabelas;
//   2. a resolucao vai dentro de um subquery escalar SEM colunas da linha --
//      e por isso corre uma vez por consulta e nao uma vez por linha;
//   3. nenhuma das politicas antigas fica por actualizar;
//   4. o INSERT e o WITH CHECK do UPDATE ficam intactos (senao partia-se a
//      reatribuicao de fichas sem dono);
//   5. a reversao repoe as seis, e nao larga a funcao.
//
// RESSALVA, a dizer por escrito: projeto/CLAUDE.md pede que os testes de
// migracoes sejam de integracao real (pgTAP ou Supabase local) e desaconselha
// string-matching sobre o .sql. Aqui nao ha alternativa: a base local esta
// proibida nesta maquina e a migracao esta POR APLICAR, portanto nao existe
// nenhum ambiente onde a politica possa ser exercida ainda. Este teste e uma
// rede contra regressoes de FORMA (a forma ingenua que corre por linha, uma
// politica esquecida, o WITH CHECK apertado por engano), nao uma prova de
// comportamento. A prova de comportamento e o script de contagem descrito no
// fim da migracao, corrido contra o remoto antes e depois do db push.

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261118030000_leads_clientes_ambito_na_propria_tabela.sql",
);
const reversalPath = resolve(
  process.cwd(),
  "supabase/migrations/20261118040000_reverter_ambito_leads_clientes.sql",
);
const strictIsolationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260927010000_strict_crm_org_isolation.sql",
);

/** Remove as linhas que sao so comentario, para os testes olharem para SQL. */
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
    // O corpo vai ate ao proximo comando de topo.
    const end = part.search(/;\s*(alter policy|comment on|create |revoke |grant )|;\s*$/);
    bodies.set(name, end === -1 ? part : part.slice(0, end));
  }
  return bodies;
}

const LEAD_POLICIES = ["anew_leads_select", "anew_leads_update", "anew_leads_delete"];
const CLIENT_POLICIES = [
  "anew_clients_select",
  "anew_clients_update",
  "anew_clients_delete",
];
const ALL_POLICIES = [...LEAD_POLICIES, ...CLIENT_POLICIES];

describe("migration: ambito das leads e dos clientes na propria tabela", () => {
  it("cria as duas migracoes forward-only (correccao e reversao)", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(reversalPath)).toBe(true);
  });

  it("a funcao de ambito nao recebe NADA da linha -- so o codigo de permissao", () => {
    const sql = sqlOf(migrationPath);

    expect(sql).toContain(
      "create or replace function public.crm_scope_keys(p_permission_code text) returns text[]",
    );
    // Um unico argumento. Se um dia alguem lhe acrescentar organization_id ou
    // created_by, a funcao passa a correr por linha e o custo explode.
    expect(sql).not.toMatch(/crm_scope_keys\s*\(\s*p_permission_code text\s*,/);
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("stable");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path to 'public'");
    expect(sql).toContain("revoke all on function public.crm_scope_keys(text) from public, anon");
    expect(sql).toContain(
      "grant execute on function public.crm_scope_keys(text) to authenticated, service_role",
    );
  });

  it("resolve o ambito por resolve_lead_access_context, nao pela variante dos contactos", () => {
    const sql = sqlOf(migrationPath);

    expect(sql).toContain("public.resolve_lead_access_context(v_org_id, 'org', p_permission_code)");
    // resolve_contact_access_context ainda valida a organizacao por
    // get_user_visible_org_ids (alargamento hierarquico) que 20260927010000
    // retirou de proposito das tabelas do CRM.
    expect(sql).not.toContain("resolve_contact_access_context");
    expect(sql).not.toContain("get_user_visible_org_ids");
    expect(sql).toContain("public.get_user_crm_org_ids(v_auth_uid)");
  });

  it("emite chaves para os dois ids de dono, como get_scoped_leads_base", () => {
    const sql = sqlOf(migrationPath);

    // anew_users.id E auth.users.id: sem o segundo, uma ficha de legado
    // desaparecia ao dono na tabela e continuava a aparecer pela RPC.
    expect(sql).toContain("array[v_anew_user_id, v_ctx_auth_uid]");
    expect(sql).toContain("when v_applied_scope = 'team' then coalesce(v_team_user_ids");
    expect(sql).toContain("v_org_id::text || ':*'");
    expect(sql).toContain("v_org_id::text || ':' || v_owner::text");
  });

  it("altera as seis politicas das duas tabelas, sem deixar nenhuma por actualizar", () => {
    const bodies = alteredPolicies(sqlOf(migrationPath));

    expect([...bodies.keys()].sort()).toEqual([...ALL_POLICIES].sort());
  });

  it("cada politica embrulha a resolucao de ambito num SELECT (uma vez por consulta)", () => {
    const bodies = alteredPolicies(sqlOf(migrationPath));
    const expectedPermission: Record<string, string> = {
      anew_leads_select: "leads.view",
      anew_leads_update: "leads.edit",
      anew_leads_delete: "leads.delete",
      anew_clients_select: "clients.view",
      anew_clients_update: "clients.edit",
      anew_clients_delete: "clients.delete",
    };

    for (const policy of ALL_POLICIES) {
      const body = bodies.get(policy);
      expect(body, `politica ${policy} em falta`).toBeDefined();

      const permission = expectedPermission[policy];
      const table = policy.startsWith("anew_leads") ? "anew_leads" : "anew_clients";

      // Subquery escalar sem correlacao -> InitPlan -> uma execucao por consulta.
      expect(body).toContain(
        `from unnest((select public.crm_scope_keys('${permission}'::text))) as k(scope_key)`,
      );

      // UMA SO referencia por politica. Tres (uma por ramo) dariam tres
      // InitPlans e tres resolucoes de contexto por consulta.
      expect(body!.match(/crm_scope_keys\s*\(/g)?.length).toBe(1);

      // A comparacao por linha e so texto: org, dono atribuido, dono criador.
      expect(body).toContain(`k.scope_key = ${table}.organization_id::text || ':*'`);
      expect(body).toContain(
        `k.scope_key = ${table}.organization_id::text || ':' || ${table}.assigned_to::text`,
      );
      expect(body).toContain(
        `k.scope_key = ${table}.organization_id::text || ':' || ${table}.created_by::text`,
      );

      // O isolamento por organizacao e a permissao continuam la.
      expect(body).toContain(`public.has_anew_permission((select auth.uid()), '${permission}'::text)`);
      expect(body).toContain(
        "organization_id in (select public.get_user_crm_org_ids((select auth.uid())))",
      );
    }
  });

  it("nao passa colunas da linha a nenhuma funcao plpgsql (era o erro a evitar)", () => {
    const sql = sqlOf(migrationPath);
    const bodies = alteredPolicies(sql);

    // can_access_contact_row(organization_id, created_by, assigned_to, ...) e
    // a forma que corre por linha: 0,74 ms/linha nos contactos contra 0,13
    // ms/linha nas leads. Nao entra aqui.
    expect(sql).not.toContain("can_access_contact_row");
    expect(sql).not.toContain("is_entity_in_user_scope");

    for (const policy of ALL_POLICIES) {
      const body = bodies.get(policy) ?? "";
      expect(body).not.toMatch(/crm_scope_keys\s*\(\s*(anew_leads|anew_clients)\./);
      expect(body).not.toMatch(/crm_scope_keys\s*\(\s*organization_id/);
    }
  });

  it("nao toca no INSERT nem no WITH CHECK do UPDATE", () => {
    const sql = sqlOf(migrationPath);

    // 44% das leads da nike e 34% das da Mudelar tem created_by E assigned_to
    // a nulo: com o ambito no WITH CHECK, reatribuir a propria ficha a um
    // colega passava a ser recusado.
    expect(sql).not.toContain("with check");
    expect(sql).not.toContain("alter policy anew_leads_insert");
    expect(sql).not.toContain("alter policy anew_clients_insert");
    expect(sql).not.toContain("system_admin_pii_default_deny");
  });

  it("nao cria tabelas, nao larga objectos e nao mexe em dados", () => {
    const sql = sqlOf(migrationPath);

    expect(sql).not.toContain("drop policy");
    expect(sql).not.toContain("drop function");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("update public.");
    expect(sql).not.toContain("insert into");
  });

  it("o cabecalho explica a lacuna, os numeros medidos e como se reverte", () => {
    const raw = readFileSync(migrationPath, "utf8");

    expect(raw).toContain("382");
    expect(raw).toContain("97");
    expect(raw).toContain("833 ms");
    expect(raw).toContain("2147 ms");
    expect(raw).toContain("InitPlan");
    expect(raw).toContain("20261118040000_reverter_ambito_leads_clientes.sql");
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

describe("migration: reversao do ambito das leads e dos clientes", () => {
  it("repoe exactamente as mesmas seis politicas", () => {
    const bodies = alteredPolicies(sqlOf(reversalPath));

    expect([...bodies.keys()].sort()).toEqual([...ALL_POLICIES].sort());
  });

  it("volta ao texto de 20260927010000 -- so organizacao e permissao", () => {
    const reversal = sqlOf(reversalPath);
    const original = sqlOf(strictIsolationPath);

    const leadsSelect =
      "has_anew_permission(auth.uid(), 'leads.view'::text) and organization_id in (select get_user_crm_org_ids(auth.uid()))";
    const clientsSelect =
      "has_anew_permission((select auth.uid()), 'clients.view'::text) and organization_id in (select get_user_crm_org_ids((select auth.uid())))";

    expect(original).toContain(leadsSelect);
    expect(reversal).toContain(leadsSelect);
    expect(original).toContain(clientsSelect);
    expect(reversal).toContain(clientsSelect);

    // Sem ambito nenhum: e esse o efeito de reverter, e e o estado em que a
    // base ja estava antes da correccao.
    expect(reversal).not.toContain("crm_scope_keys");
  });

  it("nao larga a funcao nem toca no INSERT / WITH CHECK", () => {
    const reversal = sqlOf(reversalPath);

    expect(reversal).not.toContain("drop function");
    expect(reversal).not.toContain("drop policy");
    expect(reversal).not.toContain("with check");
    expect(reversal).not.toContain("alter policy anew_leads_insert");
    expect(reversal).not.toContain("alter policy anew_clients_insert");
  });

  it("diz por escrito qual e o gatilho para a aplicar", () => {
    const raw = readFileSync(reversalPath, "utf8");

    expect(raw).toContain("1,5 s");
    expect(raw).toContain("833 ms");
    expect(raw).toContain("crm_scope_keys NAO SE APAGA");
  });
});

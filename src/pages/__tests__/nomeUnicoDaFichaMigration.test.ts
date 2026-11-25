/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Rede contra regressoes de FORMA das duas migrations do nome unico da ficha.
// Nao e prova de comportamento: a base local esta proibida e as migrations
// estao por aplicar. O comportamento dos gatilhos esta espelhado e testado em
// src/lib/__tests__/entityNameSync.test.ts; a prova real sao as provas na nike.

const read = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

const rawM1 = read("20261229910000_nome_unico_da_ficha.sql");
const rawM2 = read("20261229920000_nome_unico_da_ficha_gatilhos.sql");

function toSql(raw: string) {
  return raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase()
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const m1 = toSql(rawM1);
const m2 = toSql(rawM2);

const at = (sql: string, needle: string) => {
  const index = sql.indexOf(needle);
  expect(index, `em falta: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

const bodyOf = (sql: string, fn: string) => {
  const start = at(sql, `create function public.${fn}`);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end);
};

describe("M1 20261229910000: coluna e funcoes puras", () => {
  it("so coluna e funcoes: sem gatilhos, sem preenchimento, sem LOCK TABLE", () => {
    at(m1, "alter table public.anew_entities add column company_name text;");
    at(m1, "create function public.fn_entity_display_name(");
    at(m1, "create function public.fn_lead_company_from_field_values(");
    expect(m1).not.toContain("create trigger");
    expect(m1).not.toContain("lock table");
    expect(m1).not.toMatch(/update public\.anew_entities/);
  });

  it("timeouts com SET LOCAL, nunca SET de sessao", () => {
    at(m1, "set local lock_timeout = '3s'");
    at(m1, "set local statement_timeout");
    expect(m1).not.toMatch(/(^|; )set (lock_timeout|statement_timeout)/);
  });

  it("le a empresa com as mesmas chaves e a mesma ordem do AnewLeadEditDialog", () => {
    at(m1, "array['company_name', 'empresa', 'company', 'nome_empresa', 'organizacao', 'organização']");
  });

  it("normaliza espacos e NBSP", () => {
    expect(bodyOf(m1, "fn_entity_display_name")).toContain("[\\s\\u00a0]+");
  });

  it("revoga as funcoes puras a public, anon e authenticated", () => {
    at(m1, "revoke all on function public.fn_entity_display_name(text, text, text, text) from public, anon, authenticated");
    at(m1, "revoke all on function public.fn_lead_company_from_field_values(jsonb) from public, anon, authenticated");
  });
});

describe("M2 20261229920000: preenchimento e gatilhos", () => {
  it("sem LOCK TABLE e com SET LOCAL", () => {
    expect(m2).not.toContain("lock table");
    at(m2, "set local lock_timeout = '3s'");
    expect(m2).not.toMatch(/(^|; )set (lock_timeout|statement_timeout)/);
  });

  it("ordem: funcao de partilha, preenchimento, guarda, gatilho da ficha, gatilho da lead", () => {
    const shared = at(m2, "create function public.fn_entity_shared_outside_root");
    const fill = at(m2, "set company_name = c.company");
    const guard = at(m2, "guarda:");
    const entityTrigger = at(m2, "create trigger trg_anew_entities_0_display_name");
    const leadTrigger = at(m2, "create trigger trg_anew_leads_sync_entity_company");
    expect(shared).toBeLessThan(fill);
    expect(fill).toBeLessThan(guard);
    expect(guard).toBeLessThan(entityTrigger);
    expect(entityTrigger).toBeLessThan(leadTrigger);
  });

  it("o preenchimento so onde display_name = empresa, re-verificado no UPDATE, e nunca escreve display_name", () => {
    const fill = m2.slice(at(m2, "with lead_company as"), at(m2, "guarda:"));
    expect(fill).toContain("e.display_name = a.company");
    expect(fill).toContain("e.display_name = c.display_before");
    expect(fill).toContain("e.company_name is null");
    expect(fill).not.toMatch(/set display_name|,\s*display_name\s*=/);
    expect(m2).not.toContain("md5(");
  });

  it("gatilho da ficha: so em first_name/last_name e corre antes do search_text", () => {
    at(m2, "before insert or update of first_name, last_name on public.anew_entities");
    expect("trg_anew_entities_0_display_name" < "trg_anew_entities_search_text").toBe(true);
  });

  it("gatilho da ficha: respeita display_name explicito e so recompoe fichas em sincronia", () => {
    const body = bodyOf(m2, "fn_anew_entities_display_name_trigger");
    at(body, "if new.display_name is distinct from old.display_name then return new;");
    at(body, "if v_old_comp is null or v_old_comp <> v_old_norm then return new;");
  });

  it("gatilho da lead: so escreve company_name, nunca display_name", () => {
    const body = bodyOf(m2, "fn_anew_leads_sync_entity_company");
    at(body, "update public.anew_entities set company_name = v_company where id = new.entity_id;");
    expect(body).not.toContain("display_name =");
    expect(body).not.toContain("display_name :=");
    at(body, "fn_entity_shared_outside_root(new.entity_id, new.root_organization_id)");
  });

  it("gatilho da lead: numa lead existente so escreve sobre NULL ou sobre a empresa antiga desta lead", () => {
    const body = bodyOf(m2, "fn_anew_leads_sync_entity_company");
    const guard = at(body, "if not v_is_new and v_cur_comp is not null and v_cur_comp is distinct from v_old_lead then return null;");
    expect(guard).toBeLessThan(at(body, "update public.anew_entities set company_name"));
    at(body, "if v_company is null then return null;");
  });

  it("a guarda entre raizes cobre utilizadores, organizacoes, leads, clientes, contactos, ligacoes e papeis", () => {
    const body = bodyOf(m2, "fn_entity_shared_outside_root");
    for (const table of ["anew_users", "anew_organizations", "anew_leads", "anew_clients", "anew_contacts", "anew_entity_org_links", "anew_entity_roles"]) {
      expect(body).toContain(`public.${table}`);
    }
  });

  it("nao recria nenhuma RPC existente", () => {
    for (const sql of [m1, m2]) {
      expect(sql).not.toContain("create or replace function");
      for (const rpc of ["rpc_update_lead", "rpc_update_client", "create_lead_entity_for_org", "rpc_update_user"]) {
        expect(sql).not.toContain(`function public.${rpc}`);
      }
    }
  });
});

describe("fins de linha", () => {
  it.each([
    ["M1", rawM1],
    ["M2", rawM2],
  ])("%s usa CRLF em todas as linhas", (_name, raw) => {
    const lf = raw.split("\n").length - 1;
    expect(lf).toBeGreaterThan(0);
    expect(raw.split("\r\n").length - 1).toBe(lf);
  });
});

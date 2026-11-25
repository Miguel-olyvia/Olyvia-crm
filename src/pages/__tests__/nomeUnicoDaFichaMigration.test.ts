/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Rede contra regressoes de FORMA da migration do nome unico da ficha. Nao e
// prova de comportamento: a base local esta proibida e a migration esta por
// aplicar. A prova de comportamento sao as provas S1-S4 na nike, antes e
// depois do db push.

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261229910000_nome_unico_da_ficha.sql",
);
const raw = readFileSync(migrationPath, "utf8");

function stripLineComments(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

const sql = stripLineComments(raw).toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim();

const at = (needle: string) => {
  const index = sql.indexOf(needle);
  expect(index, `em falta: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("migration 20261229910000_nome_unico_da_ficha", () => {
  it("segue a ordem: locks, coluna, preenchimento, guarda, gatilhos, conferir", () => {
    const lock = at("lock table public.anew_leads in share row exclusive mode");
    const lockEnt = at("lock table public.anew_entities in access exclusive mode");
    const column = at("alter table public.anew_entities add column company_name text");
    const fill = at("set company_name = a.company");
    const guard = at("guarda: algum display_name mudou");
    const entityTrigger = at("create trigger trg_anew_entities_0_display_name");
    const leadTrigger = at("create trigger trg_anew_leads_sync_entity_company");
    expect(lock).toBeLessThan(lockEnt);
    expect(lockEnt).toBeLessThan(column);
    expect(column).toBeLessThan(fill);
    expect(fill).toBeLessThan(guard);
    expect(guard).toBeLessThan(entityTrigger);
    expect(entityTrigger).toBeLessThan(leadTrigger);
  });

  it("tem lock_timeout curto", () => {
    at("set lock_timeout = '5s'");
  });

  it("o preenchimento nunca escreve display_name", () => {
    const start = at("with lead_company as");
    const end = at("guarda: algum display_name mudou");
    const fill = sql.slice(start, end);
    expect(fill).toContain("set company_name = a.company from agreed a");
    expect(fill).not.toMatch(/set display_name|,\s*display_name\s*=/);
  });

  it("o gatilho da ficha corre antes do de search_text (ordem alfabetica)", () => {
    expect("trg_anew_entities_0_display_name" < "trg_anew_entities_search_text").toBe(true);
    at("before insert or update of first_name, last_name, company_name, type, display_name on public.anew_entities");
  });

  it("o gatilho da lead escuta so field_values e entity_id", () => {
    at("after insert or update of field_values, entity_id on public.anew_leads");
  });

  it("le a empresa com as mesmas chaves e a mesma ordem do AnewLeadEditDialog", () => {
    at("array['company_name', 'empresa', 'company', 'nome_empresa', 'organizacao', 'organização']");
  });

  it("nao recria nenhuma RPC existente", () => {
    for (const rpc of ["rpc_update_lead", "rpc_update_client", "create_lead_entity_for_org", "rpc_update_user"]) {
      expect(sql).not.toContain(`function public.${rpc}`);
    }
    expect(sql).not.toContain("create or replace function");
  });

  it("revoga as funcoes novas a public, anon e authenticated", () => {
    for (const fn of [
      "fn_entity_display_name(text, text, text, text)",
      "fn_lead_company_from_field_values(jsonb)",
      "fn_anew_entities_display_name_trigger()",
      "fn_anew_leads_sync_entity_company()",
    ]) {
      at(`revoke all on function public.${fn} from public, anon, authenticated`);
    }
  });

  it("as funcoes novas fixam o search_path", () => {
    expect(sql.match(/set search_path = ''/g)?.length).toBe(4);
  });

  it("usa CRLF em todas as linhas", () => {
    const lf = raw.split("\n").length - 1;
    const crlf = raw.split("\r\n").length - 1;
    expect(lf).toBeGreaterThan(0);
    expect(crlf).toBe(lf);
  });
});

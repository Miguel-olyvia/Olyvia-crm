/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Rede contra regressoes de FORMA da migration do nome unico da ficha. Nao e
// prova de comportamento: a base local esta proibida e a migration esta por
// aplicar. O comportamento do gatilho esta espelhado e testado em
// src/lib/__tests__/entityNameSync.test.ts; a prova real sao as provas na nike.

const migrations = resolve(process.cwd(), "supabase/migrations");
const raw = readFileSync(resolve(migrations, "20261229910000_nome_unico_da_ficha.sql"), "utf8");

const sql = raw
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .toLowerCase()
  .replace(/"/g, "")
  .replace(/\s+/g, " ")
  .trim();

const at = (text: string, needle: string) => {
  const index = text.indexOf(needle);
  expect(index, `em falta: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

const bodyOf = (fn: string) => {
  const start = at(sql, `create function public.${fn}`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

describe("migration 20261229910000_nome_unico_da_ficha", () => {
  it("e a unica: a 920000 (empresa) ja nao existe", () => {
    expect(existsSync(resolve(migrations, "20261229920000_nome_unico_da_ficha_gatilhos.sql"))).toBe(false);
  });

  it("so funcao pura e gatilho: sem coluna, sem preenchimento, sem LOCK TABLE, sem empresa", () => {
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("lock table");
    expect(sql).not.toMatch(/update public\.anew_entities/);
    expect(sql).not.toContain("company");
    expect(sql).not.toContain("empresa");
    expect(sql).not.toContain("anew_leads");
  });

  it("timeouts com SET LOCAL, nunca SET de sessao", () => {
    at(sql, "set local lock_timeout = '3s'");
    expect(sql).not.toMatch(/(^|; )set (lock_timeout|statement_timeout)/);
  });

  it("a regra recebe o display_name actual (o nome proprio das organizacoes)", () => {
    at(sql, "create function public.fn_entity_display_name( p_type text, p_first text, p_last text, p_display_name text )");
    at(bodyOf("fn_entity_display_name"), "when p_type is distinct from 'person' then nullif(n.d, '')");
    expect(bodyOf("fn_entity_display_name")).toContain("[\\s\\u00a0]+");
  });

  it("gatilho: so em first_name/last_name e corre antes do search_text", () => {
    at(sql, "before insert or update of first_name, last_name on public.anew_entities");
    expect("trg_anew_entities_0_display_name" < "trg_anew_entities_search_text").toBe(true);
  });

  it("gatilho: INSERT so preenche vazio; UPDATE respeita o explicito e so recompoe em sincronia", () => {
    const body = bodyOf("fn_anew_entities_display_name_trigger");
    const insert = at(body, "if tg_op = 'insert' then if btrim(regexp_replace(coalesce(new.display_name, '')");
    const explicit = at(body, "if new.display_name is distinct from old.display_name then return new;");
    const inSync = at(body, "if v_old_comp is null or v_old_comp <> v_old_norm then return new;");
    expect(insert).toBeLessThan(explicit);
    expect(explicit).toBeLessThan(inSync);
  });

  it("revoga a funcao pura e a do gatilho a public, anon e authenticated", () => {
    at(sql, "revoke all on function public.fn_entity_display_name(text, text, text, text) from public, anon, authenticated");
    at(sql, "revoke all on function public.fn_anew_entities_display_name_trigger() from public, anon, authenticated");
  });

  it("nao recria nenhuma RPC existente", () => {
    expect(sql).not.toContain("create or replace function");
    for (const rpc of ["rpc_update_lead", "rpc_update_client", "create_lead_entity_for_org", "rpc_update_user"]) {
      expect(sql).not.toContain(`function public.${rpc}`);
    }
  });

  it("usa CRLF em todas as linhas", () => {
    const lf = raw.split("\n").length - 1;
    expect(lf).toBeGreaterThan(0);
    expect(raw.split("\r\n").length - 1).toBe(lf);
  });
});

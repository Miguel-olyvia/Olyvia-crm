// @ts-nocheck
/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Rede contra regressoes de FORMA da PARTE 2 do nome unico da ficha (os
// gatilhos). O comportamento esta espelhado em
// src/lib/__tests__/entityNameSync.test.ts, com os mesmos casos que o bloco
// CONFERIR desta migration corre numa tabela temporaria.

const migrations = resolve(process.cwd(), "supabase/migrations");
const raw = readFileSync(resolve(migrations, "20261229920000_nome_unico_da_ficha_gatilhos.sql"), "utf8");

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
  const open = sql.indexOf("$", start);
  const tag = sql.slice(open, sql.indexOf("$", open + 1) + 1);
  return sql.slice(start, sql.indexOf(`${tag};`, open + tag.length));
};

describe("migration 20261229920000_nome_unico_da_ficha_gatilhos (parte 2)", () => {
  it("so gatilhos: nada de colunas, dados, RPC ou funcoes da parte 1", () => {
    expect(sql).not.toMatch(/alter table|lock table|insert into public\.|update public\.|delete from public\./);
    expect(sql).not.toContain("create or replace function");
    for (const fn of ["fn_entity_compose_name(", "fn_entity_display_name(", "fn_entity_shared_outside_root(", "rpc_set_entity_kind("]) {
      expect(sql).not.toContain(`create function public.${fn}`);
    }
  });

  it("timeouts com SET LOCAL", () => {
    at(sql, "set local lock_timeout = '3s'");
    expect(sql).not.toMatch(/(^|; )set (lock_timeout|statement_timeout)/);
  });

  it("gatilho antes do search_text, em first/last/empresa/tipo", () => {
    at(sql, "create trigger trg_anew_entities_0_display_name before insert or update of first_name, last_name, company_name, type on public.anew_entities for each row execute function public.fn_anew_entities_display_name_trigger();");
    expect("trg_anew_entities_0_display_name" < "trg_anew_entities_search_text").toBe(true);
  });

  it("a prova de falha: o corpo todo num bloco EXCEPTION WHEN OTHERS que avisa e devolve a linha com o nome como veio", () => {
    const body = bodyOf("fn_anew_entities_display_name_trigger");
    const keep = at(body, "v_incoming text := new.display_name;");
    const inner = at(body, "begin begin if tg_op = 'insert' then");
    const handler = at(body, "exception when others then raise warning");
    at(body, "new.display_name := v_incoming; return new; end; end;");
    expect(keep).toBeLessThan(inner);
    expect(inner).toBeLessThan(handler);
    expect(body.indexOf("raise exception")).toBe(-1);
  });

  it("UPDATE: explicito respeitado, tipo nao recompoe, preencher nao renomeia, so em sincronia", () => {
    const body = bodyOf("fn_anew_entities_display_name_trigger");
    const explicit = at(body, "if new.display_name is distinct from old.display_name then return new;");
    const type = at(body, "if new.type is distinct from old.type then return new;");
    const fill = at(body, "if old.type = 'person' then if btrim(regexp_replace(coalesce(old.first_name, ''), '[\\s\\u00a0]+', ' ', 'g'), ' ') = '' or btrim(regexp_replace(coalesce(old.last_name, ''), '[\\s\\u00a0]+', ' ', 'g'), ' ') = ''");
    at(body, "elsif old.type = 'organization' then if btrim(regexp_replace(coalesce(old.company_name, ''), '[\\s\\u00a0]+', ' ', 'g'), ' ') = ''");
    const guard = at(body, "if v_old_comp is null or v_old_comp <> v_old_norm then return new;");
    const caseless = at(body, "if v_new_comp is not null and lower(v_new_comp) <> lower(v_old_norm) then");
    expect(explicit).toBeLessThan(type);
    expect(type).toBeLessThan(fill);
    expect(fill).toBeLessThan(guard);
    expect(guard).toBeLessThan(caseless);
  });

  it("os gatilhos do search_text escutam tambem company_name e type, com as mesmas funcoes", () => {
    at(sql, "before insert or update of display_name, first_name, last_name, company_name, type on public.anew_entities for each row execute function public.anew_entities_search_text_trigger();");
    at(sql, "after update of display_name, first_name, last_name, company_name, type on public.anew_entities for each row execute function public.anew_entities_sync_leads_search_text_trigger();");
    at(sql, "after update of display_name, first_name, last_name, company_name, type on public.anew_entities for each row execute function public.anew_entities_sync_clients_search_text_trigger();");
  });

  it("funcao do gatilho revogada a public, anon e authenticated", () => {
    at(sql, "revoke all on function public.fn_anew_entities_display_name_trigger() from public, anon, authenticated");
  });

  it("conferir: corre o gatilho numa tabela TEMPORARIA, larga-a, e nunca grava em anew_entities", () => {
    at(sql, "create temp table nome_unico_prova (");
    at(sql, ") on commit drop;");
    at(sql, "execute function public.fn_anew_entities_display_name_trigger();");
    at(sql, "drop table nome_unico_prova;");
    at(sql, "'1=rui costa;2=sr. rui;3=rui;4=rui silva;5=nova lda;6=evolar lda;7=mudar lda;8=rui silva;9=sr. rui'");
    expect(sql).not.toMatch(/insert into (public\.)?anew_entities|update (public\.)?anew_entities/);
    expect(sql).not.toContain("savepoint");
  });

  it("conferir: os quatro gatilhos activos e com a definicao certa", () => {
    at(sql, "t.tgenabled::text = 'o'");
    at(sql, "pg_get_triggerdef(t.oid) like e.pat");
  });

  it("usa CRLF em todas as linhas", () => {
    const lf = raw.split("\n").length - 1;
    expect(lf).toBeGreaterThan(0);
    expect(raw.split("\r\n").length - 1).toBe(lf);
  });
});

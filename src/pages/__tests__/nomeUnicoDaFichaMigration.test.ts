/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Rede contra regressoes de FORMA da migration do nome unico da ficha. Nao e
// prova de comportamento: a base local esta proibida e a migration esta por
// aplicar. O comportamento esta espelhado em src/lib/__tests__/entityNameSync.test.ts;
// a prova real sao as provas na nike.

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
  const open = sql.indexOf("$", start);
  const tag = sql.slice(open, sql.indexOf("$", open + 1) + 1);
  return sql.slice(start, sql.indexOf(`${tag};`, open + tag.length));
};

describe("migration 20261229910000_nome_unico_da_ficha", () => {
  it("e a unica do nome unico", () => {
    expect(existsSync(resolve(migrations, "20261229920000_nome_unico_da_ficha_gatilhos.sql"))).toBe(false);
  });

  it("coluna opcional, sem preenchimento de dados e sem LOCK TABLE", () => {
    at(sql, "alter table public.anew_entities add column company_name text;");
    expect(sql).not.toContain("lock table");
    expect(sql).not.toMatch(/update public\.anew_entities set (?!type = p_type)/);
    expect(sql).not.toContain("anew_leads set");
  });

  it("timeouts com SET LOCAL, nunca SET de sessao", () => {
    at(sql, "set local lock_timeout = '3s'");
    expect(sql).not.toMatch(/(^|; )set (lock_timeout|statement_timeout)/);
  });

  it("regra por tipo: organization = empresa, person = nome + apelido, com NBSP", () => {
    const body = bodyOf("fn_entity_compose_name");
    at(body, "when p_type = 'organization' then nullif(n.c, '')");
    expect(body).toContain("[\\s\\u00a0]+");
    at(sql, "select coalesce(public.fn_entity_compose_name(p_type, p_first, p_last, p_company), p_display_name);");
  });

  it("gatilho antes do search_text, em first/last/empresa/tipo", () => {
    at(sql, "before insert or update of first_name, last_name, company_name, type on public.anew_entities");
    expect("trg_anew_entities_0_display_name" < "trg_anew_entities_search_text").toBe(true);
  });

  it("gatilho: INSERT so preenche vazio; UPDATE respeita o explicito e so recompoe em sincronia (estrita)", () => {
    const body = bodyOf("fn_anew_entities_display_name_trigger");
    const explicit = at(body, "if new.display_name is distinct from old.display_name then return new;");
    const inSync = at(body, "v_old_comp := public.fn_entity_compose_name(old.type, old.first_name, old.last_name, old.company_name);");
    const guard = at(body, "if v_old_comp is null or v_old_comp <> v_old_norm then return new;");
    expect(explicit).toBeLessThan(inSync);
    expect(inSync).toBeLessThan(guard);
  });

  it("os gatilhos do search_text escutam tambem company_name e type, com as mesmas funcoes", () => {
    at(sql, "before insert or update of display_name, first_name, last_name, company_name, type on public.anew_entities for each row execute function public.anew_entities_search_text_trigger();");
    at(sql, "after update of display_name, first_name, last_name, company_name, type on public.anew_entities for each row execute function public.anew_entities_sync_leads_search_text_trigger();");
    at(sql, "after update of display_name, first_name, last_name, company_name, type on public.anew_entities for each row execute function public.anew_entities_sync_clients_search_text_trigger();");
  });

  it("RPC nova: assinatura, validacoes, permissoes como rpc_set_entity_primary_email, nome explicito", () => {
    at(sql, "create function public.rpc_set_entity_kind( p_entity_id uuid, p_type text, p_first_name text, p_last_name text, p_company_name text ) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'");
    const body = bodyOf("rpc_set_entity_kind");
    const validate = at(body, "if p_type is null or p_type not in ('person', 'organization') then");
    const assert = at(body, "perform public.fn_assert_can_edit_entity_contacts(p_entity_id);");
    const shared = at(body, "if public.fn_entity_shared_outside_root(p_entity_id) then");
    const update = at(body, "display_name = v_name");
    expect(validate).toBeLessThan(assert);
    expect(assert).toBeLessThan(shared);
    expect(shared).toBeLessThan(update);
    at(body, "perform public.fn_manual_audit_log('anew_entities', p_entity_id, v_org, 'update', v_diff, 'web_app', p_entity_id);");
    at(sql, "revoke all on function public.rpc_set_entity_kind(uuid, text, text, text, text) from public, anon;");
    at(sql, "grant execute on function public.rpc_set_entity_kind(uuid, text, text, text, text) to authenticated;");
  });

  it("funcoes internas revogadas a public, anon e authenticated", () => {
    for (const fn of [
      "fn_entity_compose_name(text, text, text, text)",
      "fn_entity_display_name(text, text, text, text, text)",
      "fn_entity_shared_outside_root(uuid)",
      "fn_anew_entities_display_name_trigger()",
    ]) {
      at(sql, `revoke all on function public.${fn} from public, anon, authenticated`);
    }
  });

  it("nao recria nenhuma RPC existente", () => {
    expect(sql).not.toContain("create or replace function");
    for (const rpc of ["rpc_update_lead", "rpc_update_client", "create_lead_entity_for_org", "rpc_update_user", "fn_assert_can_edit_entity_contacts("]) {
      expect(sql).not.toContain(`function public.${rpc}`);
    }
  });

  it("usa CRLF em todas as linhas", () => {
    const lf = raw.split("\n").length - 1;
    expect(lf).toBeGreaterThan(0);
    expect(raw.split("\r\n").length - 1).toBe(lf);
  });
});

/// <reference types="node" />
/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Rede contra regressoes de FORMA da PARTE 1 do nome unico da ficha (coluna,
// funcoes e RPC; sem gatilhos). Nao e prova de comportamento: a base local esta
// proibida e a migration esta por aplicar. O comportamento esta espelhado em
// src/lib/__tests__/entityNameSync.test.ts; a parte 2 tem o seu proprio teste.

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

describe("migration 20261229910000_nome_unico_da_ficha (parte 1)", () => {
  it("nao cria nem altera gatilhos (sao da parte 2)", () => {
    expect(sql).not.toMatch(/create trigger|drop trigger|returns trigger/);
    expect(sql).not.toContain("fn_anew_entities_display_name_trigger");
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

  it("partilhada: so recusa utilizadores INTERNOS; o cliente com acesso ao portal (client_portal_users da mesma ficha) nao conta", () => {
    const body = bodyOf("fn_entity_shared_outside_root");
    at(body, "where u.entity_id = p_entity_id and not exists (select 1 from public.client_portal_users cpu where cpu.auth_user_id = u.auth_user_id and cpu.entity_id = p_entity_id))");
    at(body, "or exists (select 1 from public.anew_organizations o where o.entity_id = p_entity_id)");
  });

  it("RPC: limites de comprimento e caracteres de controlo antes das permissoes", () => {
    const body = bodyOf("rpc_set_entity_kind");
    const limits = at(body, "if char_length(v_company) > 200 or v_company ~ '[[:cntrl:]]' or char_length(v_first) > 100 or v_first ~ '[[:cntrl:]]' or char_length(v_last) > 100 or v_last ~ '[[:cntrl:]]' then");
    expect(limits).toBeLessThan(at(body, "perform public.fn_assert_can_edit_entity_contacts(p_entity_id);"));
    at(body, "v_first := coalesce(v_first, v_before.first_name); v_last := coalesce(v_last, v_before.last_name);");
  });

  it("RPC: a recusa de permissao fala do tipo, nao de contactos", () => {
    const body = bodyOf("rpc_set_entity_kind");
    at(body, "begin perform public.fn_assert_can_edit_entity_contacts(p_entity_id); exception when insufficient_privilege then if sqlerrm like '%contactos%' then raise exception 'sem permissão para mudar o tipo ou o nome desta ficha' using errcode = 'insufficient_privilege'; end if; raise; end;");
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
    ]) {
      at(sql, `revoke all on function public.${fn} from public, anon, authenticated`);
    }
  });

  it("conferir: confere as quatro funcoes e que o gatilho da parte 2 ainda nao existe", () => {
    at(sql, "'fn_entity_compose_name/4/false,fn_entity_display_name/5/false,fn_entity_shared_outside_root/1/false,rpc_set_entity_kind/5/true'");
    at(sql, "t.tgname::text = 'trg_anew_entities_0_display_name'");
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

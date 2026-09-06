/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Ninguem se promove a si proprio: a trava tem de viver na base, nao so no
// ecra. Este teste le o SQL da migration e confirma que a rede de seguranca
// esta la -- e que o INSERT em anew_memberships continua LIVRE, porque e por
// ai que a criacao de uma organizacao poe o criador como org_admin dela.

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261118010000_ninguem_se_promove_a_si_proprio.sql",
);

function migrationExists() {
  return existsSync(migrationPath);
}

function normalizedSql() {
  if (!migrationExists()) {
    return "";
  }

  return readFileSync(migrationPath, "utf8")
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("migration: ninguem se promove a si proprio", () => {
  it("creates the forward-only migration file", () => {
    expect(migrationExists()).toBe(true);
  });

  it("descobre a identidade de quem escreve sem depender do RLS", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.anew_current_user_ids()");
    expect(sql).toContain("returns uuid[]");
    expect(sql).toContain("security definer");
    expect(sql).toContain("from public.anew_users u where auth.uid() is not null and u.auth_user_id = auth.uid()");
    expect(sql).toContain("from public.auth_to_business_user_map m");
    expect(sql).toContain("grant execute on function public.anew_current_user_ids() to authenticated");
  });

  it("trava cargo, organizacao e estado da propria associacao", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.tg_anew_memberships_no_self_promotion()");
    expect(sql).toContain("before update or delete on public.anew_memberships");
    expect(sql).toContain("execute function public.tg_anew_memberships_no_self_promotion()");
    expect(sql).toContain("nao pode remover a sua propria associacao a uma organizacao");
    expect(sql).toContain("nao pode alterar o seu proprio cargo, organizacao ou estado de associacao");
    expect(sql).toContain("new.role_id is distinct from old.role_id");
    expect(sql).toContain("new.organization_id is distinct from old.organization_id");
    expect(sql).toContain("new.relationship_type is distinct from old.relationship_type");
    expect(sql).toContain("new.status is distinct from old.status");
  });

  it("nao trava o INSERT em anew_memberships (criar organizacao continua a funcionar)", () => {
    const sql = normalizedSql();

    expect(sql).not.toContain("before insert or update or delete on public.anew_memberships");
    expect(sql).not.toContain("before insert on public.anew_memberships");
  });

  it("trava os proprios ambitos de permissao em qualquer sentido", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.tg_anew_scopes_no_self_grant()");
    expect(sql).toContain("before insert or update or delete on public.anew_membership_permission_scopes");
    expect(sql).toContain("execute function public.tg_anew_scopes_no_self_grant()");
    expect(sql).toContain("nao pode alterar os seus proprios ambitos de permissao");
  });

  it("trava o proprio estado na tabela de utilizadores", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.tg_anew_users_no_self_status_change()");
    expect(sql).toContain("before update on public.anew_users");
    expect(sql).toContain("execute function public.tg_anew_users_no_self_status_change()");
    expect(sql).toContain("nao pode alterar o seu proprio estado");
  });

  it("deixa passar quem nao tem sessao (migrations e service_role)", () => {
    const sql = normalizedSql();

    expect(sql).toContain("if auth.uid() is null");
    expect(sql).toContain("if auth.uid() is not null");
  });

  it("redefine rpc_update_user e neutraliza as escritas de poder na propria ficha", () => {
    const sql = normalizedSql();

    expect(sql).toContain("create or replace function public.rpc_update_user(");
    expect(sql).toContain("v_target_is_self boolean;");
    expect(sql).toContain("v_target_is_self := v_can_edit_self or (p_user_id = any(public.anew_current_user_ids()))");
    expect(sql).toContain("if v_target_is_self then");
    expect(sql).toContain("não pode alterar o seu próprio estado");
    expect(sql).toContain("não pode alterar os seus próprios âmbitos de permissão");
    expect(sql).toContain("não pode alterar o seu próprio cargo nem as suas organizações");
    // As escritas de poder saem do caminho da propria ficha: assim quem so tem
    // users.view grava os seus dados sem bater nos portoes de users.edit, e a
    // lista do ecra -- que so traz as associacoes activas -- nunca apaga as
    // inactivas por engano.
    expect(sql).toContain("p_status := v_before_user.status;");
    expect(sql).toContain("p_memberships := '[]'::jsonb;");
    expect(sql).toContain("p_existing_membership_ids := array[]::uuid[];");
    expect(sql).toContain("p_pending_scopes := null;");
  });

  it("mantem o portao de nivel 1 e o bypass de system admin intactos", () => {
    const sql = normalizedSql();

    expect(sql).toContain("sem permissão para editar utilizadores");
    expect(sql).toContain("utilizador fora do âmbito do utilizador");
    expect(sql).toContain("v_is_system_admin := public.is_system_admin(auth.uid())");
  });
});

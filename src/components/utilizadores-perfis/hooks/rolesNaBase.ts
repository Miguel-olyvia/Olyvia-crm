// Wrapper: as escritas de roles na base, com as RPCs de src/pages/Roles.tsx (rpc_create_role, rpc_update_role, rpc_delete_role,
// rpc_restore_role). Cada escrita é CONFIRMADA por uma leitura a seguir: uma RPC que devolve sem erro mas não mudou nada (por
// exemplo uma RLS que filtra em silêncio) conta como falha, nunca como sucesso. Lança `Error` com a mensagem a mostrar.
import { supabase } from "@/integrations/supabase/client";
import { dadosParaRpc, mensagemDeErro, mesmosCodigos } from "../rolesReais";
import type { DadosRole } from "../tipos";

type Rpc = (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
// As RPCs aceitam NULL na descrição; os tipos gerados não. Chamam-se pelo nome, como em Roles.tsx.
const rpc: Rpc = (nome, args) => (supabase.rpc as unknown as Rpc).call(supabase, nome, args);

async function chamar(nome: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(nome, args);
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

function validar(d: DadosRole) {
  const r = dadosParaRpc(d);
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

async function lerRole(id: string): Promise<{ id: string; code: string; name: string; deleted_at: string | null } | null> {
  const { data, error } = await supabase.from("anew_roles").select("id, code, name, deleted_at").eq("id", id).maybeSingle();
  if (error) throw new Error(mensagemDeErro(error));
  return (data as { id: string; code: string; name: string; deleted_at: string | null } | null) ?? null;
}

async function lerPermissoes(id: string): Promise<string[]> {
  const { data, error } = await supabase.from("anew_role_permissions").select("permission_code").eq("role_id", id).limit(5000);
  if (error) throw new Error(mensagemDeErro(error));
  return ((data ?? []) as { permission_code: string }[]).map((p) => p.permission_code);
}

/** Confirma na base que a role ficou como se pediu (nome, código, permissões). */
async function confirmar(id: string, esperado: { code: string; name: string; permissions: string[] }): Promise<void> {
  const [role, permissoes] = await Promise.all([lerRole(id), lerPermissoes(id)]);
  if (!role || role.code !== esperado.code || role.name !== esperado.name || !mesmosCodigos(permissoes, esperado.permissions)) {
    throw new Error("A base não confirmou a gravação da role (pode não ter permissão para esta organização). Nada foi alterado.");
  }
}

export async function criarRoleNaBase(organizacaoId: string, dados: DadosRole): Promise<string> {
  const v = validar(dados);
  const criada = await chamar("rpc_create_role", {
    p_code: v.code, p_name: v.name, p_description: v.description || null, p_can_sign_contracts: v.can_sign_contracts,
    p_organization_id: organizacaoId, p_permissions: v.permissions,
  });
  const id = (criada as { id?: string } | null)?.id;
  if (!id) throw new Error("A base não devolveu a role criada.");
  await confirmar(id, v);
  return id;
}

export async function guardarRoleNaBase(id: string, dados: DadosRole, sistema: boolean): Promise<void> {
  if (sistema) throw new Error("Roles de sistema não são editáveis");
  const v = validar(dados);
  await chamar("rpc_update_role", {
    p_id: id, p_code: v.code, p_name: v.name, p_description: v.description || null,
    p_can_sign_contracts: v.can_sign_contracts, p_permissions: v.permissions,
  });
  await confirmar(id, v);
}

/** `quantosUtilizadores` vem da contagem real; sem ela (null) não se elimina. */
export async function eliminarRoleNaBase(id: string, quantosUtilizadores: number | null): Promise<void> {
  if (quantosUtilizadores === null) throw new Error("Não foi possível confirmar se a role tem utilizadores. Tente de novo.");
  if (quantosUtilizadores > 0) throw new Error("Esta role tem utilizadores. Passe-os para outra role antes de a eliminar.");
  await chamar("rpc_delete_role", { p_id: id });
  const role = await lerRole(id);
  if (role && !role.deleted_at) throw new Error("A base não confirmou a eliminação da role. Nada foi alterado.");
}

export async function restaurarRoleNaBase(id: string): Promise<void> {
  await chamar("rpc_restore_role", { p_id: id });
  const role = await lerRole(id);
  if (!role || role.deleted_at) throw new Error("A base não confirmou o restauro da role. Nada foi alterado.");
}

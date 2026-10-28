// Lógica pura das roles reais (sem base): converte as linhas de anew_roles / anew_permissions / anew_role_permissions para os
// tipos da página, aplica as regras de visibilidade e de autorização de src/pages/Roles.tsx e prepara o que vai às RPCs.
// Os wrappers de `hooks/` leem a base e chamam estas funções; aqui nada importa o Supabase.
import { roleFormSchema } from "@/lib/validations";
import { gerarCodigo } from "./validacoes";
import { normalizar, type Editor } from "./logica";
import type { Ambito, DadosRole, Permissao, Role } from "./tipos";

export interface LinhaRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  is_system: boolean;
  can_sign_contracts: boolean | null;
  created_by?: string | null;
  deleted_at?: string | null;
}

export interface LinhaPermissao {
  code: string;
  name: string;
  category: string | null;
  is_dangerous: boolean | null;
  supports_scope?: boolean | null;
}

export interface LinhaRolePermissao {
  role_id: string;
  permission_code: string;
}

/** As categorias com módulo no menu lateral (`sidebarCategories` de Roles.tsx, com `hr`). */
export const CATEGORIAS_DO_MENU: ReadonlySet<string> = new Set([
  "dashboard", "organizations", "org_chart", "flow_builder",
  "products", "bundles", "brands", "product_categories", "product_subcategories", "product_attributes", "units_of_measure",
  "services", "service_categories", "service_subcategories", "service_fees",
  "leads", "contacts", "clients",
  "deals", "proposals", "quotes", "quote_templates", "direct_sales", "contracts", "client_contracts",
  "marketing", "forms",
  "suppliers", "warehouses", "purchase_orders", "receiving", "stocks", "inventory", "client_orders",
  "scheduling", "users", "roles", "settings", "smtp", "email_templates", "hr",
]);

/** `permissionNamePt` de Roles.tsx: nomes em inglês na base que o ecrã mostra em português. */
const NOMES_PT: Record<string, string> = {
  "View scheduling boards": "Ver quadros de agendamento", "Create scheduling boards": "Criar quadros de agendamento",
  "Edit scheduling boards": "Editar quadros de agendamento", "Delete scheduling boards": "Eliminar quadros de agendamento",
  "View scheduling items": "Ver itens de agendamento", "Create scheduling items": "Criar itens de agendamento",
  "Edit scheduling items": "Editar itens de agendamento", "Delete scheduling items": "Eliminar itens de agendamento",
  "View scheduling resources": "Ver recursos de agendamento", "Create scheduling resources": "Criar recursos de agendamento",
  "Edit scheduling resources": "Editar recursos de agendamento", "Delete scheduling resources": "Eliminar recursos de agendamento",
  "View auto-scheduling rules": "Ver regras de auto-agendamento", "Create auto-scheduling rules": "Criar regras de auto-agendamento",
  "Edit auto-scheduling rules": "Editar regras de auto-agendamento", "Delete auto-scheduling rules": "Eliminar regras de auto-agendamento",
  "Export scheduling data": "Exportar dados de agendamento",
  "View Flow Builder": "Ver Flow Builder", "Create Flow Builder": "Criar Flow Builder",
  "Edit Flow Builder": "Editar Flow Builder", "Delete Flow Builder": "Eliminar Flow Builder",
};

export function permissaoDaBase(l: LinhaPermissao): Permissao {
  return {
    codigo: l.code, categoria: l.category ?? "", nome: NOMES_PT[l.name] ?? l.name,
    perigosa: l.is_dangerous === true, comAmbito: l.supports_scope === true,
  };
}

/** O catálogo que a página mostra: só as permissões de módulos do menu, como Roles.tsx. */
export const permissoesDoMenu = (linhas: readonly LinhaPermissao[]): Permissao[] =>
  linhas.filter((l) => CATEGORIAS_DO_MENU.has(l.category ?? "")).map(permissaoDaBase);

/** Quem não é administrador de sistema só pode dar permissões que ele próprio tem (modelos de role). */
export const tiraPermissoesDoEditor = (codigos: readonly string[], editor: Editor): string[] =>
  editor.administradorSistema ? [...codigos] : codigos.filter((c) => editor.codigos.includes(c));

/**
 * As roles que o utilizador pode ver, pelo papel dele: system_admin e super_admin só para quem os é (ou acima), org_admin de
 * sistema só para super_admin+, roles de sistema sem repetir o código, e as das organizações só se forem a ativa ou ascendentes.
 */
export function rolesVisiveis(linhas: readonly LinhaRole[], papel: string | null, idsOrganizacoes: ReadonlySet<string>): LinhaRole[] {
  const efetivo = papel || "org_viewer";
  const sysAdmin = efetivo === "system_admin";
  const superAdmin = efetivo === "super_admin";
  const filtradas = linhas.filter((r) => {
    if (r.code === "system_admin") return sysAdmin;
    if (r.code === "super_admin") return superAdmin || sysAdmin;
    if (r.code === "org_admin" && r.organization_id === null) return superAdmin || sysAdmin;
    if (r.organization_id === null) return true;
    return idsOrganizacoes.has(r.organization_id);
  });
  const vistos = new Set<string>();
  return filtradas.filter((r) => {
    if (r.organization_id !== null) return true;
    if (vistos.has(r.code)) return false;
    vistos.add(r.code);
    return true;
  });
}

export const agruparPermissoesPorRole = (linhas: readonly LinhaRolePermissao[]): Record<string, string[]> =>
  linhas.reduce<Record<string, string[]>>((acc, l) => ({ ...acc, [l.role_id]: [...(acc[l.role_id] ?? []), l.permission_code] }), {});

export function roleDaBase(l: LinhaRole, permissoes: readonly string[]): Role {
  return {
    id: l.id, codigo: l.code, nome: l.name, descricao: l.description ?? "", sistema: l.is_system,
    podeAssinar: l.can_sign_contracts === true, permissoes: [...permissoes], eliminada: !!l.deleted_at,
    organizacaoId: l.organization_id, criadoPor: l.created_by ?? null,
  };
}

/** Utilizadores distintos por role (todas as roles pedidas aparecem, mesmo com zero). */
export function contarPorRole(linhas: readonly { role_id: string; user_id: string }[], roleIds: readonly string[]): Record<string, number> {
  const por = new Map<string, Set<string>>();
  linhas.forEach((l) => por.set(l.role_id, (por.get(l.role_id) ?? new Set()).add(l.user_id)));
  return Object.fromEntries(roleIds.map((id) => [id, por.get(id)?.size ?? 0]));
}

type PodeAgir = (ambito: Ambito, entidade: { created_by?: string | null }, utilizadorId: string | null) => boolean;

export interface ParametrosAutorizacao {
  podeCriar: boolean;
  podeEditar: boolean;
  podeEliminar: boolean;
  ambitoEditar: Ambito;
  ambitoEliminar: Ambito;
  anewUserId: string | null;
}

export interface AutorizacoesRole {
  podeCriar: boolean;
  podeEditar: (r: Role) => boolean;
  podeEliminar: (r: Role) => boolean;
  podeRestaurar: (r: Role) => boolean;
}

/**
 * `canEditRole` / `canDeleteRole` de Roles.tsx: roles.edit + âmbito; roles.delete + não ser de sistema + âmbito; restaurar pede
 * roles.delete e que a role não seja de sistema. Uma role eliminada não se edita nem se volta a eliminar.
 * `podeAgir` é o `canActOnEntity` real, passado pelo wrapper.
 */
export function autorizacoesRole(p: ParametrosAutorizacao, podeAgir: PodeAgir): AutorizacoesRole {
  const dono = (r: Role) => ({ created_by: r.criadoPor ?? null });
  return {
    podeCriar: p.podeCriar,
    podeEditar: (r) => p.podeEditar && !r.eliminada && podeAgir(p.ambitoEditar, dono(r), p.anewUserId),
    podeEliminar: (r) => p.podeEliminar && !r.sistema && !r.eliminada && podeAgir(p.ambitoEliminar, dono(r), p.anewUserId),
    podeRestaurar: (r) => p.podeEliminar && !r.sistema && !!r.eliminada,
  };
}

export interface DadosRpcRole {
  code: string;
  name: string;
  description: string;
  can_sign_contracts: boolean;
  permissions: string[];
}

/** Valida com o mesmo esquema de Roles.tsx e converte para o que as RPCs recebem. O código vem do nome se estiver vazio. */
export function dadosParaRpc(d: DadosRole): { ok: true; valor: DadosRpcRole } | { ok: false; erro: string } {
  const valor: DadosRpcRole = {
    code: d.codigo.trim() || gerarCodigo(d.nome), name: d.nome.trim(), description: d.descricao.trim(),
    can_sign_contracts: d.podeAssinar, permissions: [...d.permissoes],
  };
  const r = roleFormSchema.safeParse(valor);
  return r.success ? { ok: true, valor } : { ok: false, erro: r.error.issues[0]?.message ?? "Dados da role inválidos" };
}

/** O texto de um erro (Error, objecto do Supabase com `message`, ou outra coisa). Nunca devolve vazio. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string" && (e as { message: string }).message) {
    return (e as { message: string }).message;
  }
  return "Ocorreu um erro inesperado.";
}

/** Pesquisa por nome ou código, sem acentos nem maiúsculas. */
export function filtrarRoles(roles: readonly Role[], texto: string): Role[] {
  const q = normalizar(texto);
  return q ? roles.filter((r) => normalizar(`${r.nome} ${r.codigo}`).includes(q)) : [...roles];
}

/** Dois conjuntos de códigos iguais (ordem e repetições à parte). */
export const mesmosCodigos = (a: readonly string[], b: readonly string[]): boolean => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((c) => y.has(c));
};

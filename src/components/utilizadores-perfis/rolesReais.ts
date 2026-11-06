// Lógica pura das roles reais (sem base): converte as linhas de anew_roles / anew_permissions / anew_role_permissions para os
// tipos da página, aplica as regras de visibilidade e de autorização de src/pages/Roles.tsx e prepara o que vai às RPCs.
// Os wrappers de `hooks/` leem a base e chamam estas funções; aqui nada importa o Supabase.
import { roleFormSchema } from "@/lib/validations";
import { gerarCodigo } from "./validacoes";
import { normalizar, type Editor } from "./logica";
import { CODIGOS_EM_USO } from "./permissoesEmUso";
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
  description?: string | null;
}

export interface LinhaRolePermissao {
  role_id: string;
  permission_code: string;
}

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
  // Nomes que a base ainda tem em inglês, das permissões em uso.
  "View Organizations": "Ver organizações", "Create Organizations": "Criar organizações",
  "Edit Organizations": "Editar organizações", "Delete Organizations": "Eliminar organizações",
  "View forms": "Ver formulários", "Create forms": "Criar formulários", "Edit forms": "Editar formulários", "Delete forms": "Eliminar formulários",
  "View product categories": "Ver categorias de produto", "Create product categories": "Criar categorias de produto",
  "Edit product categories": "Editar categorias de produto", "Delete product categories": "Eliminar categorias de produto",
  "View product subcategories": "Ver subcategorias de produto", "Create product subcategories": "Criar subcategorias de produto",
  "Edit product subcategories": "Editar subcategorias de produto", "Delete product subcategories": "Eliminar subcategorias de produto",
  "View product attributes": "Ver atributos de produto", "Create product attributes": "Criar atributos de produto",
  "Edit product attributes": "Editar atributos de produto", "Delete product attributes": "Eliminar atributos de produto",
  "Manage proposal templates and workflows": "Gerir templates e fluxos de propostas",
  "Manage scheduling settings": "Gerir definições de agendamento",
};

/**
 * Rótulo e descrição por código, quando o nome da base não diz o que a permissão faz de facto. Só apresentação: o código, a base e
 * os papéis não mudam.
 */
export const ROTULOS_POR_CODIGO: Readonly<Record<string, { nome: string; descricao: string }>> = {
  // 05/11/2026: product_categories.view não guarda nenhum ecrã de categorias vivo. 20270109520000: é A chave do registo de alterações
  // (entity_audit_log) na organização da linha — as outras permissões do catálogo deixaram de o abrir; os custos continuam a pedir a
  // permissão de custo. O separador Histórico da encomenda a fornecedor lê por rpc_po_historico (purchase_orders.view) e só cai na
  // leitura direta (esta permissão) se essa recusar. Dá também os atributos das categorias globais.
  "product_categories.view": {
    nome: "Ver histórico de alterações",
    descricao: "Ler o registo de alterações da organização (sem os custos, que pedem a permissão de custo) e os atributos das categorias",
  },
  // 05/11/2026: clients.edit é a segunda chave (com pessoas.edit) para mexer em quem já é cliente; clients.create só a usa o convert_lead
  // do assistente IA. Os nomes «Converter Leads» e «Editar negócios de pessoas» são os de leads.convert e pessoas.edit na base.
  // Na grelha a célula mostra a coluna (Criar/Editar); o nome e a descrição daqui aparecem na dica e na descrição acessível.
  "clients.edit": {
    nome: "Editar quem já é cliente",
    descricao: "Mudar nome, contactos, NIF, comercial, visitas e moradas de entrega de uma pessoa que já é cliente (junto com Editar negócios de pessoas).",
  },
  // 05/11/2026: users.change_password voltou ao editor; é o que o servidor pede para mudar a palavra-passe de OUTRO utilizador.
  "users.change_password": {
    nome: "Alterar palavras-passe",
    descricao: "Definir uma nova palavra-passe para outro utilizador na ficha dele. A própria palavra-passe muda-se sempre, sem esta permissão.",
  },
  // 06/11/2026: deals.delete é a chave do «Eliminar definitivamente» dos documentos no Lixo (PURGE_PERMISSION em Trash.tsx,
  // purge_business_entity no servidor; leads/clientes pedem organizations.delete) e de restaurar pedidos de proposta antigos
  // (lib/lixo/permissoesRestauro.ts). No editor está em Definições › Lixo.
  "deals.delete": {
    nome: "Eliminar definitivamente do Lixo",
    descricao: "Apagar para sempre, no Lixo, orçamentos, propostas, contratos, encomendas e pedidos de proposta já eliminados (não se pode desfazer). Restaura também pedidos de proposta antigos.",
  },
  "clients.create": {
    nome: "Converter em cliente (assistente IA)",
    descricao: "O assistente IA pode converter uma lead em cliente. No ecrã, a conversão pede Converter Leads.",
  },
};

export function permissaoDaBase(l: LinhaPermissao): Permissao {
  const proprio = ROTULOS_POR_CODIGO[l.code];
  const descricao = proprio?.descricao ?? l.description?.trim();
  return {
    codigo: l.code, categoria: l.category ?? "", nome: proprio?.nome ?? NOMES_PT[l.name] ?? l.name,
    perigosa: l.is_dangerous === true, comAmbito: l.supports_scope === true,
    ...(descricao ? { descricao } : {}),
  };
}

/**
 * O catálogo que o editor mostra: só as permissões em uso (permissoesEmUso.ts). As escondidas continuam na base e nos papéis que já
 * as têm; ao gravar, o FormRole volta a juntá-las (`fundirPermissoes`), por isso escondê-las não as remove.
 */
export const permissoesDoMenu = (linhas: readonly LinhaPermissao[]): Permissao[] =>
  linhas.filter((l) => CODIGOS_EM_USO.has(l.code)).map(permissaoDaBase);

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

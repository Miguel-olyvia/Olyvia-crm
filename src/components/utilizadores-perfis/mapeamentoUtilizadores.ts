// Mapeia as linhas da base (anew_users, anew_memberships, anew_roles, ...) para os utilizadores da página.
// Puro: a leitura vive em hooks/useUtilizadoresReais.ts. Segue a leitura e o filtro de visibilidade de UsersNew.tsx.
import type { Ambito, ClientePortal, Utilizador, Vinculo } from "./tipos";

export interface LinhaUtilizadorBase {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  auth_user_id: string | null;
  status: string;
  created_by?: string | null;
  position?: string | null;
  entity_id?: string | null;
}
export interface LinhaMembership {
  id: string;
  user_id: string;
  organization_id: string;
  relationship_type: string;
  role_id: string;
  status: string;
  join_method?: string | null;
}
export interface LinhaRoleBase { id: string; code: string; name: string }
export interface LinhaTelefone { entity_id: string; phone_number: string | null; country_code: string | null; is_primary: boolean | null }
export interface LinhaAmbito { membership_id: string; permission_code: string; scope_level: string }
export interface LinhaHierarquia { parent_org_id: string; child_org_id: string }

const CODIGO_CLIENTE = "client";
const AMBITOS_VALIDOS: Ambito[] = ["NONE", "OWNED", "TEAM", "ORG"];

/** A organização ativa, as descendentes e as ascendentes: o âmbito de visibilidade de UsersNew. */
export function idsOrganizacoesVisiveis(hierarquia: readonly LinhaHierarquia[], orgAtivaId: string | undefined): Set<string> {
  const visiveis = new Set<string>();
  if (!orgAtivaId) return visiveis;
  const pai = new Map(hierarquia.map((h) => [h.child_org_id, h.parent_org_id]));
  const filhos = new Map<string, string[]>();
  hierarquia.forEach((h) => filhos.set(h.parent_org_id, [...(filhos.get(h.parent_org_id) ?? []), h.child_org_id]));
  const descer = (id: string) => (filhos.get(id) ?? []).forEach((f) => { if (!visiveis.has(f)) { visiveis.add(f); descer(f); } });
  visiveis.add(orgAtivaId);
  descer(orgAtivaId);
  let atual = pai.get(orgAtivaId);
  while (atual && !visiveis.has(atual)) { visiveis.add(atual); atual = pai.get(atual); }
  return visiveis;
}

/** "+351 910000000": o telefone principal (ou o primeiro). */
export function telefonePrincipal(telefones: readonly Pick<LinhaTelefone, "phone_number" | "country_code" | "is_primary">[] | undefined): string | null {
  if (!telefones || telefones.length === 0) return null;
  const p = telefones.find((x) => x.is_primary) ?? telefones[0];
  const cc = (p.country_code ?? "").trim();
  const pn = (p.phone_number ?? "").trim();
  return [cc, pn].filter(Boolean).join(" ") || null;
}

/** Âmbitos por membership; o que for OWNED (a omissão) não se guarda, como em MembershipScopesDialog. */
export function ambitosPorMembership(linhas: readonly LinhaAmbito[]): Record<string, Record<string, Ambito>> {
  const saida: Record<string, Record<string, Ambito>> = {};
  for (const l of linhas) {
    const nivel = l.scope_level as Ambito;
    if (nivel === "OWNED" || !AMBITOS_VALIDOS.includes(nivel)) continue;
    saida[l.membership_id] = { ...(saida[l.membership_id] ?? {}), [l.permission_code]: nivel };
  }
  return saida;
}

export interface EntradaMontagem {
  users: readonly LinhaUtilizadorBase[];
  memberships: readonly LinhaMembership[];
  roles: readonly LinhaRoleBase[];
  phones: readonly LinhaTelefone[];
  scopes: readonly LinhaAmbito[];
  /** Id de autenticação de quem está a ver (aparece sempre). */
  authUserId: string | undefined;
  /** Administrador de sistema: sem organização ativa vê todos. */
  tipoSistema: boolean;
  orgAtivaId: string | undefined;
  orgsVisiveis: ReadonlySet<string>;
}

function vinculoDe(m: LinhaMembership, roles: Map<string, LinhaRoleBase>, ambitos: Record<string, Record<string, Ambito>>): Vinculo {
  return {
    organizacaoId: m.organization_id, roleId: m.role_id, ativo: m.status === "active", ambitos: { ...(ambitos[m.id] ?? {}) },
    membershipId: m.id, relationshipType: m.relationship_type, roleCodigo: roles.get(m.role_id)?.code,
    criador: m.join_method === "created_org",
  };
}

/** Os utilizadores visíveis, com vínculos, telefone e âmbitos. A ordem é a recebida (a leitura já vem por nome). */
export function montarUtilizadores(e: EntradaMontagem): Utilizador[] {
  const roles = new Map(e.roles.map((r) => [r.id, r]));
  const ambitos = ambitosPorMembership(e.scopes);
  const porUtilizador = new Map<string, LinhaMembership[]>();
  e.memberships.forEach((m) => porUtilizador.set(m.user_id, [...(porUtilizador.get(m.user_id) ?? []), m]));
  const telefones = new Map<string, LinhaTelefone[]>();
  e.phones.forEach((p) => telefones.set(p.entity_id, [...(telefones.get(p.entity_id) ?? []), p]));

  const visivel = (u: LinhaUtilizadorBase, ms: LinhaMembership[]): boolean => {
    if (u.auth_user_id && u.auth_user_id === e.authUserId) return true;
    if (e.tipoSistema && !e.orgAtivaId) return true;
    if (e.orgsVisiveis.size === 0) return true;
    return ms.some((m) => m.status === "active" && e.orgsVisiveis.has(m.organization_id));
  };

  return e.users.flatMap((u) => {
    const ms = porUtilizador.get(u.id) ?? [];
    if (!visivel(u, ms)) return [];
    return [{
      id: u.id, nome: u.name, email: u.email, ativo: u.status === "active",
      telefone: telefonePrincipal(u.entity_id ? telefones.get(u.entity_id) : undefined) ?? u.phone ?? undefined,
      posicao: u.position ?? undefined, ultimoAcesso: null, atividade: [],
      vinculos: ms.map((m) => vinculoDe(m, roles, ambitos)),
      authUserId: u.auth_user_id, entityId: u.entity_id ?? null, criadoPor: u.created_by ?? null,
    }];
  });
}

const ativosDe = (u: Utilizador): Vinculo[] => u.vinculos.filter((v) => v.ativo);

/** A lista de utilizadores: sem quem só tem a role de cliente do portal (como em UsersNew). */
export function utilizadoresDaLista(todos: readonly Utilizador[]): Utilizador[] {
  return todos.filter((u) => {
    const ativos = ativosDe(u);
    return ativos.length === 0 || !ativos.every((v) => v.roleCodigo === CODIGO_CLIENTE);
  });
}

/** Os clientes do portal: quem tem um vínculo ativo com a role de cliente. */
export function clientesDoPortal(todos: readonly Utilizador[]): ClientePortal[] {
  return todos.flatMap((u) => {
    const v = ativosDe(u).find((x) => x.roleCodigo === CODIGO_CLIENTE);
    return v ? [{ id: u.id, nome: u.nome, organizacaoId: v.organizacaoId, ativo: u.ativo, ultimoAcesso: null }] : [];
  });
}

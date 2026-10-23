// Os comerciais a quem se pode atribuir a lead e a árvore de organizações do filtro «Atribuído a». Cópia de AnewLeads.tsx:1291-1328,
// 1330-1344 e 1401-1611 (a página de Leads não se altera). Só leituras. Procura o departamento «Comercial» na árvore da organização e,
// se não houver, usa todos os membros ativos; nunca mostra clientes nem utilizadores do portal.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { INTERNAL_ASSIGNMENT_EXCLUDED_ROLES } from "@/constants/userTypeRoles";
import { resolveRootOrgIdLogic } from "@/lib/orgHierarchy";

export interface ComercialLido { id: string; name: string; districts: string[]; org_ids: string[] }
export interface NoArvoreOrg { id: string; name: string; type: string; depth: number }
export interface ComerciaisLidos { users: ComercialLido[]; tree: NoArvoreOrg[] }

type Linha = Record<string, any>;
const db = (): { from: (t: string) => any } => supabase as unknown as { from: (t: string) => any };

async function ler(consulta: PromiseLike<{ data: unknown; error?: unknown }>): Promise<Linha[]> {
  const { data, error } = await consulta;
  // Uma falha lança: «sem comerciais» e «não consegui ler os comerciais» são coisas diferentes para quem cria a lead.
  if (error) {
    captureFlowError(error, "campaign-lead-intake");
    throw error instanceof Error ? error : new Error(String((error as { message?: unknown }).message ?? "falha a ler"));
  }
  return Array.isArray(data) ? (data as Linha[]) : [];
}

/** A organização e todas as descendentes (por ordem de largura) e a hierarquia lida. */
async function descendentes(raiz: string): Promise<{ ids: string[]; hierarquia: Linha[] }> {
  const hierarquia = await ler(db().from("anew_hierarchy").select("parent_org_id, child_org_id"));
  const filhos = new Map<string, string[]>();
  for (const h of hierarquia) filhos.set(h.parent_org_id, [...(filhos.get(h.parent_org_id) ?? []), h.child_org_id]);
  const ids: string[] = [raiz];
  const fila = [raiz];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const filho of filhos.get(atual) ?? []) {
      if (!ids.includes(filho)) {
        ids.push(filho);
        fila.push(filho);
      }
    }
  }
  return { ids, hierarquia };
}

/** A organização-raiz do grupo (sobe a hierarquia, sem ciclos). */
export async function resolverOrgRaiz(organizationId: string): Promise<string> {
  return resolveRootOrgIdLogic(organizationId, async (filha) => {
    const { data } = await db().from("anew_hierarchy").select("parent_org_id").eq("child_org_id", filha).maybeSingle();
    return (data as Linha | null)?.parent_org_id ?? null;
  });
}

function arvoreDe(raiz: string, orgs: Linha[], hierarquia: Linha[]): NoArvoreOrg[] {
  const info = new Map(orgs.map((o) => [o.id, { name: o.name, type: o.type || "" }]));
  const filhos = new Map<string, string[]>();
  for (const h of hierarquia) filhos.set(h.parent_org_id, [...(filhos.get(h.parent_org_id) ?? []), h.child_org_id]);
  const arvore: NoArvoreOrg[] = [];
  const fila: Array<{ id: string; depth: number }> = [{ id: raiz, depth: 0 }];
  const vistos = new Set<string>();
  while (fila.length > 0) {
    const atual = fila.shift() as { id: string; depth: number };
    if (vistos.has(atual.id)) continue;
    vistos.add(atual.id);
    const o = info.get(atual.id);
    if (o) arvore.push({ id: atual.id, name: o.name, type: o.type, depth: atual.depth });
    for (const filho of filhos.get(atual.id) ?? []) if (!vistos.has(filho)) fila.push({ id: filho, depth: atual.depth + 1 });
  }
  return arvore;
}

/** Concelhos (ou cidades) das moradas ativas de cada entidade. */
async function distritosPorEntidade(entidades: string[]): Promise<Record<string, string[]>> {
  const mapa: Record<string, string[]> = {};
  if (entidades.length === 0) return mapa;
  const linhas = await ler(db().from("anew_entity_addresses")
    .select("entity_id, address:anew_addresses!anew_entity_addresses_address_id_fkey(district, city)")
    .in("entity_id", entidades).is("valid_to", null));
  for (const ea of linhas) {
    const distrito = ea.address?.district || ea.address?.city;
    if (distrito && ea.entity_id) {
      const atuais = mapa[ea.entity_id] ?? [];
      if (!atuais.includes(distrito)) mapa[ea.entity_id] = [...atuais, distrito];
    }
  }
  return mapa;
}

async function membrosInternos(orgIds: string[]): Promise<Linha[]> {
  const membros = await ler(db().from("anew_memberships").select("user_id, organization_id, role_id").in("organization_id", orgIds).eq("status", "active"));
  const papeis = [...new Set(membros.map((m) => m.role_id).filter(Boolean))];
  const codigos: Record<string, string> = {};
  if (papeis.length > 0) {
    for (const r of await ler(db().from("anew_roles").select("id, code").in("id", papeis))) codigos[r.id] = String(r.code || "").toLowerCase();
  }
  return membros.filter((m) => {
    const codigo = codigos[m.role_id];
    return !codigo || !INTERNAL_ASSIGNMENT_EXCLUDED_ROLES.has(codigo);
  });
}

export async function lerComerciais(organizationId: string): Promise<ComerciaisLidos> {
  const { ids, hierarquia } = await descendentes(organizationId);
  const orgs = await ler(db().from("anew_organizations").select("id, name, type").in("id", ids));
  const departamentos = orgs.filter((o) => String(o.name ?? "").toLowerCase() === "comercial" && o.type === "departamento").map((o) => o.id as string);
  const tree = arvoreDe(organizationId, orgs, hierarquia);

  const membros = await membrosInternos(departamentos.length > 0 ? departamentos : ids);
  if (membros.length === 0) return { users: [], tree };
  const utilizadores = await ler(db().from("anew_users").select("id, name, entity_id, status").in("id", [...new Set(membros.map((m) => m.user_id))]).eq("status", "active"));

  const departamentosDe: Record<string, string[]> = {};
  const orgsDe: Record<string, string[]> = {};
  const paiDoDepartamento = new Map<string, string>();
  for (const h of hierarquia) if (departamentos.includes(h.child_org_id)) paiDoDepartamento.set(h.child_org_id, h.parent_org_id);
  for (const m of membros) {
    const deptos = departamentosDe[m.user_id] ?? [];
    if (!deptos.includes(m.organization_id)) departamentosDe[m.user_id] = [...deptos, m.organization_id];
    const pai = paiDoDepartamento.get(m.organization_id) ?? m.organization_id;
    const lista = orgsDe[m.user_id] ?? [];
    for (const o of [pai, m.organization_id]) if (!lista.includes(o)) lista.push(o);
    orgsDe[m.user_id] = lista;
  }

  const pessoais = await distritosPorEntidade(utilizadores.map((u) => u.entity_id).filter(Boolean));
  const entidadeDoDepartamento: Record<string, string> = {};
  if (departamentos.length > 0) {
    for (const o of await ler(db().from("anew_organizations").select("id, entity_id").in("id", departamentos))) {
      if (o.entity_id) entidadeDoDepartamento[o.id] = o.entity_id;
    }
  }
  const dosDepartamentos = await distritosPorEntidade(Object.values(entidadeDoDepartamento));

  const users = utilizadores.map((u): ComercialLido => {
    // A morada pessoal de quem trabalha; sem ela, herda as dos departamentos.
    let districts: string[] = [];
    if (u.entity_id && pessoais[u.entity_id]?.length > 0) {
      districts = [...pessoais[u.entity_id]];
    } else {
      for (const d of departamentosDe[u.id] ?? []) {
        for (const distrito of dosDepartamentos[entidadeDoDepartamento[d]] ?? []) if (!districts.includes(distrito)) districts.push(distrito);
      }
    }
    return { id: u.id, name: u.name || "Utilizador", districts, org_ids: orgsDe[u.id] ?? [] };
  });
  return { users, tree };
}

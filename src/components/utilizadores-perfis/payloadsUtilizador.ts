// Os corpos que a página envia à Edge create-user e ao rpc_update_user (via nif-write-proxy). Puro, sem base.
// O ecrã mostra menos campos do que a base guarda (telefones, moradas, NIF, atributos, modelo); o rpc_update_user
// recebe sempre TUDO, por isso o que o ecrã não edita é lido (DetalheUtilizador) e reenviado tal como está.
import { telefonePrincipal } from "./mapeamentoUtilizadores";
import type { Ambito, Utilizador, Vinculo } from "./tipos";

const RELACAO_POR_OMISSAO = "BELONGS_TO";
const INDICATIVO_POR_OMISSAO = "+351";
const PAIS_POR_OMISSAO = "PT";

export interface TelefoneEntrada { phone_number: string; country_code: string; phone_type: string; is_primary: boolean }
export interface MoradaEntrada {
  id?: string;
  street: string; number: string; postal_code: string; city: string;
  floor?: string; unit?: string; district?: string; country?: string; extra?: string; address_type?: string; is_primary?: boolean;
}
export interface FiscalEntrada { nif: string; commercial_name: string | null; country_code: string }

/** O que a base guarda do utilizador e o formulário não mostra: lido ao gravar e reenviado. */
export interface DetalheUtilizador {
  telefones: TelefoneEntrada[];
  description: string | null;
  position: string | null;
  location: string | null;
  templateId: string | null;
  customAttributes: Record<string, unknown>;
  moradas: MoradaEntrada[];
  fiscal: FiscalEntrada | null;
}

export interface ValoresGravar {
  nome: string;
  email: string;
  telefone: string;
  posicao: string;
  palavraPasse: string;
}

/** "+44 7700900123" dá indicativo e número; sem indicativo assume +351; vazio dá null. */
export function analisarTelefone(texto: string): { country_code: string; phone_number: string } | null {
  const t = texto.trim();
  if (!t) return null;
  const m = /^(\+\d{1,4})\s*(.*)$/.exec(t);
  if (m && m[2].trim()) return { country_code: m[1], phone_number: m[2].trim() };
  return { country_code: INDICATIVO_POR_OMISSAO, phone_number: t.replace(/^\+/, "") };
}

const formatar = (t: { country_code: string; phone_number: string }): string => `${t.country_code} ${t.phone_number}`;

/**
 * O formulário mostra um só telefone (o principal). Se não mudou, os telefones seguem intactos; se mudou, só o principal
 * é substituído (ou removido, se ficou vazio) e os outros mantêm-se.
 */
export function fundirTelefone(existentes: TelefoneEntrada[], novo: string, inicial: string): TelefoneEntrada[] {
  if (novo.trim() === inicial.trim()) return existentes;
  const indice = Math.max(0, existentes.findIndex((p) => p.is_primary));
  const atual = existentes[indice];
  const restantes = existentes.filter((_, i) => i !== indice);
  const analisado = analisarTelefone(novo);
  if (!analisado) return restantes;
  const principal: TelefoneEntrada = { ...analisado, phone_type: atual?.phone_type ?? "mobile", is_primary: true };
  return [...restantes.map((p) => ({ ...p, is_primary: false })), principal];
}

const parte = (v: unknown): string => String(v ?? "").trim();

/** As moradas já guardadas, normalizadas e com a chave de deduplicação. Não valida: uma morada antiga incompleta não pode bloquear a gravação. */
export function moradasParaEnvio(moradas: readonly MoradaEntrada[]): Array<MoradaEntrada & { address_key: string }> {
  return moradas.flatMap((m) => {
    const n = {
      ...m, street: parte(m.street), number: parte(m.number), postal_code: parte(m.postal_code), city: parte(m.city),
      country: parte(m.country) || PAIS_POR_OMISSAO, floor: parte(m.floor), unit: parte(m.unit), district: parte(m.district),
      extra: parte(m.extra), address_type: parte(m.address_type) || "home", is_primary: Boolean(m.is_primary),
    };
    if ([n.street, n.number, n.postal_code, n.city, n.floor, n.unit, n.district, n.extra].every((x) => !x)) return [];
    const chave = [n.street, n.number, n.postal_code, n.city, n.country].map((x) => x.toLowerCase().replace(/\s+/g, " ")).join("|");
    return [{ ...n, address_key: chave }];
  });
}

const completo = (v: Vinculo): boolean => !!v.organizacaoId && !!v.roleId;

type EntradaAmbito = { permission_code: string; scope_level: Ambito };
const entradasDe = (ambitos: Record<string, Ambito>): EntradaAmbito[] =>
  Object.entries(ambitos).filter(([, nivel]) => nivel !== "OWNED").map(([permission_code, scope_level]) => ({ permission_code, scope_level }));
const mesmosAmbitos = (a: Record<string, Ambito>, b: Record<string, Ambito>): boolean => {
  const ea = entradasDe(a); const eb = entradasDe(b);
  return ea.length === eb.length && ea.every((x) => b[x.permission_code] === x.scope_level);
};

export interface EntradaAtualizar {
  utilizador: Utilizador;
  detalhe: DetalheUtilizador;
  valores: ValoresGravar;
  vinculos: Vinculo[];
  /** Só com permissão para gerir roles se enviam âmbitos. */
  ambitosEditaveis: boolean;
}

/** Os parâmetros de rpc_update_user e o NIF para o nif-write-proxy (null se o utilizador não tem NIF). */
export function paramsAtualizarUtilizador(e: EntradaAtualizar) {
  const { utilizador: u, detalhe: d, valores: v } = e;
  const email = v.email.trim();
  const telefoneInicial = u.telefone ?? "";
  const telefones = fundirTelefone(d.telefones, v.telefone, telefoneInicial);
  const telefoneNaoMudou = v.telefone.trim() === telefoneInicial.trim();
  const completos = e.vinculos.filter(completo);
  const originais = new Map(u.vinculos.flatMap((x) => (x.membershipId ? [[x.membershipId, x] as const] : [])));
  const ambitos: Record<string, EntradaAmbito[]> = {};
  if (e.ambitosEditaveis) {
    completos.forEach((x) => {
      const antes = x.membershipId ? originais.get(x.membershipId) : undefined;
      if (x.membershipId && antes && !mesmosAmbitos(antes.ambitos, x.ambitos)) ambitos[x.membershipId] = entradasDe(x.ambitos);
    });
  }
  const nif = d.fiscal?.nif.trim() ? d.fiscal.nif : null;
  const params = {
    p_user_id: u.id,
    p_entity_id: u.entityId ?? null,
    p_name: v.nome.trim(),
    p_email: email,
    p_phone: telefonePrincipal(telefones) ?? (telefoneNaoMudou ? u.telefone ?? null : null),
    p_status: u.ativo ? "active" : "inactive",
    p_description: d.description || null,
    p_position: v.posicao.trim() || null,
    p_location: d.location || null,
    p_template_id: d.templateId || null,
    p_custom_attributes: { ...d.customAttributes },
    p_emails: [{ email, email_type: "work", is_primary: true }],
    p_phones: telefones.map((p) => ({ phone_number: p.phone_number, country_code: p.country_code, phone_type: p.phone_type, is_primary: p.is_primary })),
    p_memberships: completos.map((x) => ({
      id: x.membershipId ?? null, organization_id: x.organizacaoId, relationship_type: x.relationshipType ?? RELACAO_POR_OMISSAO, role_id: x.roleId,
    })),
    p_existing_membership_ids: u.vinculos.flatMap((x) => (x.membershipId ? [x.membershipId] : [])),
    p_pending_scopes: ambitos,
    p_addresses: moradasParaEnvio(d.moradas),
    p_fiscal: d.fiscal && nif ? { nif, commercial_name: d.fiscal.commercial_name || null, country_code: d.fiscal.country_code } : null,
  };
  return { params, nif };
}

/** O corpo da Edge create-user (cria com palavra-passe; não envia convite nem email). */
export function corpoCriarUtilizador(v: ValoresGravar, vinculos: readonly Vinculo[]) {
  const telefone = analisarTelefone(v.telefone);
  return {
    email: v.email.trim(),
    password: v.palavraPasse,
    name: v.nome.trim(),
    tipo: "worker_user",
    phone: telefone ? formatar(telefone) : null,
    template_id: null,
    description: null,
    position: v.posicao.trim() || null,
    location: null,
    custom_attributes: null,
    memberships: vinculos.filter(completo).map((x) => ({
      organization_id: x.organizacaoId, relationship_type: x.relationshipType ?? RELACAO_POR_OMISSAO, role_id: x.roleId,
    })),
    fiscal: null,
    addresses: null,
    additional_emails: [] as Array<{ email: string; email_type: string; is_primary: boolean }>,
    additional_phones: [] as TelefoneEntrada[],
  };
}

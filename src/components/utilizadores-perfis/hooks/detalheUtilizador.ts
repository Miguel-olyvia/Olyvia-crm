// Wrapper: o que a base guarda de um utilizador e o formulário não mostra (telefones, descrição, local, modelo, atributos,
// moradas, NIF). Lê o mesmo que UsersNew.openEditSheet e é chamado ao gravar, para o rpc_update_user reenviar tudo e não
// apagar nada. Qualquer falha de leitura sobe (gravar às cegas apagaria dados); o NIF não se grava sem o conseguir ler.
import { callNifRevealSingle } from "@/lib/nif/callNifReveal";
import type { DetalheUtilizador, MoradaEntrada, TelefoneEntrada } from "../payloadsUtilizador";
import type { Utilizador } from "../tipos";
import { db } from "./clienteBase";

interface RespostaLista<T> { data: T[] | null; error: { message: string } | null }

async function ler<T>(consulta: PromiseLike<RespostaLista<T>>): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data ?? [];
}

interface LinhaDetalhe {
  description: string | null; position: string | null; location: string | null;
  template_id: string | null; custom_attributes: Record<string, unknown> | null;
}
interface LinhaMorada {
  id: string; address_type: string | null; is_primary: boolean | null;
  address: { street?: string; number?: string; floor?: string; unit?: string; postal_code?: string; city?: string; district?: string; country?: string; extra?: string } | null;
}
interface LinhaFiscal { fiscal_entity: { id: string; commercial_name: string | null; country_code: string | null } | null }

const moradaDe = (l: LinhaMorada): MoradaEntrada => ({
  id: l.id, street: l.address?.street ?? "", number: l.address?.number ?? "", floor: l.address?.floor ?? "", unit: l.address?.unit ?? "",
  postal_code: l.address?.postal_code ?? "", city: l.address?.city ?? "", district: l.address?.district ?? "",
  country: l.address?.country || "PT", extra: l.address?.extra ?? "", address_type: l.address_type || "home", is_primary: l.is_primary || false,
});

export async function carregarDetalheUtilizador(u: Pick<Utilizador, "id" | "entityId">): Promise<DetalheUtilizador> {
  const entidade = u.entityId ?? null;
  const [telefones, perfil, moradas, fiscais] = await Promise.all([
    entidade ? ler<{ phone_number: string; country_code: string | null; phone_type: string | null; is_primary: boolean | null }>(
      db.from("anew_entity_phones").select("*").eq("entity_id", entidade)) : Promise.resolve([]),
    ler<LinhaDetalhe>(db.from("anew_users").select("description, position, location, template_id, custom_attributes").eq("id", u.id)),
    entidade ? ler<LinhaMorada>(
      db.from("anew_entity_addresses").select("*, address:anew_addresses!anew_entity_addresses_address_id_fkey(*)").eq("entity_id", entidade).is("valid_to", null)) : Promise.resolve([]),
    entidade ? ler<LinhaFiscal>(
      db.from("anew_entity_fiscal_entities").select("*, fiscal_entity:fiscal_entities(id, commercial_name, country_code)").eq("entity_id", entidade).is("valid_to", null).limit(1)) : Promise.resolve([]),
  ]);
  const ficha = perfil[0];
  if (!ficha) throw new Error("Não foi possível ler o utilizador para o gravar.");

  const fe = fiscais[0]?.fiscal_entity ?? null;
  let fiscal: DetalheUtilizador["fiscal"] = null;
  if (fe) {
    const nif = await callNifRevealSingle(fe.id);
    if (!nif) throw new Error("Não foi possível ler o NIF do utilizador; nada foi gravado para não o apagar.");
    fiscal = { nif, commercial_name: fe.commercial_name, country_code: fe.country_code || "PT" };
  }
  const listaTelefones: TelefoneEntrada[] = telefones.map((p) => ({
    phone_number: p.phone_number, country_code: p.country_code || "+351", phone_type: p.phone_type || "mobile", is_primary: p.is_primary || false,
  }));
  return {
    telefones: listaTelefones, description: ficha.description, position: ficha.position, location: ficha.location,
    templateId: ficha.template_id, customAttributes: ficha.custom_attributes ?? {}, moradas: moradas.map(moradaDe), fiscal,
  };
}

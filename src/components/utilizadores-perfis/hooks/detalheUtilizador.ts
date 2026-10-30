// Wrapper: o que a base guarda de um utilizador e o formulário não mostra (telefones, descrição, local, modelo, atributos,
// moradas). Lê o mesmo que UsersNew.openEditSheet (menos o fiscal) e é chamado ao gravar, para o rpc_update_user reenviar tudo e não
// apagar nada. Qualquer falha de leitura sobe (gravar às cegas apagaria dados).
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

const moradaDe = (l: LinhaMorada): MoradaEntrada => ({
  id: l.id, street: l.address?.street ?? "", number: l.address?.number ?? "", floor: l.address?.floor ?? "", unit: l.address?.unit ?? "",
  postal_code: l.address?.postal_code ?? "", city: l.address?.city ?? "", district: l.address?.district ?? "",
  country: l.address?.country || "PT", extra: l.address?.extra ?? "", address_type: l.address_type || "home", is_primary: l.is_primary || false,
});

export async function carregarDetalheUtilizador(u: Pick<Utilizador, "id" | "entityId">): Promise<DetalheUtilizador> {
  const entidade = u.entityId ?? null;
  const [telefones, perfil, moradas] = await Promise.all([
    entidade ? ler<{ phone_number: string; country_code: string | null; phone_type: string | null; is_primary: boolean | null }>(
      db.from("anew_entity_phones").select("*").eq("entity_id", entidade)) : Promise.resolve([]),
    ler<LinhaDetalhe>(db.from("anew_users").select("description, position, location, template_id, custom_attributes").eq("id", u.id)),
    entidade ? ler<LinhaMorada>(
      db.from("anew_entity_addresses").select("*, address:anew_addresses!anew_entity_addresses_address_id_fkey(*)").eq("entity_id", entidade).is("valid_to", null)) : Promise.resolve([]),
  ]);
  const ficha = perfil[0];
  if (!ficha) throw new Error("Não foi possível ler o utilizador para o gravar.");

  // Esta página não tem nada fiscal (nem NIF) nem ao criar nem ao editar: não se lê. O rpc_update_user só mexe no fiscal quando recebe um NIF,
  // por isso `fiscal: null` não apaga nada (30/10: a leitura rebentava na RH, que não tem a ligação entre as duas tabelas fiscais).
  const listaTelefones: TelefoneEntrada[] = telefones.map((p) => ({
    phone_number: p.phone_number, country_code: p.country_code || "+351", phone_type: p.phone_type || "mobile", is_primary: p.is_primary || false,
  }));
  return {
    telefones: listaTelefones, description: ficha.description, position: ficha.position, location: ficha.location,
    templateId: ficha.template_id, customAttributes: ficha.custom_attributes ?? {}, moradas: moradas.map(moradaDe), fiscal: null,
  };
}

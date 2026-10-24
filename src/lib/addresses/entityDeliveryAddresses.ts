import { supabase } from "@/integrations/supabase/client";
import type { MoradaCampos } from "@/lib/addresses/validarMorada";
import { FICHA_TECNICA_VAZIA, type FichaTecnicaEdificio } from "@/lib/addresses/fichaTecnicaEdificio";

// Moradas de entrega de um cliente (anew_entity_addresses com
// address_type = 'delivery', ativas). Migrações 20261204400000 e
// 20261206160000: a leitura, a criação, a edição e a remoção passam todas por
// RPC (a permissão é validada lá). Cada morada pode ter uma "ficha do local"
// (anew_address_building, 1:1 com a morada): Exterior — edifício e acessos —
// e Interior — a casa (20261207110000).
//
// API estável (usada também pelos orçamentos):
//   listEntityDeliveryAddresses, addEntityDeliveryAddress,
//   updateEntityDeliveryAddress, removeEntityDeliveryAddress,
//   formatDeliveryAddress, resumoFichaTecnica, linhasResumoFichaLocal e os
//   tipos abaixo.

export type {
  Acesso,
  Amianto,
  Canalizacao,
  Eletrica,
  Estacionamento,
  FichaLocal,
  FichaTecnicaEdificio,
  Gas,
  Pavimento,
  Tipologia,
  ZonaEstacionamento,
} from "@/lib/addresses/fichaTecnicaEdificio";
export {
  resumoFichaTecnica,
  linhasResumoFichaLocal,
  fichaTecnicaVazia,
} from "@/lib/addresses/fichaTecnicaEdificio";

export interface EntityDeliveryAddress {
  entity_address_id: string;
  address_id: string;
  street: string | null;
  number: string | null;
  floor: string | null;
  unit: string | null;
  postal_code: string | null;
  city: string | null;
  formatted: string | null;
  created_at: string | null;
  /** Ficha do local (exterior + interior); null quando não foi preenchida. */
  ficha_tecnica: FichaTecnicaEdificio | null;
}

export interface DeliveryAddressInput extends MoradaCampos {
  /**
   * Ficha do local. No add: secção (exterior/interior) sem dados = não mexe
   * nessa secção da ficha que a morada já tenha. No update: a ficha é
   * substituída (null apaga as duas secções).
   */
  ficha_tecnica?: FichaTecnicaEdificio | null;
}

export interface AddDeliveryAddressResult {
  entity_address_id: string;
  address_id: string;
  formatted: string | null;
  already_existed: boolean;
}

export interface UpdateDeliveryAddressResult {
  entity_address_id: string;
  address_id: string;
  formatted: string | null;
  /** true quando a ligação passou a apontar para outra linha de anew_addresses. */
  address_changed: boolean;
}

export const EMPTY_DELIVERY_ADDRESS_INPUT: DeliveryAddressInput = {
  street: "",
  number: "",
  floor: "",
  unit: "",
  postal_code: "",
  city: "",
};

type DeliveryAddressParts = Pick<EntityDeliveryAddress, "street" | "number" | "floor" | "unit" | "postal_code" | "city">;

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value != null ? String(value).trim() : "";

/**
 * Texto da morada de entrega a partir dos campos, com andar e fração quando
 * existem: "Rua X, 12, 3º Esq, 1000-001 Lisboa". O `formatted` da RPC não traz
 * andar nem fração, por isso a encomenda usa sempre esta função.
 */
export const formatDeliveryAddress = (address: Partial<DeliveryAddressParts> | null | undefined): string => {
  if (!address) return "";
  const floorUnit = [clean(address.floor), clean(address.unit)].filter(Boolean).join(" ");
  const postalCity = [clean(address.postal_code), clean(address.city)].filter(Boolean).join(" ");
  return [clean(address.street), clean(address.number), floorUnit, postalCity]
    .filter(Boolean)
    .join(", ");
};

// Linha devolvida por rpc_list_entity_delivery_addresses (ficha em colunas).
type DeliveryAddressRow = Omit<EntityDeliveryAddress, "ficha_tecnica"> & {
  has_building?: boolean | null;
} & { [K in keyof FichaTecnicaEdificio]?: FichaTecnicaEdificio[K] | string | null };

const CAMPOS_FICHA = Object.keys(FICHA_TECNICA_VAZIA) as (keyof FichaTecnicaEdificio)[];

export const deliveryAddressFromRow = (row: DeliveryAddressRow): EntityDeliveryAddress => {
  const { has_building: hasBuilding, ...rest } = row;
  const address: Record<string, unknown> = { ...rest };
  const ficha: Record<string, unknown> = { ...FICHA_TECNICA_VAZIA };
  for (const campo of CAMPOS_FICHA) {
    ficha[campo] = row[campo] ?? null;
    delete address[campo];
  }
  // numeric pode chegar como texto, conforme o cliente — normaliza.
  if (ficha.area_util_m2 !== null) ficha.area_util_m2 = Number(ficha.area_util_m2);
  return {
    ...(address as Omit<EntityDeliveryAddress, "ficha_tecnica">),
    ficha_tecnica: hasBuilding ? (ficha as unknown as FichaTecnicaEdificio) : null,
  };
};

export const listEntityDeliveryAddresses = async (entityId: string): Promise<EntityDeliveryAddress[]> => {
  const { data, error } = await supabase.rpc("rpc_list_entity_delivery_addresses", { p_entity_id: entityId });
  if (error) throw error;
  return ((data as unknown as DeliveryAddressRow[] | null) ?? []).map(deliveryAddressFromRow);
};

/** Nome antigo de listEntityDeliveryAddresses (mantido para os chamadores existentes). */
export const fetchEntityDeliveryAddresses = listEntityDeliveryAddresses;

const optional = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined);

// Parâmetros da ficha do local (iguais no add e no update; null → omitido,
// a RPC recebe o DEFAULT NULL).
const fichaParams = (ficha: FichaTecnicaEdificio | null | undefined) => ({
  p_acesso: ficha?.acesso ?? undefined,
  p_impacto_percent: ficha?.impacto_percent ?? undefined,
  p_estacionamento: ficha?.estacionamento ?? undefined,
  p_zona_estacionamento: ficha?.zona_estacionamento ?? undefined,
  p_tem_elevador: ficha?.tem_elevador ?? undefined,
  p_n_elevadores: ficha?.n_elevadores ?? undefined,
  p_n_andares: ficha?.n_andares ?? undefined,
  p_n_fracoes_por_andar: ficha?.n_fracoes_por_andar ?? undefined,
  p_tipologia: ficha?.tipologia ?? undefined,
  p_area_util_m2: ficha?.area_util_m2 ?? undefined,
  p_n_divisoes: ficha?.n_divisoes ?? undefined,
  p_n_casas_banho: ficha?.n_casas_banho ?? undefined,
  p_ano_construcao: ficha?.ano_construcao ?? undefined,
  p_pavimento: ficha?.pavimento ?? undefined,
  p_eletrica: ficha?.eletrica ?? undefined,
  p_quadro_diferencial: ficha?.quadro_diferencial ?? undefined,
  p_canalizacao: ficha?.canalizacao ?? undefined,
  p_gas: ficha?.gas ?? undefined,
  p_amianto: ficha?.amianto ?? undefined,
  p_habitada_durante_obra: ficha?.habitada_durante_obra ?? undefined,
  p_animais: ficha?.animais ?? undefined,
  p_notas_interior: ficha?.notas_interior ?? undefined,
});

export const addEntityDeliveryAddress = async (
  entityId: string,
  input: DeliveryAddressInput,
): Promise<AddDeliveryAddressResult> => {
  const { data, error } = await supabase.rpc("rpc_add_entity_delivery_address", {
    p_entity_id: entityId,
    p_street: input.street.trim(),
    p_number: optional(input.number),
    p_postal_code: input.postal_code.trim(),
    p_city: input.city.trim(),
    p_floor: optional(input.floor),
    p_unit: optional(input.unit),
    ...fichaParams(input.ficha_tecnica),
  });
  if (error) throw error;
  return data as unknown as AddDeliveryAddressResult;
};

/**
 * Edita uma morada de entrega (a ligação mantém o mesmo entity_address_id).
 * A ficha do local é substituída pela enviada (null/omitida = apagar), as duas
 * secções: vai sempre p_com_interior = true para o interior também ser
 * substituído (sem ele — chamadas antigas — o interior gravado mantém-se).
 */
export const updateEntityDeliveryAddress = async (
  entityAddressId: string,
  input: DeliveryAddressInput,
): Promise<UpdateDeliveryAddressResult> => {
  const { data, error } = await supabase.rpc("rpc_update_entity_delivery_address", {
    p_entity_address_id: entityAddressId,
    p_street: input.street.trim(),
    p_number: optional(input.number),
    p_postal_code: input.postal_code.trim(),
    p_city: input.city.trim(),
    p_floor: optional(input.floor),
    p_unit: optional(input.unit),
    ...fichaParams(input.ficha_tecnica),
    p_com_interior: true,
  });
  if (error) throw error;
  return data as unknown as UpdateDeliveryAddressResult;
};

export const removeEntityDeliveryAddress = async (entityAddressId: string): Promise<void> => {
  const { error } = await supabase.rpc("rpc_remove_entity_delivery_address", { p_entity_address_id: entityAddressId });
  if (error) throw error;
};

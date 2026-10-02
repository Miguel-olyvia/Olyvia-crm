import { supabase } from "@/integrations/supabase/client";
import type { MoradaCampos } from "@/lib/addresses/validarMorada";
import type {
  Acesso,
  Estacionamento,
  FichaTecnicaEdificio,
  ZonaEstacionamento,
} from "@/lib/addresses/fichaTecnicaEdificio";

// Moradas de entrega de um cliente (anew_entity_addresses com
// address_type = 'delivery', ativas). Migrações 20261204400000 e
// 20261206160000: a leitura, a criação, a edição e a remoção passam todas por
// RPC (a permissão é validada lá). Cada morada pode ter uma ficha técnica do
// edifício (anew_address_building, 1:1 com a morada).
//
// API estável (usada também pelos orçamentos):
//   listEntityDeliveryAddresses, addEntityDeliveryAddress,
//   updateEntityDeliveryAddress, removeEntityDeliveryAddress,
//   formatDeliveryAddress, resumoFichaTecnica e os tipos abaixo.

export type {
  Acesso,
  Estacionamento,
  FichaTecnicaEdificio,
  ZonaEstacionamento,
} from "@/lib/addresses/fichaTecnicaEdificio";
export { resumoFichaTecnica, fichaTecnicaVazia } from "@/lib/addresses/fichaTecnicaEdificio";

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
  /** Ficha técnica do edifício; null quando não foi preenchida. */
  ficha_tecnica: FichaTecnicaEdificio | null;
}

export interface DeliveryAddressInput extends MoradaCampos {
  /**
   * Ficha técnica do edifício. No add: omitida/null = não mexe na ficha que a
   * morada já tenha. No update: null apaga a ficha.
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

// Linha devolvida por rpc_list_entity_delivery_addresses (ficha técnica em colunas).
interface DeliveryAddressRow extends Omit<EntityDeliveryAddress, "ficha_tecnica"> {
  has_building?: boolean | null;
  acesso?: string | null;
  impacto_percent?: number | null;
  estacionamento?: string | null;
  zona_estacionamento?: string | null;
  tem_elevador?: boolean | null;
  n_elevadores?: number | null;
  n_andares?: number | null;
  n_fracoes_por_andar?: number | null;
}

export const deliveryAddressFromRow = (row: DeliveryAddressRow): EntityDeliveryAddress => {
  const {
    has_building, acesso, impacto_percent, estacionamento, zona_estacionamento,
    tem_elevador, n_elevadores, n_andares, n_fracoes_por_andar, ...address
  } = row;
  return {
    ...address,
    ficha_tecnica: has_building
      ? {
          acesso: (acesso as Acesso | null) ?? null,
          impacto_percent: impacto_percent ?? null,
          estacionamento: (estacionamento as Estacionamento | null) ?? null,
          zona_estacionamento: (zona_estacionamento as ZonaEstacionamento | null) ?? null,
          tem_elevador: tem_elevador ?? null,
          n_elevadores: n_elevadores ?? null,
          n_andares: n_andares ?? null,
          n_fracoes_por_andar: n_fracoes_por_andar ?? null,
        }
      : null,
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

// Parâmetros da ficha técnica (iguais no add e no update).
const fichaParams = (ficha: FichaTecnicaEdificio | null | undefined) => ({
  p_acesso: ficha?.acesso ?? undefined,
  p_impacto_percent: ficha?.impacto_percent ?? undefined,
  p_estacionamento: ficha?.estacionamento ?? undefined,
  p_zona_estacionamento: ficha?.zona_estacionamento ?? undefined,
  p_tem_elevador: ficha?.tem_elevador ?? undefined,
  p_n_elevadores: ficha?.n_elevadores ?? undefined,
  p_n_andares: ficha?.n_andares ?? undefined,
  p_n_fracoes_por_andar: ficha?.n_fracoes_por_andar ?? undefined,
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
 * A ficha técnica é substituída pela enviada (null/omitida = apagar).
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
  });
  if (error) throw error;
  return data as unknown as UpdateDeliveryAddressResult;
};

export const removeEntityDeliveryAddress = async (entityAddressId: string): Promise<void> => {
  const { error } = await supabase.rpc("rpc_remove_entity_delivery_address", { p_entity_address_id: entityAddressId });
  if (error) throw error;
};

import { supabase } from "@/integrations/supabase/client";

// Moradas de entrega de um cliente (anew_entity_addresses com
// address_type = 'delivery', ativas). Migração 20261204400000: a leitura, a
// criação e a remoção passam todas por RPC (a permissão é validada lá).

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
}

export interface DeliveryAddressInput {
  street: string;
  number: string;
  floor: string;
  unit: string;
  postal_code: string;
  city: string;
}

export interface AddDeliveryAddressResult {
  entity_address_id: string;
  address_id: string;
  formatted: string | null;
  already_existed: boolean;
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

export const fetchEntityDeliveryAddresses = async (entityId: string): Promise<EntityDeliveryAddress[]> => {
  const { data, error } = await supabase.rpc("rpc_list_entity_delivery_addresses", { p_entity_id: entityId });
  if (error) throw error;
  return (data as unknown as EntityDeliveryAddress[] | null) ?? [];
};

export const addEntityDeliveryAddress = async (
  entityId: string,
  input: DeliveryAddressInput,
): Promise<AddDeliveryAddressResult> => {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const { data, error } = await supabase.rpc("rpc_add_entity_delivery_address", {
    p_entity_id: entityId,
    p_street: input.street.trim(),
    p_number: optional(input.number),
    p_postal_code: input.postal_code.trim(),
    p_city: input.city.trim(),
    p_floor: optional(input.floor),
    p_unit: optional(input.unit),
  });
  if (error) throw error;
  return data as unknown as AddDeliveryAddressResult;
};

export const removeEntityDeliveryAddress = async (entityAddressId: string): Promise<void> => {
  const { error } = await supabase.rpc("rpc_remove_entity_delivery_address", { p_entity_address_id: entityAddressId });
  if (error) throw error;
};

import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { formatDeliveryAddress } from "../entityDeliveryAddresses";
import { FICHA_TECNICA_VAZIA } from "../fichaTecnicaEdificio";

describe("formatDeliveryAddress", () => {
  it("inclui andar e fração quando existem", () => {
    expect(formatDeliveryAddress({
      street: "Rua X", number: "12", floor: "3º", unit: "Esq", postal_code: "1000-001", city: "Lisboa",
    })).toBe("Rua X, 12, 3º Esq, 1000-001 Lisboa");
  });

  it("omite número, andar e fração vazios", () => {
    expect(formatDeliveryAddress({
      street: " Rua Y ", number: "", floor: null, unit: "  ", postal_code: "4000-100", city: "Porto",
    })).toBe("Rua Y, 4000-100 Porto");
  });

  it("aceita só a fração", () => {
    expect(formatDeliveryAddress({
      street: "Av. Z", number: "5", floor: "", unit: "B", postal_code: "3000-000", city: "Coimbra",
    })).toBe("Av. Z, 5, B, 3000-000 Coimbra");
  });

  it("devolve vazio sem morada", () => {
    expect(formatDeliveryAddress(null)).toBe("");
    expect(formatDeliveryAddress({})).toBe("");
  });
});

describe("ficha técnica nas moradas de entrega", () => {
  const base = {
    entity_address_id: "ea1", address_id: "a1", street: "Rua X", number: "1", floor: "3", unit: null,
    postal_code: "1000-001", city: "Lisboa", formatted: "Rua X, 1, 1000-001, Lisboa", created_at: null,
  };

  it("deliveryAddressFromRow agrupa as colunas da ficha", async () => {
    const { deliveryAddressFromRow } = await import("../entityDeliveryAddresses");
    expect(deliveryAddressFromRow({
      ...base, has_building: true, acesso: "dificil", impacto_percent: 15, estacionamento: "pago",
      zona_estacionamento: null, tem_elevador: true, n_elevadores: 1, n_andares: 5, n_fracoes_por_andar: 4,
    })).toEqual({
      ...base,
      ficha_tecnica: {
        ...FICHA_TECNICA_VAZIA,
        acesso: "dificil", impacto_percent: 15, estacionamento: "pago", zona_estacionamento: null,
        tem_elevador: true, n_elevadores: 1, n_andares: 5, n_fracoes_por_andar: 4,
      },
    });
    expect(deliveryAddressFromRow({ ...base, has_building: false }).ficha_tecnica).toBeNull();
  });

  it("add e update enviam os parâmetros da ficha", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValue({ data: {}, error: null });
    const { addEntityDeliveryAddress, updateEntityDeliveryAddress } = await import("../entityDeliveryAddresses");
    const input = {
      street: " Rua X ", number: "", floor: "3", unit: "", postal_code: "1000-001", city: "Lisboa",
      ficha_tecnica: {
        ...FICHA_TECNICA_VAZIA,
        acesso: "facil" as const, impacto_percent: null, estacionamento: null, zona_estacionamento: null,
        tem_elevador: false, n_elevadores: null, n_andares: 4, n_fracoes_por_andar: null,
      },
    };
    await addEntityDeliveryAddress("e1", input);
    expect(rpc).toHaveBeenLastCalledWith("rpc_add_entity_delivery_address", expect.objectContaining({
      p_entity_id: "e1", p_street: "Rua X", p_number: undefined, p_floor: "3",
      p_acesso: "facil", p_tem_elevador: false, p_n_andares: 4, p_impacto_percent: undefined,
    }));
    await updateEntityDeliveryAddress("ea1", { ...input, ficha_tecnica: null });
    expect(rpc).toHaveBeenLastCalledWith("rpc_update_entity_delivery_address", expect.objectContaining({
      p_entity_address_id: "ea1", p_acesso: undefined, p_n_andares: undefined,
      p_tipologia: undefined, p_com_interior: true,
    }));
  });

  it("deliveryAddressFromRow traz o interior (área em texto vira número)", async () => {
    const { deliveryAddressFromRow } = await import("../entityDeliveryAddresses");
    const r = deliveryAddressFromRow({
      ...base, has_building: true, tipologia: "T3", area_util_m2: "95.50", n_casas_banho: 2,
      ano_construcao: 1985, canalizacao: "ferro", habitada_durante_obra: true, animais: false,
      notas_interior: "Cão",
    });
    expect(r).toEqual({
      ...base,
      ficha_tecnica: {
        ...FICHA_TECNICA_VAZIA,
        tipologia: "T3", area_util_m2: 95.5, n_casas_banho: 2, ano_construcao: 1985, canalizacao: "ferro",
        habitada_durante_obra: true, animais: false, notas_interior: "Cão",
      },
    });
    // As colunas da ficha não ficam soltas na morada.
    expect(r).not.toHaveProperty("tipologia");
    expect(r).not.toHaveProperty("has_building");
  });

  it("add e update enviam os campos do interior", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValue({ data: {}, error: null });
    const { addEntityDeliveryAddress, updateEntityDeliveryAddress } = await import("../entityDeliveryAddresses");
    const input = {
      street: "Rua X", number: "1", floor: "", unit: "", postal_code: "1000-001", city: "Lisboa",
      ficha_tecnica: {
        ...FICHA_TECNICA_VAZIA,
        tipologia: "T2" as const, area_util_m2: 70.5, n_divisoes: 4, n_casas_banho: 1, ano_construcao: 1970,
        pavimento: "madeira" as const, eletrica: "antiga" as const, quadro_diferencial: false,
        canalizacao: "nao_sei" as const, gas: "sem" as const, amianto: "nao" as const,
        habitada_durante_obra: true, animais: false, notas_interior: "Gato",
      },
    };
    const esperado = {
      p_tipologia: "T2", p_area_util_m2: 70.5, p_n_divisoes: 4, p_n_casas_banho: 1, p_ano_construcao: 1970,
      p_pavimento: "madeira", p_eletrica: "antiga", p_quadro_diferencial: false, p_canalizacao: "nao_sei",
      p_gas: "sem", p_amianto: "nao", p_habitada_durante_obra: true, p_animais: false, p_notas_interior: "Gato",
      p_acesso: undefined, p_tem_elevador: undefined,
    };
    await addEntityDeliveryAddress("e1", input);
    expect(rpc).toHaveBeenLastCalledWith("rpc_add_entity_delivery_address", expect.objectContaining(esperado));
    // O add não leva p_com_interior (só existe no update).
    expect(rpc.mock.calls[rpc.mock.calls.length - 1]?.[1]).not.toHaveProperty("p_com_interior");
    await updateEntityDeliveryAddress("ea1", input);
    expect(rpc).toHaveBeenLastCalledWith("rpc_update_entity_delivery_address", expect.objectContaining({
      ...esperado, p_com_interior: true,
    }));
  });
});

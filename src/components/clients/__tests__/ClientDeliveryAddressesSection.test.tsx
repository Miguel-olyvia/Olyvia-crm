// @vitest-environment jsdom
/**
 * ClientDeliveryAddressesSection — cada morada de entrega mostra o resumo da
 * ficha do local em duas linhas (Exterior / Interior).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientDeliveryAddressesSection } from "../ClientDeliveryAddressesSection";
import { FICHA_TECNICA_VAZIA } from "@/lib/addresses/fichaTecnicaEdificio";

// toast estável: o carregamento depende dele (useCallback).
const h = vi.hoisted(() => ({ list: vi.fn(), toast: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/components/clients/DeliveryAddressForm", () => ({ DeliveryAddressForm: () => <div data-testid="form" /> }));
vi.mock("@/lib/addresses/entityDeliveryAddresses", () => ({
  listEntityDeliveryAddresses: (...a: unknown[]) => h.list(...a),
  removeEntityDeliveryAddress: vi.fn(),
  formatDeliveryAddress: (a: { street?: string | null }) => a.street ?? "",
}));

const base = {
  number: "1", unit: null, postal_code: "1000-001", city: "Lisboa", formatted: null, created_at: null,
};

describe("ClientDeliveryAddressesSection", () => {
  it("mostra a ficha do local em duas linhas por morada", async () => {
    h.list.mockResolvedValue([
      {
        ...base, entity_address_id: "ea-1", address_id: "a-1", street: "Rua A", floor: "3",
        ficha_tecnica: {
          ...FICHA_TECNICA_VAZIA,
          acesso: "dificil", impacto_percent: 10, tem_elevador: true, n_elevadores: 1, n_andares: 5,
          tipologia: "T2", area_util_m2: 70.5, amianto: "nao", habitada_durante_obra: false, animais: true,
          quadro_diferencial: false,
        },
      },
      { ...base, entity_address_id: "ea-2", address_id: "a-2", street: "Rua B", floor: null, ficha_tecnica: null },
    ]);
    render(<ClientDeliveryAddressesSection entityId="ent-1" />);
    const ruaA = (await screen.findByText("Rua A")).closest("li") as HTMLElement;
    const linhas = Array.from(ruaA.querySelectorAll("p[data-seccao]")).map((p) => p.textContent);
    expect(linhas).toEqual([
      "Exterior: Difícil acesso (+10%) · 3º de 5 · elevador ×1",
      "Interior: T2 · 70,5 m² · sem amianto · animais",
    ]);
    const ruaB = screen.getByText("Rua B").closest("li") as HTMLElement;
    expect(ruaB.querySelectorAll("p[data-seccao]")).toHaveLength(0);
  });
});

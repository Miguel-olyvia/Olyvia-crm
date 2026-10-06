// @vitest-environment jsdom
/**
 * QuoteMoradasResumo — detalhe do orçamento (só leitura).
 *
 *  1. Rótulo "Morada de entrega / do serviço" e o texto gravado.
 *  2. Com entidade + site_address_id mostra a ficha do local em duas linhas.
 *  3. Sem permissão para as moradas (erro) fica só o texto.
 *  4. Sem site_address_id não pede as moradas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QuoteMoradasResumo } from "../QuoteMoradasResumo";
import { FICHA_TECNICA_VAZIA } from "@/lib/addresses/fichaTecnicaEdificio";

const h = vi.hoisted(() => ({ list: vi.fn(), fiscal: vi.fn() }));

vi.mock("@/lib/quotes/quoteMoradas", () => ({
  fetchMoradaFiscal: (...a: unknown[]) => h.fiscal(...a),
  textoMoradaFiscal: (m: { texto?: string } | null) => m?.texto ?? "",
}));
vi.mock("@/lib/addresses/entityDeliveryAddresses", () => ({
  listEntityDeliveryAddresses: (...a: unknown[]) => h.list(...a),
}));

const morada = {
  entity_address_id: "ea-1", address_id: "addr-1", street: "Rua A", number: "1", floor: "2", unit: null,
  postal_code: "1000-001", city: "Lisboa", formatted: null, created_at: null,
  ficha_tecnica: {
    ...FICHA_TECNICA_VAZIA,
    tem_elevador: false, n_andares: 4,
    tipologia: "T3", area_util_m2: 95, n_casas_banho: 2, ano_construcao: 1985, canalizacao: "ferro",
    habitada_durante_obra: true, animais: false, quadro_diferencial: false,
  },
};

describe("QuoteMoradasResumo", () => {
  beforeEach(() => {
    h.list.mockReset();
    h.fiscal.mockReset().mockResolvedValue({ texto: "Rua Fiscal, 1" });
  });

  it("mostra a morada de entrega / do serviço e a ficha do local em duas linhas", async () => {
    h.list.mockResolvedValue([morada]);
    render(<QuoteMoradasResumo quoteId="q1" obraEndereco="Rua A, 1, 2, 1000-001 Lisboa" entityId="ent-1" siteAddressId="addr-1" />);
    expect(screen.getByText("Morada de entrega / do serviço")).toBeInTheDocument();
    expect(screen.getByTestId("quote-detalhe-morada-entrega")).toHaveTextContent("Rua A, 1, 2, 1000-001 Lisboa");
    const ficha = await screen.findByTestId("quote-detalhe-ficha-local");
    const linhas = Array.from(ficha.querySelectorAll("p[data-seccao]")).map((p) => p.textContent);
    expect(linhas).toEqual([
      "Exterior: 2º de 4 · sem elevador",
      "Interior: T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada",
    ]);
    expect(h.list).toHaveBeenCalledWith("ent-1");
  });

  it("sem permissão para as moradas fica só o texto", async () => {
    h.list.mockRejectedValue(new Error("Sem permissão"));
    render(<QuoteMoradasResumo quoteId="q1" obraEndereco="Rua A" entityId="ent-1" siteAddressId="addr-1" />);
    await waitFor(() => expect(h.list).toHaveBeenCalled());
    await screen.findByText("Rua Fiscal, 1");
    expect(screen.queryByTestId("quote-detalhe-ficha-local")).not.toBeInTheDocument();
  });

  it("sem morada escolhida não pede as moradas", async () => {
    render(<QuoteMoradasResumo quoteId="q1" obraEndereco="Texto antigo" entityId="ent-1" siteAddressId={null} />);
    await screen.findByText("Rua Fiscal, 1");
    expect(h.list).not.toHaveBeenCalled();
    expect(screen.getByTestId("quote-detalhe-morada-entrega")).toHaveTextContent("Texto antigo");
  });
});

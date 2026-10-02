// @vitest-environment jsdom
/**
 * QuoteMoradaEntrega — seletor da morada de entrega do orçamento.
 *
 *  1. Escolhe a PRIMEIRA morada de entrega por defeito.
 *  2. Não escolhe por defeito quando já há valor ou texto gravado.
 *  3. Mostra o resumo da ficha do local (Exterior / Interior) da morada escolhida.
 *  4. Trocar de morada chama onChange.
 *  5. "Nova morada de entrega" → ao gravar, a nova fica escolhida.
 *  6. "Editar" → ao gravar, a escolha segue o address_id devolvido.
 *  7. Morada gravada que já não está na lista aparece como opção.
 *  8. Erro a carregar mostra a mensagem.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { EntityDeliveryAddress } from "@/lib/addresses/entityDeliveryAddresses";
import { QuoteMoradaEntrega } from "../QuoteMoradaEntrega";

const h = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/lib/addresses/entityDeliveryAddresses", () => ({
  listEntityDeliveryAddresses: (...a: unknown[]) => h.list(...a),
  formatDeliveryAddress: (a: { street?: string | null; number?: string | null; city?: string | null }) =>
    [a.street, a.number, a.city].filter(Boolean).join(", "),
}));

// O formulário real é do módulo de moradas; aqui só interessa o contrato.
vi.mock("@/components/clients/DeliveryAddressForm", () => ({
  DeliveryAddressForm: (props: {
    existente?: EntityDeliveryAddress;
    onAdded?: (r: { address_id: string }) => void;
    onSaved?: (r: { address_id: string }) => void;
    onCancel?: () => void;
  }) => (
    <div data-testid={props.existente ? "form-editar" : "form-nova"}>
      {props.existente && <span>a editar {props.existente.street}</span>}
      <button type="button" onClick={() => props.existente
        ? props.onSaved?.({ address_id: "addr-3" })
        : props.onAdded?.({ address_id: "addr-3" })}>
        gravar-stub
      </button>
      <button type="button" onClick={() => props.onCancel?.()}>cancelar-stub</button>
    </div>
  ),
}));

const morada = (id: string, street: string, extra: Partial<EntityDeliveryAddress> = {}): EntityDeliveryAddress => ({
  entity_address_id: `ea-${id}`,
  address_id: id,
  street,
  number: "1",
  floor: null,
  unit: null,
  postal_code: "1000-001",
  city: "Lisboa",
  formatted: null,
  created_at: null,
  ficha_tecnica: null,
  ...extra,
} as EntityDeliveryAddress);

const A1 = morada("addr-1", "Rua A", { ficha_tecnica: { acesso: "dificil" } as EntityDeliveryAddress["ficha_tecnica"] });
const A2 = morada("addr-2", "Rua B");
const A3 = morada("addr-3", "Rua C");

describe("QuoteMoradaEntrega", () => {
  beforeEach(() => {
    h.list.mockReset();
  });

  it("escolhe a primeira morada por defeito", async () => {
    h.list.mockResolvedValue([A1, A2]);
    const onChange = vi.fn();
    render(<QuoteMoradaEntrega entityId="ent-1" value={null} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("addr-1", A1));
    expect(h.list).toHaveBeenCalledWith("ent-1");
  });

  it("não escolhe por defeito quando já há valor ou texto gravado", async () => {
    h.list.mockResolvedValue([A1, A2]);
    const onChange = vi.fn();
    const { unmount } = render(<QuoteMoradaEntrega entityId="ent-1" value="addr-2" onChange={onChange} />);
    await screen.findByText("Rua B, 1, Lisboa");
    expect(onChange).not.toHaveBeenCalled();
    unmount();

    render(<QuoteMoradaEntrega entityId="ent-1" value={null} savedText="Texto antigo" onChange={onChange} />);
    await screen.findByText("Texto antigo");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marca a escolhida e mostra o resumo da ficha técnica", async () => {
    h.list.mockResolvedValue([A1, A2]);
    render(<QuoteMoradaEntrega entityId="ent-1" value="addr-1" onChange={vi.fn()} />);
    const opcao = await screen.findByRole("radio", { name: "Rua A, 1, Lisboa" });
    expect(opcao).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Rua B, 1, Lisboa" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("quote-morada-ficha-tecnica")).toHaveTextContent("Exterior: Difícil acesso");
  });

  it("resumo em duas linhas (Exterior / Interior) e aviso quando a ficha está vazia", async () => {
    const comInterior = morada("addr-4", "Rua D", {
      ficha_tecnica: {
        acesso: "facil", tipologia: "T3", area_util_m2: 95, n_casas_banho: 2, habitada_durante_obra: true,
      } as EntityDeliveryAddress["ficha_tecnica"],
    });
    h.list.mockResolvedValue([comInterior, A2]);
    const { unmount } = render(<QuoteMoradaEntrega entityId="ent-1" value="addr-4" onChange={vi.fn()} />);
    const resumo = await screen.findByTestId("quote-morada-ficha-tecnica");
    const linhas = Array.from(resumo.querySelectorAll("p[data-seccao]")).map((p) => p.textContent);
    expect(linhas).toEqual(["Exterior: Fácil acesso", "Interior: T3 · 95 m² · 2 WC · habitada"]);
    unmount();

    render(<QuoteMoradaEntrega entityId="ent-1" value="addr-2" onChange={vi.fn()} />);
    expect(await screen.findByText(/Ficha do local por preencher/)).toBeInTheDocument();
  });

  it("rótulo diz \"Morada de entrega / do serviço\"", () => {
    render(<QuoteMoradaEntrega entityId={null} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Morada de entrega / do serviço")).toBeInTheDocument();
    expect(screen.queryByText(/da obra/)).not.toBeInTheDocument();
  });

  it("trocar de morada chama onChange", async () => {
    h.list.mockResolvedValue([A1, A2]);
    const onChange = vi.fn();
    render(<QuoteMoradaEntrega entityId="ent-1" value="addr-1" onChange={onChange} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Rua B, 1, Lisboa" }));
    expect(onChange).toHaveBeenCalledWith("addr-2", A2);
  });

  it("nova morada: ao gravar recarrega e fica escolhida", async () => {
    h.list.mockResolvedValueOnce([A1]).mockResolvedValueOnce([A1, A3]);
    const onChange = vi.fn();
    render(<QuoteMoradaEntrega entityId="ent-1" value="addr-1" onChange={onChange} />);
    await screen.findByText("Rua A, 1, Lisboa");
    fireEvent.click(screen.getByRole("button", { name: /Nova morada de entrega/ }));
    fireEvent.click(within("form-nova", "gravar-stub"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("addr-3", A3));
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("form-nova")).not.toBeInTheDocument();
  });

  it("editar: abre o formulário com a morada escolhida e segue o novo address_id", async () => {
    h.list.mockResolvedValueOnce([A1, A2]).mockResolvedValueOnce([A3, A2]);
    const onChange = vi.fn();
    render(<QuoteMoradaEntrega entityId="ent-1" value="addr-1" onChange={onChange} />);
    await screen.findByText("Rua A, 1, Lisboa");
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    expect(screen.getByText("a editar Rua A")).toBeInTheDocument();
    fireEvent.click(within("form-editar", "gravar-stub"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("addr-3", A3));
  });

  it("morada gravada que já não está na lista aparece como opção escolhida", async () => {
    h.list.mockResolvedValue([A2]);
    const onChange = vi.fn();
    render(<QuoteMoradaEntrega entityId="ent-1" value="addr-velha" savedText="Rua Velha, 9, Porto" onChange={onChange} />);
    const gravada = await screen.findByRole("radio", { name: /Rua Velha, 9, Porto/ });
    expect(gravada).toHaveAttribute("aria-checked", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sem entidade não carrega e pede para escolher a lead/cliente", () => {
    render(<QuoteMoradaEntrega entityId={null} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Escolha primeiro a lead ou o cliente.")).toBeInTheDocument();
    expect(h.list).not.toHaveBeenCalled();
  });

  it("erro a carregar mostra a mensagem", async () => {
    h.list.mockRejectedValue(new Error("Sem permissão para ver as moradas deste cliente"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<QuoteMoradaEntrega entityId="ent-1" value={null} onChange={vi.fn()} />);
    expect(await screen.findByText(/Sem permissão para ver as moradas deste cliente/)).toBeInTheDocument();
  });
});

function within(testId: string, buttonText: string) {
  const root = screen.getByTestId(testId);
  const btn = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === buttonText);
  if (!btn) throw new Error(`botão ${buttonText} não encontrado em ${testId}`);
  return btn;
}

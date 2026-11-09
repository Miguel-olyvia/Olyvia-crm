// 9/11: os botões do modo de teste (o super admin age pelo cliente e pelo fornecedor) só existem quando a página real os põe.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seed, type Negocio } from "../motor";
import { BotaoTesteCliente } from "../PaginaNegocio";
import { definirModoTeste } from "./modoTeste";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => { cleanup(); definirModoTeste(null); });

const d = seed().deals.find((x) => x.orc?.enviada) as Negocio;

describe("o modo de teste no ecrã", () => {
  it("sem modo de teste (quem não é super admin, ou a base de produção), não há botão", () => {
    render(<BotaoTesteCliente d={d} acao="aceitar" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("com o modo de teste, aceitar e assinar pelo cliente chamam a ação certa", async () => {
    const aceitarProposta = vi.fn(async () => {}), assinarContrato = vi.fn(async () => {}), confirmarFornecedor = vi.fn(async () => {});
    act(() => definirModoTeste({ aceitarProposta, assinarContrato, confirmarFornecedor }));
    const { rerender } = render(<BotaoTesteCliente d={d} acao="aceitar" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Aceitar a proposta pelo cliente (teste)" })); });
    expect(aceitarProposta).toHaveBeenCalledWith(d);
    rerender(<BotaoTesteCliente d={d} acao="assinar" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Assinar o contrato pelo cliente (teste)" })); });
    expect(assinarContrato).toHaveBeenCalledWith(d);
    // desligado a meio (sai da organização, ou a base desliga): o botão desaparece
    act(() => definirModoTeste(null));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

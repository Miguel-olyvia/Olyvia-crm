// 9/11: os botões do modo de teste (o super admin age pelo cliente e pelo fornecedor) só existem quando a página real os põe.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seed, type Negocio } from "../motor";
import { BotaoTesteCliente, BotaoTesteSimularCliente } from "../PaginaNegocio";
import { definirModoTeste, definirSimularClienteTeste } from "./modoTeste";

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

// FERRAMENTAS-TESTE (temporário, remover antes da main)
describe("o botão de teste no passo, para os perfis normais", () => {
  afterEach(() => definirSimularClienteTeste(null));
  it("só aparece com a base a dizer que sim E no ambiente de testes; aceitar e assinar chamam a ação certa", async () => {
    render(<BotaoTesteSimularCliente d={d} acao="aceitar" ambiente={() => true} />);
    expect(screen.queryByRole("button")).toBeNull();
    const aceitarProposta = vi.fn(async () => {}), assinarContrato = vi.fn(async () => {});
    act(() => definirSimularClienteTeste({ aceitarProposta, assinarContrato }));
    cleanup();
    render(<BotaoTesteSimularCliente d={d} acao="aceitar" ambiente={() => false} />);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    const { rerender } = render(<BotaoTesteSimularCliente d={d} acao="aceitar" ambiente={() => true} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "TESTE: aceitar como o cliente" })); });
    expect(aceitarProposta).toHaveBeenCalledWith(d);
    rerender(<BotaoTesteSimularCliente d={d} acao="assinar" ambiente={() => true} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "TESTE: assinar como o cliente" })); });
    expect(assinarContrato).toHaveBeenCalledWith(d);
  });
});

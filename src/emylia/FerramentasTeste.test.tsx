// FERRAMENTAS-TESTE (temporário, remover antes da main)
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import { definirModoReal } from "./acessosPortal";
import { definirModoTeste } from "./real/modoTeste";
import { FerramentasTeste, ambienteDeTeste, passoDeTeste } from "./FerramentasTeste";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => { cleanup(); definirModoTeste(null); definirModoReal(null); });

const montar = () => {
  const S: Estado = seed();
  const A = acoes(S, vi.fn(), (f) => f());
  const ctx = { S, A, run: (f: () => void) => f(), go: (f: () => void) => () => f(), q: "" } as unknown as Ctx;
  return { S, A, ctx };
};
const porAceitar = (S: Estado) => S.deals.find((x) => x.orc?.enviada && !x.orc.aceite && !x.perdido && !x.orc.pedidoCliente) as Negocio;
const ligar = () => {
  const aceitarProposta = vi.fn(async () => {}), assinarContrato = vi.fn(async () => {}), confirmarFornecedor = vi.fn(async () => {});
  act(() => { definirModoReal("org-teste"); definirModoTeste({ aceitarProposta, assinarContrato, confirmarFornecedor }); });
  return { aceitarProposta, assinarContrato };
};

describe("ferramentas de teste: onde aparecem", () => {
  it("o ambiente: a variável do build, o deploy testarh ou localhost; nunca o domínio de produção", () => {
    expect(ambienteDeTeste("1", "app.olyvia.pt")).toBe(true);
    expect(ambienteDeTeste(undefined, "olyvia-crm-env-testarh-bmgest.vercel.app")).toBe(true);
    expect(ambienteDeTeste(undefined, "localhost")).toBe(true);
    expect(ambienteDeTeste(undefined, "app.olyvia.pt")).toBe(false);
    expect(ambienteDeTeste("0", "olyvia-crm.vercel.app")).toBe(false);
    expect(ambienteDeTeste(undefined, undefined)).toBe(false);
  });
  it("sem o modo de teste da base (não é super admin, ou produção), não aparece, mesmo no ambiente de testes", () => {
    const { S, ctx } = montar();
    act(() => definirModoReal("org-teste"));
    render(<FerramentasTeste ctx={ctx} d={porAceitar(S)} ambiente={() => true} />);
    expect(screen.queryByTestId("ferramentas-teste")).toBeNull();
  });
  it("com o modo de teste mas fora do ambiente de testes, não aparece", () => {
    const { S, ctx } = montar();
    ligar();
    render(<FerramentasTeste ctx={ctx} d={porAceitar(S)} ambiente={() => false} />);
    expect(screen.queryByTestId("ferramentas-teste")).toBeNull();
  });
  it("sem a conta real (o protótipo), não aparece", () => {
    const { S, ctx } = montar();
    ligar();
    act(() => definirModoReal(null));
    render(<FerramentasTeste ctx={ctx} d={porAceitar(S)} ambiente={() => true} />);
    expect(screen.queryByTestId("ferramentas-teste")).toBeNull();
  });
});

describe("ferramentas de teste: os botões", () => {
  it("aceitar a proposta como o cliente chama o caminho do portal (simular_cliente); assinar fica desligado sem contrato enviado", async () => {
    const { S, ctx } = montar();
    const { aceitarProposta, assinarContrato } = ligar();
    const d = porAceitar(S);
    render(<FerramentasTeste ctx={ctx} d={d} ambiente={() => true} />);
    expect(screen.getByText("TESTE — só no ambiente de testes")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Assinar o contrato como o cliente" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Aceitar a proposta como o cliente" })[0]); });
    expect(aceitarProposta).toHaveBeenCalledWith(d);
    expect(assinarContrato).not.toHaveBeenCalled();
  });
  it("assinar o contrato como o cliente, com o contrato enviado", async () => {
    const { S, ctx } = montar();
    const { assinarContrato } = ligar();
    const d = porAceitar(S);
    d.orc!.aceite = "hoje"; d.orc!.contrato = "enviado"; d.orc!.vendaDireta = false;
    render(<FerramentasTeste ctx={ctx} d={d} ambiente={() => true} />);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Assinar o contrato como o cliente" })[0]); });
    expect(assinarContrato).toHaveBeenCalledWith(d);
  });
  it("avançar: o passo do cliente usa o botão do cliente; os passos de ecrã não se forçam; os outros são a ação do passo", () => {
    const { S, A } = montar();
    expect(passoDeTeste(porAceitar(S), S, A)).toMatchObject({ tipo: "cliente", acao: "aceitar" });
    const lead = S.deals.find((x) => x.fase === 0 && !x.perdido)!;
    expect(passoDeTeste(lead, S, A)).toMatchObject({ tipo: "acao", act: "contactar" });
    const fin = S.deals.find((x) => x.fase === 4 && !x.fin.fatura && !x.perdido);
    if (fin) expect(passoDeTeste(fin, S, A).tipo).toBe("ecra");
  });
  it("avançar faz a mesma ação do botão do passo (contactar uma lead)", () => {
    const { S, ctx } = montar();
    ligar();
    const lead = S.deals.find((x) => x.fase === 0 && !x.perdido)!;
    const espiao = vi.spyOn(ctx.A, "contactar");
    render(<FerramentasTeste ctx={ctx} d={lead} ambiente={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: /^Avançar:/ }));
    expect(espiao).toHaveBeenCalledWith(lead.id);
  });
});

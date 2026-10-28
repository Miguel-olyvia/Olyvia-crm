import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { seed, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";

const m = vi.hoisted(() => ({ botao: true, primeiroFeito: false, bloqueadoSegundo: false, falta: 0, p: { t: "Enviar a proposta", wait: false } as Record<string, unknown> }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/emylia/PaginaNegocio", () => ({
  passosDaFase: () => [
    { id: "orc", titulo: "Orçamento", icone: () => null, feito: m.primeiroFeito, falta: m.falta, corpo: <div>CORPO-ORCAMENTO</div> },
    { id: "prop", titulo: "Proposta", icone: () => null, feito: false, bloqueado: m.bloqueadoSegundo, corpo: <div>CORPO-PROPOSTA</div> },
  ],
  BotaoFase: () => <button type="button">BOTAO-FASE</button>,
  temBotaoFase: () => m.botao,
}));
vi.mock("@/emylia/motor", async (original) => ({ ...(await original<typeof import("@/emylia/motor")>()), proximo: () => m.p }));
vi.mock("@/emylia/PedidoDoCliente", () => ({ PedidoDoCliente: () => null }));

import { FaseDaEmylia } from "./FaseDaEmylia";

afterEach(() => { cleanup(); m.botao = true; m.primeiroFeito = false; m.bloqueadoSegundo = false; m.falta = 0; m.p = { t: "Enviar a proposta", wait: false }; });

const deal = (): Negocio => ({ ...structuredClone(seed().deals[0]), fase: 3, perdido: false });
const ctx = (): Ctx => { const S = seed(); S.role = "direcao"; return { S, A: {} as Ctx["A"], run: vi.fn(), go: vi.fn(), q: "" }; };
const desenhar = (soLeitura = false, d = deal()) => render(<FaseDaEmylia ctx={ctx()} d={d} soLeitura={soLeitura} topo={<h2>TOPO</h2>} fasesFeitas={<div>FASES-FEITAS</div>} depois={<div>DEPOIS</div>} />);

describe("FaseDaEmylia (o ecrã da ficha de /negocios)", () => {
  it("lista de passos à esquerda (com «Fim»), «Passo 1 de 2», o título do passo e o corpo da Emylia; o topo, as fases feitas e o que vem depois também", () => {
    desenhar();
    const lista = screen.getByRole("navigation", { name: "Passos desta fase" });
    expect(lista.textContent).toContain("Orçamento");
    expect(lista.textContent).toContain("Proposta");
    expect(lista.textContent).toContain("Fim");
    expect(screen.getByText("Passo 1 de 2")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Orçamento" })).toBeTruthy();
    expect(screen.getByText("CORPO-ORCAMENTO")).toBeTruthy();
    for (const t of ["TOPO", "FASES-FEITAS", "DEPOIS"]) expect(screen.getByText(t)).toBeTruthy();
  });

  it("escolher outro passo muda o corpo; «Continuar» avança; «Anterior» recua; o «Fim» traz o botão do passo seguinte", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Proposta" }));
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("CORPO-ORCAMENTO")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fim" }));
    expect(screen.getByText("BOTAO-FASE")).toBeTruthy();
  });

  it("o cadeado: um passo bloqueado diz-o e não tem «Continuar»", () => {
    m.bloqueadoSegundo = true;
    desenhar();
    expect(screen.getByRole("button", { name: /Proposta/ }).textContent).toContain("fechado até o cliente aceitar");
    fireEvent.click(screen.getByRole("button", { name: /Proposta/ }));
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("«falta N» aparece no passo com campos em falta", () => {
    m.falta = 3;
    desenhar();
    expect(screen.getByText("faltam 3")).toBeTruthy();
  });

  it("o passo escolhido pelo utilizador não é arrastado quando o motor marca o primeiro como feito", () => {
    const { rerender } = desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Proposta" }));
    m.primeiroFeito = true;
    rerender(<FaseDaEmylia ctx={ctx()} d={deal()} soLeitura={false} topo={null} fasesFeitas={null} />);
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
  });

  it("no «Fim» diz o passo seguinte do motor e, se não é de quem está, de quem é", () => {
    m.p = { t: "À espera do cliente", sub: "Proposta no portal.", who: "cliente", wait: true };
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Fim" }));
    expect(screen.getByRole("heading", { level: 3, name: "À espera do cliente" })).toBeTruthy();
    expect(screen.getByText("Proposta no portal.")).toBeTruthy();
    m.p = { t: "Validar o pagamento", who: "financeiro", btn: "Validar pagamento", act: "validar" };
    cleanup();
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Fim" }));
    expect(screen.getByText(/Este passo é de/)).toBeTruthy();
  });

  it("com a proposta pronta a enviar o botão do passo fica em cima e em baixo, sem «Continuar»", () => {
    m.p = { t: "Enviar a proposta", who: "direcao", btn: "Enviar proposta", act: "enviar" };
    desenhar();
    expect(screen.getAllByText("BOTAO-FASE")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("só leitura: os controlos de escrita desligam-se, o conteúdo continua à vista e a lista de passos navega-se (nunca inert)", () => {
    desenhar(true);
    expect((screen.getByText("CORPO-ORCAMENTO").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Proposta" }));
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
  });
});

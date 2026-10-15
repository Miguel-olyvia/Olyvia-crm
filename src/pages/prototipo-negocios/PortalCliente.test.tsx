// O portal do cliente como percurso guiado (15/10/2026): rever a proposta inteira → aceitar → o comercial gera o contrato →
// assinar no mesmo link → o plano da obra, sem custos.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, proximo, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { PortalCliente, passoPortal } from "./PortalCliente";

afterEach(cleanup);

function Portal({ S, d, A }: { S: Estado; d: Negocio; A: ReturnType<typeof acoes> }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <PortalCliente ctx={ctx} d={d} fechar={() => {}} />;
}
function montar() {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
  d.orc!.enviada = "hoje"; d.orc!.aceite = null; d.orc!.contrato = null; d.orc!.vendaDireta = false;
  // o que o comercial preenche no passo do contrato (para o gerar)
  Object.assign(d.f, { modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não" });
  const A = acoes(S, vi.fn(), (fn) => fn());
  const r = render(<Portal S={S} d={d} A={A} />);
  return { S, d, A, r };
}

describe("portal do cliente: o percurso guiado", () => {
  it("mostra a proposta inteira e o próximo passo à vista (Aceitar)", () => {
    const { d } = montar();
    expect(passoPortal(d).estado).toBe("rever");
    expect(screen.getByRole("heading", { name: "Reveja a sua proposta" })).toBeTruthy();
    const prop = screen.getByRole("region", { name: "A proposta" });
    expect(within(prop).getByText("O que vamos fazer")).toBeTruthy();
    expect(within(prop).getByText("Materiais e escolhas")).toBeTruthy();
    expect(prop.textContent).not.toMatch(/Materiais do modelo/);
    expect(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Aceitar a proposta" })).toBeTruthy();
  });

  it("aceitar → o contrato está a ser preparado (sem botão) → o comercial gera → assina no mesmo link → vê a obra", () => {
    const { S, d, A, r } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar a proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(d.orc!.aceite).toBeTruthy();
    expect(d.orc!.contrato).toBeFalsy(); // é o comercial que gera o contrato
    expect(screen.getByRole("heading", { name: "O contrato está a ser preparado" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Próximo passo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Assinar/ })).toBeNull();

    // o comercial vê o passo claro no negócio, e gera o contrato
    expect(proximo(d, S).t).toBe("O cliente aceitou. Gerar o contrato");
    expect(proximo(d, S).btn).toBe("Gerar o contrato");
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBe("enviado");
    r.rerender(<Portal S={S} d={d} A={A} />);

    // no mesmo link: o contrato, por assinar
    expect(screen.getByRole("heading", { name: "Assinar o contrato" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "O contrato" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: /Assinar o contrato/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));
    expect(d.orc!.contrato).toBe("assinado");
    expect(d.fase).toBe(4);

    // depois de assinado: o plano da obra, sem custos nem margens
    expect(screen.getByRole("heading", { name: "A sua obra" })).toBeTruthy();
    const plano = screen.getByRole("region", { name: "O plano da obra" });
    expect(plano.textContent).not.toMatch(/€|margem|custo/i);
    expect(within(plano).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("pedir alterações em vez de aceitar", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Gostava de mudar alguma coisa" }));
    fireEvent.change(screen.getByRole("textbox", { name: "O que gostava de mudar" }), { target: { value: "Outra cor" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar o pedido" }));
    expect(d.orc!.aceite).toBeFalsy();
    expect(d.hist.some((h) => /pediu alterações/.test(h.t))).toBe(true);
  });
});

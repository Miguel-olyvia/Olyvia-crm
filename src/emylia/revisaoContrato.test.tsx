// O cliente pede alterações ao contrato (15/10/2026): o Jurídico revê e valida as cláusulas, o comercial envia a versão
// seguinte e o cliente assina no mesmo link.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, proximo, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { PortalCliente, passoPortal } from "./PortalCliente";
import { ContratoDoc, clausulasContrato } from "./DocsCliente";
import { RevisaoContrato } from "./RevisaoContrato";

afterEach(cleanup);

/** Um negócio com o contrato enviado ao cliente, por assinar. */
function comContrato() {
  const S = seed(), A = acoes(S, vi.fn(), (fn) => fn());
  const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
  Object.assign(d.orc!, { enviada: "hoje", aceite: "hoje", contrato: null, vendaDireta: false });
  Object.assign(d.f, { modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não" });
  A.enviarContrato(d.id);
  expect(d.orc!.contrato).toBe("enviado");
  return { S, A, d };
}

describe("o ciclo do contrato com o Jurídico", () => {
  it("pedido → o Jurídico reescreve e valida → o comercial envia a versão 2 → o cliente assina", () => {
    const { S, A, d } = comContrato();
    const o = d.orc!;
    A.pedirAlteracoesContrato(d.id, [{ c: "Prazo", nota: "  Quero começar em novembro " }]);
    expect(o.contrato).toBeNull();
    expect(o.contratoPedido).toMatchObject({ clausulas: [{ c: "Prazo", nota: "Quero começar em novembro" }] });
    expect(o.contratoVersoes).toHaveLength(1);
    expect(passoPortal(d).estado).toBe("revisao");
    expect(proximo(d, S)).toMatchObject({ t: "O cliente pediu alterações ao contrato", act: "abrirRevisao", who: "juridico" });
    A.enviarContrato(d.id); // à espera do Jurídico: não sai
    expect(o.contrato).toBeNull();
    A.reverClausula(d.id, "Prazo", "Início a 2 de novembro de 2026, com 8 dias úteis de execução.");
    A.validarContrato(d.id);
    expect(o.contratoPedido).toBeNull();
    expect(o.contratoRevisto).toMatchObject({ por: "Inês" });
    expect(proximo(d, S)).toMatchObject({ t: "Enviar o contrato (versão 2)", act: "enviarContrato", who: "comercial" });
    A.enviarContrato(d.id);
    expect(o.contrato).toBe("enviado");
    expect(clausulasContrato(d, S).find((c) => c.titulo === "Prazo")).toMatchObject({ texto: expect.stringMatching(/2 de novembro/), revista: true });
    render(<ContratoDoc S={S} d={d} />);
    expect(screen.getByText(/Versão 2, revista pelo Jurídico \(Inês\)/)).toBeTruthy();
    A.assinar(d.id);
    expect(o.contrato).toBe("assinado");
  });
});

function Com({ S, d, A, el }: { S: Estado; d: Negocio; A: ReturnType<typeof acoes>; el: "portal" | "revisao" }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return el === "portal" ? <PortalCliente ctx={ctx} d={d} fechar={() => {}} /> : <RevisaoContrato ctx={ctx} d={d} />;
}

describe("no ecrã", () => {
  it("portal: escolhe a cláusula, diz o que não agrada e o contrato vai ao Jurídico", () => {
    const { S, A, d } = comContrato();
    render(<Com S={S} d={d} A={A} el="portal" />);
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Pedir alterações ao contrato" }));
    const enviar = () => screen.getByRole("button", { name: "Enviar o pedido" }) as HTMLButtonElement;
    expect(enviar().disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "Cláusulas a mudar" })).getByRole("button", { name: /Pagamento/ }));
    expect(enviar().disabled).toBe(true); // falta dizer o que não agrada
    fireEvent.change(screen.getByRole("textbox", { name: /Pagamento: o que não lhe agrada/ }), { target: { value: "Prefiro 3 prestações" } });
    fireEvent.click(enviar());
    expect(d.orc!.contratoPedido!.clausulas).toEqual([{ c: "Pagamento", nota: "Prefiro 3 prestações" }]);
    expect(screen.getByRole("heading", { name: /O contrato está a ser revisto pela nossa equipa jurídica/ })).toBeTruthy();
  });

  it("Jurídico: o texto anterior e o pedido à vista; só valida com as cláusulas revistas", () => {
    const { S, A, d } = comContrato();
    A.pedirAlteracoesContrato(d.id, [{ c: "Garantia", nota: "Quero 5 anos" }]);
    S.role = "juridico";
    render(<Com S={S} d={d} A={A} el="revisao" />);
    expect(screen.getByText(/«Quero 5 anos»/)).toBeTruthy();
    const validar = () => screen.getByRole("button", { name: "Validar o contrato" }) as HTMLButtonElement;
    expect(validar().disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Novo texto" }), { target: { value: "5 anos sobre a mão de obra, a contar do auto de receção." } });
    expect(validar().disabled).toBe(false);
    fireEvent.click(validar());
    expect(d.orc!.clausulas!.Garantia).toMatch(/5 anos/);
    expect(d.orc!.contratoRevisto).toBeTruthy();
  });

  it("outro papel vê o editor só de leitura, com o atalho para o Jurídico", () => {
    const { S, A, d } = comContrato();
    A.pedirAlteracoesContrato(d.id, [{ c: "Garantia", nota: "Quero 5 anos" }]);
    render(<Com S={S} d={d} A={A} el="revisao" />);
    expect((screen.getByRole("textbox", { name: "Novo texto" }) as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Mudar para Inês · Jurídico/ })).toBeTruthy();
  });
});

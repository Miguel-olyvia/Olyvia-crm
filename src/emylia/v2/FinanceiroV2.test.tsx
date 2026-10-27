// A fase Financeiro da V2: registar faturas por tranche (a Olyvia não as emite), validar o pagamento de cada uma (recibo),
// e o pagamento do adiantamento põe a obra a andar pelo motor. Na Atual, a fase fica como era.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seed, type Estado } from "../motor";
import { CHAVE_VERSAO } from "../versaoPrototipo";
import { DocumentosSimples, ObraSimples } from "../FasesSimples";
import { FinanceiroV2 } from "./FinanceiroV2";
import { faturasDe } from "./estadoV2";
import { Montar, primarios } from "./testeV2";

beforeEach(() => localStorage.setItem(CHAVE_VERSAO, "1"));
afterEach(() => { cleanup(); localStorage.clear(); });

const deal = (S: Estado, id: number) => S.deals.find((d) => d.id === id)!;
const financeiro = (S: Estado, id: number) => { S.role = "financeiro"; return render(<Montar S={S}>{(ctx) => <FinanceiroV2 {...ctx} d={deal(S, id)} />}</Montar>); };
const tranches = () => screen.getByRole("region", { name: "Tranches" });
const registar = () => screen.getByRole("region", { name: "Registar fatura" });

describe("Financeiro V2 · registar a fatura", () => {
  it("diz que a fatura vem do programa certificado, mostra as tranches do contrato e não tem botão primário", () => {
    const S = seed();
    const { container } = financeiro(S, 1027);
    expect(screen.getByText("Emitida no programa certificado")).toBeInTheDocument();
    expect(within(tranches()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Adiantamento 50% · .* €Por faturar · ao ser paga, a obra arranca$/),
      expect.stringMatching(/^Final 50% · .* €Por faturar$/),
    ]);
    expect(screen.queryByRole("button", { name: /Emitir/ })).toBeNull();
    expect(primarios(container)).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pede o número; depois regista a fatura do adiantamento, que fica por pagar", () => {
    const S = seed();
    financeiro(S, 1027);
    fireEvent.click(within(registar()).getByRole("button", { name: "Registar fatura" }));
    expect(within(registar()).getByRole("alert")).toHaveTextContent("Falta o número da fatura.");
    expect(within(registar()).getByRole("button", { name: /^Adiantamento 50%/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(within(registar()).getByLabelText("Número da fatura"), { target: { value: "FT 2026/600" } });
    fireEvent.click(within(registar()).getByRole("button", { name: "Registar fatura" }));
    expect(within(tranches()).getByText(/Fatura FT 2026\/600 de .* · por pagar/)).toBeInTheDocument();
    expect(deal(S, 1027).fin.fatura?.n).toBe("FT 2026/600");
    expect(deal(S, 1027).hist[0].t).toMatch(/registada · Adiantamento 50% · emitida no programa certificado/);
    // a próxima tranche fica escolhida para registar
    expect(within(registar()).getByRole("button", { name: /^Final 50%/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Financeiro V2 · validar pagamentos", () => {
  it("o pagamento do adiantamento emite o recibo e põe a obra a andar (Inventário + plano); a final valida-se depois, já em obra", () => {
    const S = seed(), d = deal(S, 1027);
    financeiro(S, 1027);
    fireEvent.change(within(registar()).getByLabelText("Número da fatura"), { target: { value: "FT 2026/600" } });
    fireEvent.click(within(registar()).getByRole("button", { name: "Registar fatura" }));
    fireEvent.click(within(tranches()).getByRole("button", { name: "Validar pagamento" }));
    fireEvent.click(within(tranches()).getByRole("button", { name: /^Confirmar o pagamento/ }));
    expect(within(tranches()).getAllByRole("alert")[0]).toHaveTextContent(/conta/);
    fireEvent.click(within(tranches()).getByRole("button", { name: "Banco B · conta obras" }));
    fireEvent.change(within(tranches()).getByLabelText("Referência ou comprovativo"), { target: { value: "TRF 1013-221" } });
    fireEvent.click(within(tranches()).getByRole("button", { name: /^Confirmar o pagamento/ }));
    expect(d.fase).toBe(5);
    expect(d.fin.recibo).not.toBeNull();
    expect(d.obra.plano?.estado).toBe("por aprovar");
    // 16/10: o plano veio do contrato; a encomenda de cliente é emitida ao validar o pagamento, no Inventário novo
    expect(d.obra.ec).toMatchObject({ n: "EC-1027", estado: "emitida", ref: "CT 2026/1027" });
    const fs = faturasDe(S, d);
    expect(fs[0]).toMatchObject({ numero: "FT 2026/600", recibo: d.fin.recibo!.n, pagamento: { conta: "Banco B · conta obras", ref: "TRF 1013-221" } });
    expect(screen.getByText(/A obra está a andar/)).toBeInTheDocument();

    // a tranche final: regista-se e valida-se sem voltar a disparar a obra
    const plano = d.obra.plano;
    fireEvent.change(within(registar()).getByLabelText("Número da fatura"), { target: { value: "FT 2026/640" } });
    fireEvent.click(within(registar()).getByRole("button", { name: "Registar fatura" }));
    fireEvent.click(within(tranches()).getByRole("button", { name: "Validar pagamento" }));
    fireEvent.click(within(tranches()).getByRole("button", { name: "Banco B · conta obras" }));
    fireEvent.change(within(tranches()).getByLabelText("Referência ou comprovativo"), { target: { value: "TRF 2" } });
    fireEvent.click(within(tranches()).getByRole("button", { name: /^Confirmar o pagamento/ }));
    expect(d.obra.plano).toBe(plano);
    expect(faturasDe(S, d).map((f) => !!f.recibo)).toEqual([true, true]);
    expect(faturasDe(S, d)[1].recibo).not.toBe(faturasDe(S, d)[0].recibo);
    expect(screen.getByText("Todas as tranches faturadas e pagas.")).toBeInTheDocument();
  });

  it("a fatura única da demonstração conta como o adiantamento já pago", () => {
    const S = seed();
    financeiro(S, 1050);
    expect(within(tranches()).getByText(/Paga a 24\/09\/2026 · recibo RC 2026\/270/)).toBeInTheDocument();
    expect(within(tranches()).getAllByText("Por faturar")).toHaveLength(1);
  });
});

describe("Financeiro V2 · ligado só na V2 e na V2 funcional", () => {
  const docs = (S: Estado, id: number) => { S.role = "financeiro"; return render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={deal(S, id)} />}</Montar>); };
  it("V2 e V2 funcional: registar com tranches; Atual: registar a fatura do ERP", () => {
    for (const [v, novo] of [["1", true], ["funcional", true], ["0", false]] as const) {
      localStorage.setItem(CHAVE_VERSAO, v);
      docs(seed(), 1027);
      expect(!!screen.queryByRole("region", { name: "Registar fatura" })).toBe(novo);
      expect(!!screen.queryByText("Registar a fatura do ERP")).toBe(!novo);
      cleanup();
    }
  });
  it("na fase Obra da V2, a tranche que falta aparece no fim; na Atual também, quando o contrato tem várias prestações (26/10)", () => {
    const S = seed();
    render(<Montar S={S}>{(ctx) => <ObraSimples {...ctx} d={deal(S, 1022)} />}</Montar>);
    expect(screen.getByRole("region", { name: "Faturas e pagamentos" })).toBeInTheDocument();
    cleanup();
    localStorage.setItem(CHAVE_VERSAO, "0");
    render(<Montar S={S}>{(ctx) => <ObraSimples {...ctx} d={deal(S, 1022)} />}</Montar>);
    expect(screen.getByRole("region", { name: "Faturas e pagamentos" })).toBeInTheDocument();
    cleanup();
    // pago de uma vez (uma só prestação): na Atual não há tranches por registar
    deal(S, 1022).f.pagamento = "100% na adjudicação";
    render(<Montar S={S}>{(ctx) => <ObraSimples {...ctx} d={deal(S, 1022)} />}</Montar>);
    expect(screen.queryByRole("region", { name: "Faturas e pagamentos" })).toBeNull();
  });
});

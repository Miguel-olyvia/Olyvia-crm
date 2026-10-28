import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { seed, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";

const m = vi.hoisted(() => ({ plano: false, botao: true }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/emylia/FasesSimples", () => ({
  DocumentosSimples: () => <div>DOCUMENTOS-FINANCEIRO</div>,
  ObraSimples: () => <div>OBRA-SIMPLES</div>,
}));
vi.mock("@/emylia/CaminhoObra", () => ({ CaminhoObra: () => <div>CAMINHO-OBRA</div> }));
vi.mock("@/emylia/TrabalhosAMais", () => ({ TrabalhosAMais: () => <div>TRABALHOS-A-MAIS</div> }));
vi.mock("@/emylia/PaginaNegocio", () => ({ BotaoFase: () => <button type="button">BOTAO-FASE</button>, temBotaoFase: () => m.botao }));
vi.mock("./protegerObra", () => ({
  podeMontarObra: (d: Negocio) => d.fase === 5 && m.plano,
  temPlanoDaObra: () => m.plano,
  proximoSeguro: () => ({ t: "x", wait: false }),
}));

import { PainelPosContrato, temPainelPosContrato } from "./PainelPosContrato";

afterEach(() => { cleanup(); m.plano = false; m.botao = true; });

const deal = (fase: number, extra: Partial<Negocio> = {}): Negocio => ({ ...structuredClone(seed().deals[0]), fase, perdido: false, hist: [], ...extra });
const ctx = (): Ctx => ({ S: seed(), A: {} as Ctx["A"], run: vi.fn(), go: vi.fn(), q: "" });

describe("PainelPosContrato", () => {
  it("só existe a partir do Financeiro e num negócio não perdido", () => {
    expect(temPainelPosContrato(undefined)).toBe(false);
    expect(temPainelPosContrato(deal(3))).toBe(false);
    expect(temPainelPosContrato(deal(4))).toBe(true);
    expect(temPainelPosContrato(deal(5, { perdido: true }))).toBe(false);
  });

  it("no Financeiro mostra a fatura, o botão do passo e diz que a encomenda ainda não existe", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.getByText("DOCUMENTOS-FINANCEIRO")).toBeTruthy();
    expect(screen.getByText("BOTAO-FASE")).toBeTruthy();
    expect(screen.getByText(/neg_registar_fatura/)).toBeTruthy();
    expect(screen.queryByText("OBRA-SIMPLES")).toBeNull();
  });

  it("na Obra sem plano não monta a obra e diz porquê, sem dados de exemplo", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(5)} podeGravar />);
    expect(screen.getByText("A obra ainda não tem plano")).toBeTruthy();
    expect(screen.queryByText("OBRA-SIMPLES")).toBeNull();
    expect(screen.queryByText("CAMINHO-OBRA")).toBeNull();
    expect(screen.queryByText("BOTAO-FASE")).toBeNull();
    expect(screen.getByText("TRABALHOS-A-MAIS")).toBeTruthy();
  });

  it("na Obra com plano mostra a obra e avisa que o plano só vive no ecrã", () => {
    m.plano = true;
    render(<PainelPosContrato ctx={ctx()} d={deal(5)} podeGravar />);
    expect(screen.getByText("OBRA-SIMPLES")).toBeTruthy();
    expect(screen.getByText("CAMINHO-OBRA")).toBeTruthy();
    expect(screen.getByText("Plano só neste ecrã")).toBeTruthy();
  });

  it("o Financeiro já feito abre em leitura quando o negócio está na Obra: desligado, mas lido (nunca inert)", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(5)} podeGravar />);
    const bloco = screen.getByText("DOCUMENTOS-FINANCEIRO").closest("fieldset");
    expect(bloco).not.toBeNull();
    expect(bloco?.disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("sem permissão fica tudo desligado mas visível (sem inert)", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar={false} />);
    expect(screen.getByText("DOCUMENTOS-FINANCEIRO").closest("fieldset")?.disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("com permissão, o Financeiro atual não está desligado", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.getByText("DOCUMENTOS-FINANCEIRO").closest("fieldset")?.disabled).toBe(false);
  });

  it("anular o contrato não se oferece: diz que ainda não está disponível", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.getByText(/neg_anular_contrato/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /anular/i })).toBeNull();
  });

  it("o histórico vazio diz que não há acontecimentos; com eventos lista-os", () => {
    const { rerender } = render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.getByText("Ainda sem acontecimentos.")).toBeTruthy();
    rerender(<PainelPosContrato ctx={ctx()} d={deal(4, { hist: [{ t: "Fatura registada", q: "28/10", k: "a" }] as Negocio["hist"] })} podeGravar />);
    expect(screen.getByText("Fatura registada")).toBeTruthy();
  });
});

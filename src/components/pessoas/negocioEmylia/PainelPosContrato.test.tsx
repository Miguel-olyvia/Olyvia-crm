import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { seed, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";

const m = vi.hoisted(() => ({ plano: false, anular: true }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/emylia/FasesSimples", () => ({ DocumentosSimples: () => <div>DOCUMENTOS-FINANCEIRO</div> }));
vi.mock("@/emylia/CaminhoObra", () => ({ CaminhoObra: () => <div>CAMINHO-OBRA</div> }));
vi.mock("@/emylia/TrabalhosAMais", () => ({ TrabalhosAMais: () => <div><button type="button">NOVA-ADENDA</button>TRABALHOS-A-MAIS</div> }));
vi.mock("@/emylia/AnularContrato", () => ({
  podeAnular: () => m.anular,
  oQueAnular: () => "contrato",
  ConfirmarAnulacao: ({ fechar }: { fechar: () => void }) => <div>CONFIRMAR-ANULACAO<button type="button" onClick={fechar}>fechar</button></div>,
}));
vi.mock("./protegerObra", () => ({ podeMontarObra: (d: Negocio) => d.fase === 5 && m.plano, temPlanoDaObra: () => m.plano }));

import { PainelPosContrato, temPainelPosContrato } from "./PainelPosContrato";

afterEach(() => { cleanup(); m.plano = false; m.anular = true; });

const deal = (fase: number, extra: Partial<Negocio> = {}): Negocio => ({ ...structuredClone(seed().deals[0]), fase, perdido: false, hist: [], ...extra });
const ctx = (): Ctx => ({ S: seed(), A: {} as Ctx["A"], run: vi.fn(), go: vi.fn(), q: "" });

describe("PainelPosContrato (o que a página /negocios põe à volta dos passos do Financeiro e da Obra)", () => {
  it("só existe a partir do Financeiro e num negócio não perdido", () => {
    expect(temPainelPosContrato(undefined)).toBe(false);
    expect(temPainelPosContrato(deal(3))).toBe(false);
    expect(temPainelPosContrato(deal(4))).toBe(true);
    expect(temPainelPosContrato(deal(5, { perdido: true }))).toBe(false);
  });

  it("no Financeiro não há nenhum bloqueio «ainda não disponível»: trabalhos a mais ativos e histórico à vista", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.queryByText(/ainda não está disponível/i)).toBeNull();
    expect(screen.queryByText(/neg_registar_fatura/)).toBeNull();
    expect(screen.queryByText(/neg_anular_contrato/)).toBeNull();
    expect((screen.getByRole("button", { name: "NOVA-ADENDA" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
    expect(screen.getByText("Histórico")).toBeTruthy();
  });

  it("anular o contrato oferece-se quando a Emylia o permite, e abre a confirmação dela (com o motivo)", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.queryByText("CONFIRMAR-ANULACAO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Anular contrato" }));
    expect(screen.getByText("CONFIRMAR-ANULACAO")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "fechar" }));
    expect(screen.queryByText("CONFIRMAR-ANULACAO")).toBeNull();
  });

  it("quando a Emylia não deixa anular (por exemplo a obra já está em curso) o botão não aparece", () => {
    m.anular = false;
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.queryByRole("button", { name: /Anular/ })).toBeNull();
  });

  it("na Obra sem plano diz porquê (as funções das Operações existem; só não estão ligadas) e mantém os trabalhos a mais", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(5)} podeGravar />);
    expect(screen.getByText("A obra ainda não tem plano")).toBeTruthy();
    expect(screen.getByText(/ops_obra_\*\) existem na base/)).toBeTruthy();
    expect(screen.queryByText("CAMINHO-OBRA")).toBeNull();
    expect(screen.getByText(/TRABALHOS-A-MAIS/)).toBeTruthy();
  });

  it("na Obra com plano mostra o caminho da obra e avisa que o plano só vive no ecrã (como a página)", () => {
    m.plano = true;
    render(<PainelPosContrato ctx={ctx()} d={deal(5)} podeGravar />);
    expect(screen.getByText("CAMINHO-OBRA")).toBeTruthy();
    expect(screen.getByText("Plano só neste ecrã")).toBeTruthy();
  });

  it("o Financeiro já feito abre em leitura quando o negócio está na Obra: desligado, mas lido (nunca inert)", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(5)} podeGravar />);
    expect((screen.getByText("DOCUMENTOS-FINANCEIRO").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("sem permissão fica tudo desligado mas visível (sem inert)", () => {
    render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar={false} />);
    expect((screen.getByRole("button", { name: "NOVA-ADENDA" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("o histórico vazio diz que não há acontecimentos; com eventos lista-os", () => {
    const { rerender } = render(<PainelPosContrato ctx={ctx()} d={deal(4)} podeGravar />);
    expect(screen.getByText("Ainda sem acontecimentos.")).toBeTruthy();
    rerender(<PainelPosContrato ctx={ctx()} d={deal(4, { hist: [{ t: "Fatura registada", q: "28/10", k: "a" }] as Negocio["hist"] })} podeGravar />);
    expect(screen.getByText("Fatura registada")).toBeTruthy();
  });
});

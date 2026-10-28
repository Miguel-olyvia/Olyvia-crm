import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { seed, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import type { FaseFeita } from "../processo/passoGuiado";
import type { NegocioEmylia } from "./useNegocioEmylia";

const m = vi.hoisted(() => ({ pode: { gravar: true, aLer: false, falhou: false, repetir: vi.fn() }, botao: true, primeiroFeito: false }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/emylia/PaginaNegocio", () => ({
  passosDaFase: () => [
    { id: "orc", titulo: "Orçamento", icone: () => null, feito: m.primeiroFeito, corpo: <div>CORPO-ORCAMENTO</div> },
    { id: "prop", titulo: "Proposta ao cliente", icone: () => null, feito: false, corpo: <div>CORPO-PROPOSTA</div> },
  ],
  BotaoFase: () => <button type="button">BOTAO-FASE</button>,
  temBotaoFase: () => m.botao,
}));
vi.mock("@/emylia/motor", async (original) => ({ ...(await original<typeof import("@/emylia/motor")>()), proximo: () => ({ t: "Enviar a proposta", wait: false }) }));
vi.mock("@/emylia/PedidoDoCliente", () => ({ PedidoDoCliente: () => null }));
vi.mock("@/emylia/OrcamentoSimples", () => ({ OrcamentoSimples: () => <div>ORCAMENTO-LIDO</div> }));
vi.mock("@/emylia/DocsCliente", () => ({
  Partilhar: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  PropostaDoc: () => <div>PROPOSTA-LIDA</div>,
  ContratoDoc: () => <div>CONTRATO-LIDO</div>,
}));
vi.mock("@/emylia/FasesSimples", () => ({ DocumentosSimples: () => <div>FINANCEIRO-LIDO</div> }));
vi.mock("./PainelPosContrato", () => ({
  PainelPosContrato: () => <div>PAINEL-POS-CONTRATO</div>,
  SoParaLer: ({ ativo, children }: { ativo: boolean; children: unknown }) => <fieldset disabled={ativo}>{children as never}</fieldset>,
}));
vi.mock("./permissoesPosContrato", () => ({ usePermissoesPosContrato: () => m.pode }));

import { NegocioEmyliaDoGuia } from "./NegocioEmyliaDoGuia";

afterEach(() => { cleanup(); vi.clearAllMocks(); m.pode = { gravar: true, aLer: false, falhou: false, repetir: vi.fn() }; m.botao = true; m.primeiroFeito = false; });

const deal = (fase: number): Negocio => ({ ...structuredClone(seed().deals[0]), fase, perdido: false });
const ctx = (): Ctx => ({ S: seed(), A: {} as Ctx["A"], run: vi.fn(), go: vi.fn(), q: "" });
const lido = (d: Negocio | undefined, extra: Partial<NegocioEmylia> = {}): NegocioEmylia => ({
  leitura: { k: "pronto" }, gravacao: { k: "parado" }, avisos: [], d, docsCrm: false, ctx: d ? ctx() : null, reler: vi.fn(() => true), regravar: vi.fn(), ...extra,
});
const feitas: FaseFeita[] = [
  { id: "contactado", rotuloChave: "pessoasPagina.board.col.contactado", estado: "feita", itens: [] },
  { id: "orcamento", rotuloChave: "pessoasPagina.phases.orcamento", estado: "feita", itens: [] },
];
const abordagem = { email: "", chamadas: 2, visitasMarcadas: 0, levantamentos: 0 };
type Fase = "orcamento" | "proposta" | "contrato" | "financeiro" | "obra";
const props = (e: NegocioEmylia, fase: Fase, atual: Fase = fase) => ({
  fase, atual, e, org: "org-1", podeEditar: true, feitas, faseVista: fase === atual ? null : fase, aoVerFase: vi.fn(), aoVoltarAoAtual: vi.fn(), nivel: "h3" as const, abordagem,
});

describe("NegocioEmyliaDoGuia", () => {
  it("enquanto a organização é lida diz-o; se a leitura falha mostra o erro e deixa tentar outra vez", () => {
    const { rerender } = render(<NegocioEmyliaDoGuia {...props(lido(undefined, { leitura: { k: "a-ler" } }), "orcamento")} />);
    expect(screen.getByText("A ler o negócio…")).toBeTruthy();
    const reler = vi.fn(() => true);
    rerender(<NegocioEmyliaDoGuia {...props(lido(undefined, { leitura: { k: "erro", t: "sem rede" }, reler }), "orcamento")} />);
    expect(screen.getByRole("alert").textContent).toContain("sem rede");
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(reler).toHaveBeenCalled();
  });

  it("um negócio que a base não devolveu fica com um estado honesto e deixa tentar outra vez", () => {
    const e = lido(undefined);
    render(<NegocioEmyliaDoGuia {...props(e, "financeiro")} />);
    expect(screen.getByText("Negócio por ler")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(e.reler).toHaveBeenCalled();
    expect(screen.queryByText("PAINEL-POS-CONTRATO")).toBeNull();
  });

  it("um negócio com documentos do CRM só se lê: diz porquê e não monta nada que grave", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(0), { docsCrm: true }), "financeiro")} />);
    expect(screen.getByText("Este negócio é do CRM")).toBeTruthy();
    expect(screen.queryByText("PAINEL-POS-CONTRATO")).toBeNull();
    expect(screen.queryByText("BOTAO-FASE")).toBeNull();
  });

  it("no Orçamento mostra os passos da Emylia, o primeiro aberto, e o que a abordagem entrega", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "orcamento")} />);
    expect(screen.getByText("CORPO-ORCAMENTO")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Proposta ao cliente/ })).toBeTruthy();
    expect(screen.getByText(/2 no CRM, que a Emylia não lê/)).toBeTruthy();
  });

  it("escolher outro passo muda o corpo; o último («Fim») traz o botão do passo do negócio", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "orcamento")} />);
    fireEvent.click(screen.getByRole("button", { name: /Proposta ao cliente/ }));
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
    expect(screen.queryByText("CORPO-ORCAMENTO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fim" }));
    expect(screen.getByText("BOTAO-FASE")).toBeTruthy();
  });

  it("o passo escolhido pelo utilizador não é arrastado quando o motor marca o primeiro como feito", () => {
    const e = lido(deal(3));
    const { rerender } = render(<NegocioEmyliaDoGuia {...props(e, "orcamento")} />);
    fireEvent.click(screen.getByRole("button", { name: /Proposta ao cliente/ }));
    m.primeiroFeito = true;
    rerender(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "orcamento")} />);
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
  });

  it("sem permissão os controlos desligam-se mas o conteúdo continua à vista e os passos navegam-se (nunca inert)", () => {
    m.pode = { gravar: false, aLer: false, falhou: false, repetir: vi.fn() };
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "orcamento")} />);
    expect(screen.getByText("CORPO-ORCAMENTO").closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByText("Só leitura")).toBeTruthy();
    expect(document.querySelector("[inert]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Proposta ao cliente/ }));
    expect(screen.getByText("CORPO-PROPOSTA")).toBeTruthy();
  });

  it("se a leitura das permissões falhou diz-se, não deixa gravar e deixa tentar outra vez", () => {
    m.pode = { gravar: false, aLer: false, falhou: true, repetir: vi.fn() };
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "orcamento")} />);
    expect(screen.getByText(/Não foi possível ler as permissões/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(m.pode.repetir).toHaveBeenCalled();
  });

  it("uma gravação que falhou mostra o erro e deixa tentar gravar outra vez", () => {
    const repetir = vi.fn();
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3), { gravacao: { k: "erro", t: "RLS recusou" } }), "orcamento")} repetirGravacao={repetir} />);
    expect(screen.getByText(/Não gravou: RLS recusou/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar gravar outra vez" }));
    expect(repetir).toHaveBeenCalled();
  });

  it("mostra os avisos do motor: o mau como alerta, o normal como estado", () => {
    const avisos = [{ id: 1, msg: "Faltam campos", sub: "Preencha o orçamento", kind: "bad" as const }, { id: 2, msg: "Orçamento criado", kind: "ok" as const }];
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3), { avisos }), "orcamento")} />);
    expect(screen.getByRole("alert").textContent).toContain("Faltam campos");
    expect(screen.getByText("Orçamento criado").closest("[role='status']")).not.toBeNull();
  });

  it("enquanto o negócio passa de Visita a Negócio diz-o", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(2)), "orcamento")} aPassar />);
    expect(screen.getByText("A passar o negócio para o Orçamento…")).toBeTruthy();
  });

  it("no Financeiro e na Obra monta o painel do pós-contrato", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(4)), "financeiro")} />);
    expect(screen.getByText("PAINEL-POS-CONTRATO")).toBeTruthy();
  });

  it("uma fase feita abre em leitura (desligada mas visível) com o conteúdo dessa fase e o caminho de volta", () => {
    const d = deal(4);
    d.orc = { enviada: "20/10", aceite: "21/10", contrato: "assinado", vendaDireta: false } as unknown as Negocio["orc"];
    const p = props(lido(d), "orcamento", "financeiro");
    render(<NegocioEmyliaDoGuia {...p} />);
    expect(screen.getByText("ORCAMENTO-LIDO").closest("fieldset")?.disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao passo atual" }));
    expect(p.aoVoltarAoAtual).toHaveBeenCalled();
  });

  it("as fases feitas (também as da abordagem) ficam escolhíveis na coluna, para ver o que aconteceu", () => {
    const p = props(lido(deal(3)), "orcamento");
    render(<NegocioEmyliaDoGuia {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    expect(p.aoVerFase).toHaveBeenCalledWith("contactado");
  });

  it("uma fase feita sem o documento na base diz que não há, em vez de rebentar", () => {
    const d = deal(4);
    d.orc = null;
    render(<NegocioEmyliaDoGuia {...props(lido(d), "proposta", "financeiro")} />);
    expect(screen.getByText("Sem proposta registada")).toBeTruthy();
  });
});

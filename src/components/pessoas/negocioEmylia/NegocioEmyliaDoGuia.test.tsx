import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { seed, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import type { FaseFeita } from "../processo/passoGuiado";
import type { NegocioEmylia } from "./useNegocioEmylia";

const m = vi.hoisted(() => ({ pode: { gravar: true, aLer: false, falhou: false, repetir: vi.fn() }, real: false }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/emylia/motor", async (original) => ({ ...(await original<typeof import("@/emylia/motor")>()), tot: () => ({ pf: 3609, m: 0.393 }) }));
vi.mock("@/emylia/OrcamentoSimples", () => ({ OrcamentoSimples: () => <div>ORCAMENTO-LIDO</div> }));
vi.mock("@/emylia/DocsCliente", () => ({
  Partilhar: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  PropostaDoc: () => <div>PROPOSTA-LIDA</div>,
  ContratoDoc: () => <div>CONTRATO-LIDO</div>,
}));
vi.mock("@/emylia/FasesSimples", () => ({ DocumentosSimples: () => <div>FINANCEIRO-LIDO</div> }));
vi.mock("@/emylia/CamposFase", () => ({ Campos: () => <div>CAMPOS-LIDOS</div> }));
vi.mock("@/emylia/PortalCliente", () => ({ PortalCliente: ({ fechar }: { fechar: () => void }) => <div>PORTAL-PREVIA<button type="button" onClick={fechar}>fechar-portal</button></div> }));
vi.mock("@/emylia/AcessoPortalNegocio", () => ({
  temPortal: () => true,
  BotaoAcessoPortal: () => <button type="button">ACESSO-AO-PORTAL</button>,
  EstadoAcessoPortal: () => <p>ESTADO-DO-PORTAL</p>,
}));
vi.mock("@/emylia/acessosPortal", () => ({ modoReal: () => m.real }));
vi.mock("./PainelPosContrato", () => ({ PainelPosContrato: () => <div>PAINEL-POS-CONTRATO</div>, HistoricoDoNegocio: () => <div>HISTORICO-DO-NEGOCIO</div> }));
vi.mock("./FaseDaEmylia", () => ({
  FaseDaEmylia: (p: { soLeitura: boolean; topo: unknown; fasesFeitas: unknown; depois?: unknown }) => (
    <div data-testid="fase-emylia" data-soleitura={String(p.soLeitura)}>{p.topo as never}{p.fasesFeitas as never}{p.depois as never}</div>
  ),
}));
vi.mock("./permissoesPosContrato", () => ({ usePermissoesPosContrato: () => m.pode }));

import { NegocioEmyliaDoGuia } from "./NegocioEmyliaDoGuia";

afterEach(() => { cleanup(); vi.clearAllMocks(); m.pode = { gravar: true, aLer: false, falhou: false, repetir: vi.fn() }; m.real = false; });

const deal = (fase: number): Negocio => ({ ...structuredClone(seed().deals[0]), fase, perdido: false });
const ctx = (): Ctx => ({ S: seed(), A: {} as Ctx["A"], run: vi.fn(), go: vi.fn(), q: "" });
const lido = (d: Negocio | undefined, extra: Partial<NegocioEmylia> = {}): NegocioEmylia => ({
  leitura: { k: "pronto" }, gravacao: { k: "parado" }, avisos: [], d, docsCrm: false, ctx: d ? ctx() : null, reler: vi.fn(() => true), regravar: vi.fn(), ...extra,
});
const feitas: FaseFeita[] = [
  { id: "contactado", rotuloChave: "pessoasPagina.board.col.contactado", estado: "feita", itens: [] },
  { id: "negocio", rotuloChave: "pessoasPagina.guia.fase.negocio", estado: "feita", itens: [] },
];
const abordagem = { email: "", chamadas: 2, visitasMarcadas: 0, levantamentos: 0 };
type Fase = "negocio" | "financeiro" | "obra";
const props = (e: NegocioEmylia, fase: Fase, atual: Fase = fase) => ({
  fase, atual, e, org: "org-1", podeEditar: true, feitas, faseVista: fase === atual ? null : fase, aoVerFase: vi.fn(), aoVoltarAoAtual: vi.fn(), nivel: "h3" as const, abordagem,
});

describe("NegocioEmyliaDoGuia", () => {
  it("enquanto a organização é lida diz-o; se a leitura falha mostra o erro e deixa tentar outra vez", () => {
    const { rerender } = render(<NegocioEmyliaDoGuia {...props(lido(undefined, { leitura: { k: "a-ler" } }), "negocio")} />);
    expect(screen.getByText("A ler o negócio…")).toBeTruthy();
    const reler = vi.fn(() => true);
    rerender(<NegocioEmyliaDoGuia {...props(lido(undefined, { leitura: { k: "erro", t: "sem rede" }, reler }), "negocio")} />);
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
    expect(screen.queryByTestId("fase-emylia")).toBeNull();
  });

  it("um negócio com documentos do CRM só se lê: diz porquê e não monta nada que grave", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(0), { docsCrm: true }), "financeiro")} />);
    expect(screen.getByText("Este negócio é do CRM")).toBeTruthy();
    expect(screen.queryByTestId("fase-emylia")).toBeNull();
    expect(screen.queryByText("PAINEL-POS-CONTRATO")).toBeNull();
  });

  it("a fase Negócio monta o ecrã da Emylia (passos, «Passo n de N», campos), com o topo: fase «Negócio», cabeçalho, ponte e as fases feitas", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "negocio")} />);
    expect(screen.getByTestId("fase-emylia")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Negócio" })).toBeTruthy();
    expect(screen.getByText(/2 no CRM, que a Emylia não lê/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Contactado" })).toBeTruthy();
    expect(screen.queryByText("PAINEL-POS-CONTRATO")).toBeNull();
  });

  it("o cabeçalho traz o que a Emylia mostra e existe nos dados: email, morada e «€ s/ IVA · margem»; sem dados não inventa", () => {
    const d = deal(3);
    d.f = { email: "ana@x.pt", morada: "Rua A", cp: "1000-001", localidade: "Lisboa" };
    d.orc = { enviada: null, aceite: null, contrato: null } as unknown as Negocio["orc"];
    const { unmount } = render(<NegocioEmyliaDoGuia {...props(lido(d), "negocio")} />);
    expect(screen.getByText("ana@x.pt")).toBeTruthy();
    expect(screen.getByText("Rua A, 1000-001, Lisboa")).toBeTruthy();
    expect(screen.getByText(/s\/ IVA · margem/)).toBeTruthy();
    unmount();
    const vazio = deal(3);
    vazio.f = {}; vazio.tel = ""; vazio.local = ""; vazio.orc = null;
    const { container } = render(<NegocioEmyliaDoGuia {...props(lido(vazio), "negocio")} />);
    expect(screen.queryByText(/s\/ IVA/)).toBeNull();
    expect(container.querySelector("dl")).toBeNull();
  });

  it("«Ver como o cliente» abre a prévia do portal quando há proposta enviada; o acesso ao portal só com a organização real ligada (como a página)", () => {
    const d = deal(3);
    d.orc = { enviada: "20/10", aceite: null, contrato: null, versoes: [] } as unknown as Negocio["orc"];
    const { unmount } = render(<NegocioEmyliaDoGuia {...props(lido(d), "negocio")} />);
    expect(screen.queryByText("ACESSO-AO-PORTAL")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver como o cliente" }));
    expect(screen.getByText("PORTAL-PREVIA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "fechar-portal" }));
    expect(screen.queryByText("PORTAL-PREVIA")).toBeNull();
    unmount();
    m.real = true;
    render(<NegocioEmyliaDoGuia {...props(lido(d), "negocio")} />);
    expect(screen.getByText("ACESSO-AO-PORTAL")).toBeTruthy();
    expect(screen.getByText("ESTADO-DO-PORTAL")).toBeTruthy();
  });

  it("sem proposta enviada não há «Ver como o cliente»; um contrato anulado diz-se com o motivo; o WhatsApp vem do telefone", () => {
    const d = deal(4);
    d.orc = null; d.tel = "927 118 300";
    d.anulado = { q: "28/10", por: "Direção", motivo: "O cliente desistiu", origem: "negocio" };
    render(<NegocioEmyliaDoGuia {...props(lido(d), "financeiro")} />);
    expect(screen.queryByRole("button", { name: "Ver como o cliente" })).toBeNull();
    expect(screen.getByText("Contrato anulado")).toBeTruthy();
    expect(screen.getByText("O cliente desistiu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "927 118 300" }).getAttribute("href")).toBe("https://wa.me/351927118300");
  });

  it("a fase Negócio leva o histórico («últimos acontecimentos») por baixo dos passos", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "negocio")} />);
    expect(screen.getByText("HISTORICO-DO-NEGOCIO")).toBeTruthy();
  });

  it("uma fase feita mostra também os campos da fase só para ler (Validade, Prazo de execução, Condições de pagamento…)", () => {
    const d = deal(4);
    d.orc = { enviada: "20/10", aceite: "21/10", contrato: "assinado", vendaDireta: false } as unknown as Negocio["orc"];
    render(<NegocioEmyliaDoGuia {...props(lido(d), "negocio", "financeiro")} />);
    expect(screen.getAllByText("CAMPOS-LIDOS").length).toBeGreaterThan(0);
  });

  it("sem permissão passa só leitura ao ecrã da Emylia e diz-se (nunca inert)", () => {
    m.pode = { gravar: false, aLer: false, falhou: false, repetir: vi.fn() };
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "negocio")} />);
    expect(screen.getByTestId("fase-emylia").getAttribute("data-soleitura")).toBe("true");
    expect(screen.getByText("Só leitura")).toBeTruthy();
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("se a leitura das permissões falhou diz-se, não deixa gravar e deixa tentar outra vez", () => {
    m.pode = { gravar: false, aLer: false, falhou: true, repetir: vi.fn() };
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3)), "negocio")} />);
    expect(screen.getByText(/Não foi possível ler as permissões/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(m.pode.repetir).toHaveBeenCalled();
  });

  it("uma gravação que falhou mostra o erro e deixa tentar gravar outra vez", () => {
    const repetir = vi.fn();
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3), { gravacao: { k: "erro", t: "RLS recusou" } }), "negocio")} repetirGravacao={repetir} />);
    expect(screen.getByText(/Não gravou: RLS recusou/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar gravar outra vez" }));
    expect(repetir).toHaveBeenCalled();
  });

  it("mostra os avisos do motor: o mau como alerta, o normal como estado", () => {
    const avisos = [{ id: 1, msg: "Faltam campos", sub: "Preencha o orçamento", kind: "bad" as const }, { id: 2, msg: "Orçamento criado", kind: "ok" as const }];
    render(<NegocioEmyliaDoGuia {...props(lido(deal(3), { avisos }), "negocio")} />);
    expect(screen.getByRole("alert").textContent).toContain("Faltam campos");
    expect(screen.getByText("Orçamento criado").closest("[role='status']")).not.toBeNull();
  });

  it("enquanto o negócio passa de Visita a Negócio diz-o", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(2)), "negocio")} aPassar />);
    expect(screen.getByText("A passar o negócio para o Orçamento…")).toBeTruthy();
  });

  it("no Financeiro monta o ecrã da Emylia (os passos da fatura e do pagamento) e, por baixo, o painel (adendas, anular, histórico)", () => {
    render(<NegocioEmyliaDoGuia {...props(lido(deal(4)), "financeiro")} />);
    expect(screen.getByTestId("fase-emylia")).toBeTruthy();
    expect(screen.getByText("PAINEL-POS-CONTRATO")).toBeTruthy();
  });

  it("na Obra com plano monta o ecrã da Emylia; sem plano só o painel, que diz porquê", () => {
    const comPlano = deal(5);
    comPlano.obra.plano = { estado: "por aprovar", tasks: [], dia: 0, origem: "orcamento" } as unknown as NonNullable<Negocio["obra"]["plano"]>;
    const { unmount } = render(<NegocioEmyliaDoGuia {...props(lido(comPlano), "obra")} />);
    expect(screen.getByTestId("fase-emylia")).toBeTruthy();
    unmount();
    const semPlano = deal(5);
    semPlano.obra.plano = null;
    render(<NegocioEmyliaDoGuia {...props(lido(semPlano), "obra")} />);
    expect(screen.queryByTestId("fase-emylia")).toBeNull();
    expect(screen.getByText("PAINEL-POS-CONTRATO")).toBeTruthy();
  });

  it("uma fase feita abre em leitura (desligada mas visível) com o conteúdo dessa fase (Orçamento, Proposta, Contrato) e o caminho de volta", () => {
    const d = deal(4);
    d.orc = { enviada: "20/10", aceite: "21/10", contrato: "assinado", vendaDireta: false } as unknown as Negocio["orc"];
    const p = props(lido(d), "negocio", "financeiro");
    render(<NegocioEmyliaDoGuia {...p} />);
    for (const t of ["ORCAMENTO-LIDO", "PROPOSTA-LIDA", "CONTRATO-LIDO"]) expect(screen.getByText(t).closest("fieldset")?.disabled).toBe(true);
    expect(document.querySelector("[inert]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao passo atual" }));
    expect(p.aoVoltarAoAtual).toHaveBeenCalled();
  });

  it("as fases feitas (também as da abordagem) ficam escolhíveis na coluna, para ver o que aconteceu", () => {
    const p = props(lido(deal(4)), "financeiro");
    render(<NegocioEmyliaDoGuia {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    expect(p.aoVerFase).toHaveBeenCalledWith("contactado");
  });

  it("uma fase feita sem o documento na base diz que não há, em vez de rebentar", () => {
    const d = deal(4);
    d.orc = null;
    render(<NegocioEmyliaDoGuia {...props(lido(d), "negocio", "financeiro")} />);
    expect(screen.getByText("Sem proposta registada")).toBeTruthy();
  });
});

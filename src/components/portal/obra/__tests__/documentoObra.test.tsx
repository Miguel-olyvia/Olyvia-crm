// O documento da obra no portal (19/11/2026): com a vista do cliente, a proposta do template ganha os blocos da Emylia (01 O que
// vamos fazer, 02 Materiais, 04 Planeamento, 05 Pagamento, 06 Condições, 07 Aceitação) e o contrato as cláusulas e as adendas.
// Sem vista, nada aparece. Em inglês mudam só as palavras: o dinheiro é o mesmo.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { seed, totaisIva, type Estado, type Negocio } from "@/emylia/motor";
import { tranches } from "@/emylia/DocsCliente";
import { lerVista, vistaDoCliente } from "@/emylia/real/vistaCliente";
import { formatCurrency } from "@/lib/utils";
import { ProposalPortalDocument } from "@/components/proposals/ProposalPortalDocument";
import { cenarios } from "@/components/proposals/__tests__/ProposalPortalDocument.fixtures";
import { PT_BASELINE } from "@/components/proposals/__tests__/ProposalPortalDocument.pt-baseline";
import { contratoDaVista, propostaDaVista, type VistaDoPortal } from "../dadosObra";
import { DocumentoObra } from "../DocumentoObra";
import { ClausulasObra } from "../ClausulasObra";
import { momentoDaPrestacao } from "../textosObra";
import { traduzirEm } from "@/portal-i18n/traduzirEm";

afterEach(cleanup);
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

/** Um negócio do exemplo com orçamento de serviços, enviado ao cliente, e a vista como o portal a lê (ida e volta pelo JSON). */
function exemplo(muda?: (d: Negocio, S: Estado) => void): { S: Estado; d: Negocio; v: VistaDoPortal } {
  const S = seed();
  const d = S.deals.find((x) => x.orc?.linhas.some((l) => l.t === "svc"))!;
  const o = d.orc!;
  o.enviada = "01/11/2026"; o.aceite = null; o.contrato = null;
  d.f.pagamento = "50% + 25% no arranque + 25% no fim";
  d.f.garantia = "5 anos";
  muda?.(d, S);
  const v = lerVista(JSON.parse(JSON.stringify({ vista: vistaDoCliente(d, S), rececao: null, respostas: [] })))!;
  return { S, d, v };
}

describe("dados da obra a partir da vista", () => {
  it("sem vista ou sem orçamento: nada", () => {
    expect(propostaDaVista(null)).toBeNull();
    expect(contratoDaVista(undefined)).toBeNull();
    const { v } = exemplo();
    expect(propostaDaVista({ ...v, d: { ...v.d, orc: null } as Negocio })).toBeNull();
  });

  it("com vista: as fases, o pagamento (a soma fecha com o total) e as condições", () => {
    const { v, d, S } = exemplo();
    const P = propostaDaVista(v)!;
    expect(P.fases.length).toBeGreaterThan(0);
    expect(P.prestacoes.map((x) => x.p)).toEqual([0.5, 0.25, 0.25]);
    const soma = Math.round(P.prestacoes.reduce((a, x) => a + x.v, 0) * 100) / 100;
    expect(soma).toBe(Math.round(P.total * 100) / 100);
    expect(P.condicoes.garantia).toBe("5 anos");
    // os mesmos valores das prestações que a proposta da Emylia (DocsCliente) mostra para o mesmo negócio
    expect(P.prestacoes.map((x) => x.v)).toEqual(tranches(d, totaisIva(d, S).total, S).map((x) => x.v));
  });

  it("a validade do template manda sobre a calculada", () => {
    const { v } = exemplo();
    expect(propostaDaVista(v, { validaAte: "2026-12-24" })!.condicoes.validaAte.getDate()).toBe(24);
  });

  it("o estado real da proposta passa por cima da vista (aceite)", () => {
    const { v } = exemplo();
    expect(propostaDaVista(v, { docs: { proposta: "accepted" } })!.aceitacao.aceite).toBeTruthy();
    expect(propostaDaVista(v)!.aceitacao.aceite).toBeNull();
  });
});

describe("blocos da proposta (DocumentoObra)", () => {
  it("em português: os títulos e as palavras da Emylia, o dinheiro como no template", () => {
    const { v } = exemplo();
    const P = propostaDaVista(v)!;
    render(<DocumentoObra dados={P} />);
    for (const t of ["O que vamos fazer", "Pagamento", "Condições", "Aceitação"]) expect(screen.getByRole("heading", { name: new RegExp(t) })).toBeInTheDocument();
    expect(screen.getByText("Na adjudicação")).toBeInTheDocument();
    expect(screen.getAllByText(formatCurrency(P.prestacoes[0].v)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Garantia de 5 anos sobre a mão de obra/)).toBeInTheDocument();
  });

  it("em inglês: as palavras traduzidas e o dinheiro igual", () => {
    const { v } = exemplo();
    const P = propostaDaVista(v)!;
    render(<DocumentoObra dados={P} idioma="en" />);
    expect(screen.getByRole("heading", { name: /What we will do/ })).toBeInTheDocument();
    expect(screen.getByText("On award")).toBeInTheDocument();
    expect(screen.queryByText("Na adjudicação")).toBeNull();
    expect(screen.getAllByText(formatCurrency(P.prestacoes[0].v)).length).toBeGreaterThan(0);
    expect(screen.getByText(/5 years warranty on labour/)).toBeInTheDocument();
    // o nome da fase é um rótulo fixo do motor: traduz-se
    const fase = P.fases[0].fase;
    const nomes: Record<number, string> = { 1: "Preparatory works and demolition", 2: "Infrastructure (technical installations)", 3: "Coverings and base finishes", 4: "Final fitting and fine finishes" };
    expect(screen.getAllByText(new RegExp(nomes[fase].replace(/[()]/g, "\\$&"))).length).toBeGreaterThan(0);
  });

  it("uma prestação escrita à mão fica como vem; as do motor traduzem-se", () => {
    const { t } = traduzirEm("en");
    expect(momentoDaPrestacao(t, "Na retificação das medidas")).toBe("Na retificação das medidas");
    expect(momentoDaPrestacao(t, "No fim da fase 2 (infraestruturas)")).toBe("At the end of phase 2 (infrastructure)");
  });
});

describe("no documento do template (ProposalPortalDocument)", () => {
  it("sem os blocos: o português é o de sempre (a baseline)", () => {
    const { container } = render(<ProposalPortalDocument {...(cenarios.single as any)} />);
    expect(container.textContent).toBe(PT_BASELINE.single);
  });

  it("com os blocos: aparecem depois do orçamento e antes da decisão", () => {
    const { v } = exemplo();
    const P = propostaDaVista(v)!;
    const props = cenarios.single as any;
    render(<ProposalPortalDocument {...props} canActOnProposal mode="portal" documentoObra={<DocumentoObra dados={P} />} />);
    const obra = screen.getByTestId("documento-obra");
    const otp = screen.getByText("Verificação por SMS");
    expect(obra.compareDocumentPosition(otp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(obra).getByRole("heading", { name: /Planeamento/ })).toBeInTheDocument();
  });
});

describe("cláusulas do contrato (ClausulasObra)", () => {
  it("em português: as seis cláusulas do negócio com o preço e o pagamento", () => {
    const { v } = exemplo();
    const C = contratoDaVista(v, { proposta: "accepted", contrato: "pending_signature" })!;
    render(<ClausulasObra dados={C} />);
    for (const [i, t] of ["Objeto", "Preço", "Pagamento", "Prazo", "Garantia", "Condições gerais"].entries()) {
      expect(screen.getByRole("heading", { name: `Cláusula ${i + 1}.ª · ${t}` })).toBeInTheDocument();
    }
    expect(screen.getByText(new RegExp(`Total com IVA: ${formatCurrency(C.clausulas.T.total).replace(/[.$]/g, "\\$&")}`))).toBeInTheDocument();
    expect(screen.queryByText("Adendas ao contrato")).toBeNull();
  });

  it("em inglês: os títulos traduzidos e o dinheiro igual", () => {
    const { v } = exemplo();
    const C = contratoDaVista(v)!;
    render(<ClausulasObra dados={C} idioma="en" />);
    expect(screen.getByRole("heading", { name: "Clause 1 · Scope" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Total incl\\. VAT: ${formatCurrency(C.clausulas.T.total).replace(/[.$]/g, "\\$&")}`))).toBeInTheDocument();
  });

  it("uma cláusula revista pelo Jurídico mostra o texto escrito, com o selo", () => {
    const { v } = exemplo((d) => { d.orc!.clausulas = { Garantia: "Três anos sobre tudo." }; });
    render(<ClausulasObra dados={contratoDaVista(v)!} idioma="en" />);
    expect(screen.getByText("Três anos sobre tudo.")).toBeInTheDocument();
    expect(screen.getByText("revised")).toBeInTheDocument();
  });

  it("as adendas assinadas aparecem, com o valor do contrato com elas", () => {
    const { v } = exemplo((d) => {
      d.adendas = [{ n: "AD-1", estado: "assinada", criada: "02/11/2026", assinada: "05/11/2026", motivo: "Pedido do cliente",
        linhas: [{ sid: "x", n: "Tomada extra", q: 2, un: "un", pu: 40, h: 1, perfil: "eletricista" }] } as unknown as NonNullable<Negocio["adendas"]>[number]];
    });
    const C = contratoDaVista(v)!;
    expect(C.adendas?.adendas.map((a) => a.n)).toEqual(["AD-1"]);
    render(<ClausulasObra dados={C} />);
    expect(screen.getByText("Adendas ao contrato")).toBeInTheDocument();
    expect(screen.getByText("AD-1 · Tomada extra")).toBeInTheDocument();
    expect(screen.getByText("Assinada · 05/11/2026")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(C.adendas!.total))).toBeInTheDocument();
  });
});

// 23/11 (pedido do dono): o passo «Proposta» mostra o documento do template (o do portal), e não a folha da Emylia; os textos do template
// mandam, a Emylia preenche onde o template não escreve; as condições de pagamento do negócio entram nos termos ({{condicoes_pagamento}}).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seed, type Negocio } from "@/emylia/motor";
import { Partilhar } from "@/emylia/DocsCliente";
import type { TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { DocumentoDaPropostaNoPasso } from "./DocumentoDaPropostaNoPasso";
import { trocarFolhaDaProposta } from "./trocarFolhaDaProposta";

const propostaReal: { id: string | null } = { id: null };
const carregar = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/pessoas/useTemplatesDeDocumento", () => ({
  useDadosDaProposta: () => ({ data: propostaReal.id ? { id: propostaReal.id, numero: "P-2026-0035", data: "30/10/2026", criadaEm: "2026-10-30T10:00:00Z" } : null }),
}));
vi.mock("@/components/proposals/proposalPortalData", () => ({ loadProposalPortalData: (id: string) => carregar(id) }));

afterEach(cleanup);
beforeAll(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
beforeEach(() => { propostaReal.id = null; carregar.mockReset(); });

const TERMOS = "<p>Termos e condições</p><p>3. Condições de Pagamento: {{condicoes_pagamento}}</p>";
const tpl = (over: Partial<TemplateDeAspeto> = {}): TemplateDeAspeto => ({
  id: "t1", name: "Mudelar", description: null, is_default: true, logo_url: null, primary_color: "#24204a", secondary_color: null, accent_color: null,
  background_color: null, text_color: null, font_family: null, heading_font_family: null, header_text: null, footer_text: null,
  terms_conditions: TERMOS, thank_you_message: null, show_company_info: true, show_client_info: true, show_validity: true, show_terms: true,
  sections: [
    { id: "h", type: "header", visible: true, settings: { customTitle: "PROPOSTA", showLogo: false, showDate: true } },
    { id: "q", type: "quote_items", visible: true, settings: {} },
    { id: "t", type: "terms", visible: true, settings: { sectionLabel: "Condições Gerais" } },
  ],
  ...over,
});

/** Um negócio com o orçamento feito e «50% + 50% no fim». */
function negocio(): { d: Negocio; S: ReturnType<typeof seed> } {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.length > 0)!;
  d.f = { ...d.f, pagamento: "50% + 50% no fim" };
  return { d, S };
}

describe("o documento da proposta no passo", () => {
  it("sem a proposta real: o documento do template montado do negócio, com a carta, o 03 e as condições de pagamento nos termos", () => {
    const { d, S } = negocio();
    render(<DocumentoDaPropostaNoPasso negocioId="n1" d={d} S={S} tpl={tpl()} empresa={{ nome: "Mudelar", logo: null }} />);
    expect(screen.getByText(/Ainda não foi criada/)).toBeTruthy();
    // o número como a folha da Emylia (PR <ano>/<n.º do negócio>)
    expect(screen.getByText(new RegExp(`PR \\d{4}/${d.id}`))).toBeTruthy();
    // o template não tem cabeçalho: entra a carta da Emylia
    expect(screen.getByTestId("capa-obra")).toBeTruthy();
    expect(screen.getByText(/Esta proposta foi preparada a partir do levantamento feito no local/)).toBeTruthy();
    // 01 … 07 e o 03 da Emylia (sem orçamento do template)
    expect(screen.getByRole("heading", { name: /Orçamento detalhado/ })).toBeTruthy();
    expect(screen.getByText("IVA a 6% (mão de obra)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Pagamento/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Aceitação/ })).toBeTruthy();
    // os termos do template, com as prestações do negócio
    expect(screen.getByText("3. Condições de Pagamento: 50% - Adjudicação / 50% - Fim da obra")).toBeTruthy();
    expect(document.body.textContent).not.toContain("{{");
    expect(carregar).not.toHaveBeenCalled();
  });

  it("o cabeçalho escrito no template manda: sem a carta da Emylia", () => {
    const { d, S } = negocio();
    render(<DocumentoDaPropostaNoPasso negocioId="n1" d={d} S={S} tpl={tpl({ header_text: "<p>Caro cliente, eis a nossa proposta.</p>" })} empresa={{ nome: "Mudelar", logo: null }} />);
    expect(screen.getByText("Caro cliente, eis a nossa proposta.")).toBeTruthy();
    expect(screen.queryByTestId("capa-obra")).toBeNull();
  });

  it("com a proposta real: lê-a e mostra o documento dela (o template dela), com o número do negócio e o ano da proposta", async () => {
    const { d, S } = negocio();
    propostaReal.id = "p1";
    carregar.mockResolvedValue({
      proposal: { id: "p1", title: "Cozinha", proposal_number: "P-2027-0001", created_at: "2027-01-05T10:00:00Z", status: "sent", value: 1000, valid_until: "2027-02-05T10:00:00Z" },
      template: tpl({ terms_conditions: "<p>Pagamento: {{condicoes_pagamento}}</p>" }), quotes: [], quoteLines: {}, quoteFees: {}, commercial: { name: "Rita" }, company: { name: "Mudelar" },
      idiomasDoDocumento: ["pt"],
    });
    render(<DocumentoDaPropostaNoPasso negocioId="n1" d={d} S={S} tpl={null} empresa={{ nome: "Mudelar", logo: null }} />);
    expect(await screen.findByText(new RegExp(`PR 2027/${d.id}`))).toBeTruthy();
    expect(carregar).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Pagamento: 50% - Adjudicação / 50% - Fim da obra")).toBeTruthy();
    expect(screen.queryByText(/Ainda não foi criada/)).toBeNull();
    expect(screen.queryByText(/P-2027-0001/)).toBeNull();
  });
});

describe("trocarFolhaDaProposta", () => {
  it("troca a folha da proposta (Partilhar) dentro do corpo do passo e deixa o resto", () => {
    const { d, S } = negocio();
    const ctx = { S } as never;
    const corpo = (
      <div>
        <p>perguntas</p>
        <Partilhar ctx={ctx} d={d} tipo="proposta" estado="x"><span>FOLHA</span></Partilhar>
        <p>refazer</p>
      </div>
    );
    const r = trocarFolhaDaProposta(corpo, <span>DOCUMENTO</span>);
    expect(r.trocou).toBe(true);
    render(<>{r.corpo}</>);
    expect(screen.getByText("perguntas")).toBeTruthy();
    expect(screen.getByText("DOCUMENTO")).toBeTruthy();
    expect(screen.getByText("refazer")).toBeTruthy();
    expect(screen.queryByText("FOLHA")).toBeNull();
  });

  it("sem a folha, devolve o corpo como veio", () => {
    const corpo = <div><p>só perguntas</p></div>;
    const r = trocarFolhaDaProposta(corpo, <span>DOCUMENTO</span>);
    expect(r.trocou).toBe(false);
    expect(r.corpo).toBe(corpo);
  });
});

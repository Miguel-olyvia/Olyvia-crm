import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildContractPrintHtml, resolveContractDocument } from "../contractDocument";
import { computeFooterLayout } from "../contractPdfFooter";
import { gerarPdfDasVersoes, paginasDoDocumento, prepararHtmlParaPdf } from "../contractPdfPaginate";
import { comporCorpoDoContrato } from "@/lib/idiomaDocumento";
import { reporEstadoFalso } from "./fakeSupabase";

vi.mock("@/integrations/supabase/client", async () => {
  const { makeFakeSupabase } = await import("./fakeSupabase");
  return { supabase: makeFakeSupabase() };
});

// O encadeamento que o PDF faz: resolver -> buildContractPrintHtml -> prepararHtmlParaPdf -> .page -> jsPDF/html2pdf.
// Aqui prova-se tudo menos o html2canvas (PDF real), com o jsPDF e o html2pdf falsos.

const CORPO_PT = "<h2>CONTRATO</h2><p>Cliente {{cliente_nome}}.</p>";
const CORPO_EN = "<h2>SERVICES AGREEMENT</h2><p>Client {{cliente_nome}}.</p>";
const TEMPLATE = {
  language: "pt",
  body_html: CORPO_PT,
  doc_settings: {
    footer_text: "Rodapé português",
    versions: { en: { body_html: CORPO_EN, footer_text: "English footer|second line|third line", header: {} } },
  },
};

function contrato(corpo: string): Record<string, unknown> {
  return {
    id: "c-1", contract_number: "CC-1", created_at: "2026-03-13T12:00:00.000Z", entity_id: "e-1", status: "draft",
    contract_body_html: corpo, template_snapshot: TEMPLATE,
  };
}

async function resolver(corpo: string) {
  reporEstadoFalso({
    anew_organizations: { name: "Org", entity_id: null, metadata: {}, phone: null },
    organization_document_settings: { organization_id: "o-1", primary_color: "#112233" },
    anew_entities: { display_name: "Cliente" },
  });
  const r = await resolveContractDocument(contrato(corpo), "o-1", "Org");
  if (!r) throw new Error("sem documento");
  return r;
}

/** O que o código fazia antes das versões: parse, tirar scripts e rodapés, e o doctype à frente. */
function preparacaoDeAntes(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script").forEach((n) => n.remove());
  parsed.querySelectorAll(".footer").forEach((n) => n.remove());
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());

describe("do HTML de impressão ao documento do PDF", () => {
  it("uma versão: o HTML entregue ao html2pdf é igual ao de hoje", async () => {
    const r = await resolver(CORPO_PT);
    const impressao = buildContractPrintHtml(r as never, "Contrato");
    expect(prepararHtmlParaPdf(impressao)).toBe(preparacaoDeAntes(impressao));
    const doc = new DOMParser().parseFromString(prepararHtmlParaPdf(impressao), "text/html");
    expect(paginasDoDocumento(doc)).toHaveLength(1);
  });

  it("duas versões: uma .page por versão, sem wrappers olv-versao, sem rodapé nem scripts", async () => {
    const r = await resolver(comporCorpoDoContrato(TEMPLATE, "pt+en"));
    // o bodyHtml junto TEM os wrappers; as versões do resolver não
    expect(r.bodyHtml).toContain("olv-versao");
    const preparado = prepararHtmlParaPdf(buildContractPrintHtml(r as never, "Contrato"));
    expect(preparado).not.toContain("olv-versao");
    expect(preparado).not.toContain("<script");
    expect(preparado).not.toContain('class="footer"');
    expect(preparado).not.toContain("break-before");
    const paginas = paginasDoDocumento(new DOMParser().parseFromString(preparado, "text/html"));
    expect(paginas).toHaveLength(2);
    expect(paginas[0].textContent).toContain("CONTRATO");
    expect(paginas[1].textContent).toContain("SERVICES AGREEMENT");
  });

  it("um wrapper olv-versao que chegue ao documento desembrulha-se", () => {
    const html = `<!doctype html><html><body><div class="page"><div class="content"><div class="olv-versao olv-versao-en" style="break-before:page"><p>x</p></div></div></div></body></html>`;
    const saida = prepararHtmlParaPdf(html);
    expect(saida).not.toContain("olv-versao");
    expect(saida).toContain("<p>x</p>");
  });

  it("uma .page escrita no corpo do utilizador não conta como página do documento (M2)", () => {
    const html = `<!doctype html><html><body><div class="page" style="x:1"><div class="content"><div class="page" style="color:red"><p>do utilizador</p></div></div></div></body></html>`;
    const saida = prepararHtmlParaPdf(html);
    const doc = new DOMParser().parseFromString(saida, "text/html");
    expect(paginasDoDocumento(doc)).toHaveLength(1);
    // só o estilo da .page de topo é tirado: o do utilizador fica
    expect(saida).toContain('style="color:red"');
    expect(doc.querySelector("body > .page")?.getAttribute("style")).toBeNull();
  });
});

// ── a ligação grupos → layouts → margem e rodapé ────────────────────────────────────────────────

function fakeJsPdfClass() {
  const instancias: any[] = [];
  class FakeJsPdf {
    texts: Array<{ page: number; text: string }> = [];
    paginas = 1;
    atual = 1;
    opcoes: unknown;
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    constructor(opcoes: unknown) {
      this.opcoes = opcoes;
      instancias.push(this);
    }
    addPage = () => { this.paginas += 1; this.atual = this.paginas; };
    addImage = vi.fn();
    getNumberOfPages = () => this.paginas;
    setPage = (n: number) => { this.atual = n; };
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    setDrawColor = vi.fn();
    setLineWidth = vi.fn();
    line = vi.fn();
    text = (text: string) => { this.texts.push({ page: this.atual, text }); };
    splitTextToSize = (text: string) => text.split("|");
  }
  return { FakeJsPdf, instancias };
}

function fakeHtml2pdf(alturaPx: number) {
  const opcoesUsadas: any[] = [];
  const factory = () => {
    let opcoes: any;
    const cadeia: any = {
      set: (o: unknown) => { opcoes = o; opcoesUsadas.push(o); return cadeia; },
      from: () => ({
        toContainer: async () => {},
        toCanvas: async () => {},
        prop: {
          canvas: {
            width: 800, height: alturaPx,
            getContext: () => ({ getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }) }),
          },
          pageSize: { inner: { ratio: 1.414, width: 170 } },
        },
        opcoes,
      }),
    };
    return cadeia;
  };
  return { factory, opcoesUsadas };
}

describe("gerarPdfDasVersoes — a ligação entre versões, layouts e margens", () => {
  afterEach(() => vi.restoreAllMocks());
  const silenciar = () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
  };

  it("a margem inferior é o máximo entre os rodapés das versões e cada página leva o rodapé e a numeração da sua", async () => {
    silenciar();
    const { FakeJsPdf, instancias } = fakeJsPdfClass();
    const { factory, opcoesUsadas } = fakeHtml2pdf(1000);
    const base = { margin_bottom: 5, margin_top: 20, margin_left: 20, margin_right: 20, footer_text: "Rodapé português" };
    const versoes = [
      { codigo: "pt", settings: base },
      { codigo: "en", settings: { ...base, footer_text: "English footer|second line|third line" } },
    ];
    const pdf = await gerarPdfDasVersoes({
      pageElements: [document.createElement("div"), document.createElement("div")],
      versoes,
      settings: base,
      safeFileName: "contrato",
      jsPDF: FakeJsPdf as never,
      html2pdf: factory,
    });
    expect(pdf).toBe(instancias[0]);
    const medidor = new FakeJsPdf({});
    const reservaPt = computeFooterLayout(versoes[0].settings, medidor).reservedMm;
    const reservaEn = computeFooterLayout(versoes[1].settings, medidor).reservedMm;
    expect(reservaEn).toBeGreaterThan(reservaPt);
    // uma opção por versão, ambas com a margem do rodapé maior (em mm: [topo, direita, fundo, esquerda])
    expect(opcoesUsadas).toHaveLength(2);
    for (const o of opcoesUsadas) expect(o.margin[2]).toBeCloseTo(reservaEn, 6);
    // páginas: 1 (pt) e 2 (en), cada uma com o seu rodapé e a numeração no seu idioma
    expect(pdf.texts.filter((t: any) => t.text === "Rodapé português").map((t: any) => t.page)).toEqual([1]);
    expect(pdf.texts.filter((t: any) => t.text === "second line").map((t: any) => t.page)).toEqual([2]);
    expect(pdf.texts.filter((t: any) => /^(Página|Page) /.test(t.text)).map((t: any) => `${t.page}:${t.text}`)).toEqual(["1:Página 1 de 2", "2:Page 2 of 2"]);
  });

  it("uma só versão: a margem é a da base (ou a do rodapé, se maior) e a numeração é portuguesa", async () => {
    silenciar();
    const { FakeJsPdf } = fakeJsPdfClass();
    const { factory, opcoesUsadas } = fakeHtml2pdf(1000);
    const base = { margin_bottom: 40, margin_top: 20, margin_left: 20, margin_right: 20, footer_text: "R" };
    const pdf = await gerarPdfDasVersoes({
      pageElements: [document.createElement("div")],
      versoes: [{ codigo: "pt", settings: base }],
      settings: base,
      safeFileName: "contrato",
      jsPDF: FakeJsPdf as never,
      html2pdf: factory,
    });
    expect(opcoesUsadas[0].margin).toEqual([20, 20, 40, 20]);
    expect(opcoesUsadas[0].filename).toBe("contrato.pdf");
    expect(pdf.texts.filter((t: any) => /^(Página|Page) /.test(t.text)).map((t: any) => t.text)).toEqual(["Página 1 de 1"]);
  });

  it("menos versões do que páginas: as páginas a mais usam as definições da base e o idioma base", async () => {
    silenciar();
    const { FakeJsPdf } = fakeJsPdfClass();
    const { factory } = fakeHtml2pdf(1000);
    const base = { footer_text: "Base" };
    const pdf = await gerarPdfDasVersoes({
      pageElements: [document.createElement("div"), document.createElement("div")],
      versoes: [{ codigo: "en", settings: { footer_text: "EN" } }],
      settings: base,
      safeFileName: "x",
      jsPDF: FakeJsPdf as never,
      html2pdf: factory,
    });
    expect(pdf.texts.filter((t: any) => t.text === "Base").map((t: any) => t.page)).toEqual([2]);
    expect(pdf.texts.filter((t: any) => /^(Página|Page) /.test(t.text)).map((t: any) => t.text)).toEqual(["Page 1 of 2", "Página 2 de 2"]);
  });
});

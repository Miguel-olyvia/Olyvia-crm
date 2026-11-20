// RH: o PDF da proposta com a obra E versões de idioma. A obra vem uma só vez, no fim, depois de todas as passagens de
// idioma; o portal pede só a versão que o cliente está a ver, e a obra nesse idioma. Os orçamentos e a obra são
// simulados com um PDF de uma página cada (o aspeto real só se prova com um PDF a sério).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

const umaPagina = async () => {
  const d = await PDFDocument.create();
  d.addPage();
  return new Blob([(await d.save()) as BlobPart], { type: "application/pdf" });
};

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/quotePdfTemplate", () => ({
  fetchQuotePdfTemplateById: vi.fn(async () => null),
  fetchDefaultQuotePdfTemplate: vi.fn(async () => null),
  resolveProposalBrandingTemplate: vi.fn(async () => ({
    title: "PROPOSTA",
    design_settings: { versions: { en: { title: "PROPOSAL" } } },
  })),
  mergeProposalBranding: vi.fn((_a: unknown, b: unknown) => b),
}));
vi.mock("@/utils/generateQuotePdfBlob", () => ({
  generateQuotePdfBlob: vi.fn(async () => ({ blob: await umaPagina(), fileName: "q.pdf" })),
}));
vi.mock("@/utils/generateObraPdfBlob", () => ({ generateObraPdfBlob: vi.fn(async () => umaPagina()) }));

import { generateProposalPdfBlob, type ProposalPdfPrefetch } from "@/utils/generateProposalPdfBlob";
import { generateObraPdfBlob } from "@/utils/generateObraPdfBlob";
import { generateQuotePdfBlob } from "@/utils/generateQuotePdfBlob";
import type { PropostaObra } from "@/components/portal/obra/dadosObra";

const prefetch = (n: number): ProposalPdfPrefetch => ({
  proposal: { id: "p1", proposal_number: "P-1", title: "Proposta", organization_id: "org" },
  quotes: Array.from({ length: n }, (_, i) => ({ quote: { id: `q${i}`, quote_number: `Q-${i}` }, lines: [], fees: [] })),
});
const paginas = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
const dados = {} as PropostaObra;
const idiomasPedidos = () =>
  vi.mocked(generateQuotePdfBlob).mock.calls.map((c) => (c[1]?.documentContext as { idioma?: string } | undefined)?.idioma ?? "pt");

beforeEach(() => vi.clearAllMocks());

describe("generateProposalPdfBlob com a obra e idiomas", () => {
  it("só a versão inglesa (o que o portal pede): orçamentos em inglês e a obra no fim, uma vez", async () => {
    const { blob } = await generateProposalPdfBlob("p1", prefetch(2), { dados, idioma: "en" }, { idiomas: ["en"] });
    expect(await paginas(blob)).toBe(3);
    expect(idiomasPedidos()).toEqual(["en", "en"]);
    expect(generateObraPdfBlob).toHaveBeenCalledTimes(1);
    expect(generateObraPdfBlob).toHaveBeenCalledWith({ dados, idioma: "en" });
    const ordemObra = vi.mocked(generateObraPdfBlob).mock.invocationCallOrder[0];
    for (const o of vi.mocked(generateQuotePdfBlob).mock.invocationCallOrder) expect(o).toBeLessThan(ordemObra);
  });

  it("pt + en com obra: as duas passagens de orçamentos e a obra uma só vez, no fim", async () => {
    const { blob } = await generateProposalPdfBlob("p1", prefetch(1), { dados, idioma: "pt" }, { idiomas: ["pt", "en"] });
    expect(await paginas(blob)).toBe(3);
    expect(idiomasPedidos()).toEqual(["pt", "en"]);
    expect(generateObraPdfBlob).toHaveBeenCalledTimes(1);
  });

  it("sem opções: o que sempre foi (português), com a obra", async () => {
    const { blob } = await generateProposalPdfBlob("p1", prefetch(1), { dados, idioma: "pt" });
    expect(await paginas(blob)).toBe(2);
    expect(idiomasPedidos()).toEqual(["pt"]);
  });

  it("pt + en com uma passagem partida: erro claro e a obra nem se gera", async () => {
    vi.mocked(generateQuotePdfBlob).mockImplementationOnce(async () => ({ blob: await umaPagina(), fileName: "q.pdf" }));
    vi.mocked(generateQuotePdfBlob).mockImplementationOnce(async () => { throw new Error("partiu"); });
    const errConsola = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(generateProposalPdfBlob("p1", prefetch(1), { dados, idioma: "pt" }, { idiomas: ["pt", "en"] })).rejects.toThrow(
      /Não foi possível produzir a versão em/,
    );
    expect(generateObraPdfBlob).not.toHaveBeenCalled();
    errConsola.mockRestore();
  });
});

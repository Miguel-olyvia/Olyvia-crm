// O PDF da proposta com o conteúdo da obra (19/11/2026). Sem o parâmetro `obra`, o PDF é só o dos orçamentos, como sempre
// (e o gerador da obra nem é chamado); com ele (pt ou en), as páginas da obra vêm depois das dos orçamentos. Os orçamentos
// são simulados com um PDF de uma página por orçamento; a obra é desenhada a sério pelo react-pdf.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { propostaDaVista } from "@/components/portal/obra/dadosObra";
import { exemploObra } from "@/components/portal/obra/__tests__/obraFixture";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/quotePdfTemplate", () => ({
  fetchQuotePdfTemplateById: vi.fn(async () => null),
  fetchDefaultQuotePdfTemplate: vi.fn(async () => null),
  resolveProposalBrandingTemplate: vi.fn(async () => null),
  mergeProposalBranding: vi.fn((a: unknown) => a),
}));
vi.mock("@/utils/generateQuotePdfBlob", () => ({
  generateQuotePdfBlob: vi.fn(async () => {
    const d = await PDFDocument.create();
    d.addPage();
    const bytes = await d.save();
    return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), fileName: "q.pdf" };
  }),
}));
vi.mock("@/utils/generateObraPdfBlob", async (original) => {
  const real = await original<typeof import("@/utils/generateObraPdfBlob")>();
  return { generateObraPdfBlob: vi.fn(real.generateObraPdfBlob) };
});

import { generateProposalPdfBlob, type ProposalPdfPrefetch } from "@/utils/generateProposalPdfBlob";
import { generateObraPdfBlob } from "@/utils/generateObraPdfBlob";
import { generateQuotePdfBlob } from "@/utils/generateQuotePdfBlob";
import { captureFlowError } from "@/lib/observability/captureFlowError";

const prefetch = (n: number): ProposalPdfPrefetch => ({
  proposal: { id: "p1", proposal_number: "P-1", title: "Proposta", organization_id: "org" },
  quotes: Array.from({ length: n }, (_, i) => ({ quote: { id: `q${i}`, quote_number: `Q-${i}` }, lines: [], fees: [] })),
});

const paginas = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();

beforeEach(() => vi.clearAllMocks());

describe("generateProposalPdfBlob com a obra", () => {
  it("sem o parâmetro: só os orçamentos, e o gerador da obra não é chamado", async () => {
    const { blob, fileName } = await generateProposalPdfBlob("p1", prefetch(1));
    expect(await paginas(blob)).toBe(1);
    expect(fileName).toMatch(/^Proposta_P-1_/);
    expect(generateObraPdfBlob).not.toHaveBeenCalled();
  });

  it("com obra null: o mesmo de sempre", async () => {
    const { blob } = await generateProposalPdfBlob("p1", prefetch(2), null);
    expect(await paginas(blob)).toBe(2);
    expect(generateObraPdfBlob).not.toHaveBeenCalled();
  });

  it.each(["pt", "en"] as const)("com a obra em %s: as páginas da obra vêm depois das dos orçamentos", async (idioma) => {
    const dados = propostaDaVista(exemploObra().v)!;
    const obra = await generateObraPdfBlob({ dados, idioma });
    const daObra = await paginas(obra);
    vi.mocked(generateObraPdfBlob).mockClear();
    const { blob } = await generateProposalPdfBlob("p1", prefetch(2), { dados, idioma, cor: "#123456" });
    expect(await paginas(blob)).toBe(2 + daObra);
    expect(generateObraPdfBlob).toHaveBeenCalledWith({ dados, idioma, cor: "#123456" });
    // a obra é desenhada depois de todos os orçamentos
    const ordemObra = vi.mocked(generateObraPdfBlob).mock.invocationCallOrder[0];
    for (const o of vi.mocked(generateQuotePdfBlob).mock.invocationCallOrder) expect(o).toBeLessThan(ordemObra);
  }, 30000);

  it("se a obra falhar, a proposta sai com os orçamentos e o erro fica registado", async () => {
    vi.mocked(generateObraPdfBlob).mockRejectedValueOnce(new Error("partiu"));
    const errConsola = vi.spyOn(console, "error").mockImplementation(() => {});
    const dados = propostaDaVista(exemploObra().v)!;
    const { blob } = await generateProposalPdfBlob("p1", prefetch(1), { dados, idioma: "pt" });
    expect(await paginas(blob)).toBe(1);
    expect(captureFlowError).toHaveBeenCalledWith(expect.any(Error), "proposal-document-export");
    errConsola.mockRestore();
  });

  it("sem páginas de orçamento: o erro de sempre, e a obra não se gera sozinha", async () => {
    vi.mocked(generateQuotePdfBlob).mockRejectedValueOnce(new Error("orçamento partido"));
    const errConsola = vi.spyOn(console, "error").mockImplementation(() => {});
    const dados = propostaDaVista(exemploObra().v)!;
    await expect(generateProposalPdfBlob("p1", prefetch(1), { dados, idioma: "pt" })).rejects.toThrow("Não foi possível produzir o documento desta proposta.");
    expect(generateObraPdfBlob).not.toHaveBeenCalled();
    errConsola.mockRestore();
  });
});

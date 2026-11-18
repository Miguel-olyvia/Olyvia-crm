// O PDF descarregado no CRM (sem dados pré-carregados) lê a proposta da base: o select tem de pedir `language`,
// senão o idioma gravado nunca chega ao gerador. O mock responde como o PostgREST: SÓ devolve as colunas pedidas.
// Proposta sem idioma gravado (ou só português) = exatamente como hoje. Nada vai à rede.
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { gerarOrcamento, selecoes, linha } = vi.hoisted(() => ({
  gerarOrcamento: vi.fn(),
  selecoes: [] as string[],
  linha: { valor: {} as Record<string, unknown> },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const b: any = {};
      b.select = (colunas: string) => {
        if (tabela === "proposals") selecoes.push(colunas);
        b.colunas = colunas;
        return b;
      };
      b.eq = () => b;
      b.in = () => b;
      b.not = () => b;
      b.order = () => Promise.resolve({ data: [{ id: "q1", quote_number: "Q-1", template_id: null, created_at: "2026-03-01T10:00:00Z" }], error: null });
      b.maybeSingle = () => {
        const pedidas = String(b.colunas).split(",").map((c) => c.trim());
        const data = Object.fromEntries(Object.entries(linha.valor).filter(([k]) => pedidas.includes(k)));
        return Promise.resolve({ data, error: null });
      };
      return b;
    },
  },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/generateQuotePdfBlob", () => ({ generateQuotePdfBlob: (...a: unknown[]) => gerarOrcamento(...a) }));
vi.mock("@/utils/quotePdfTemplate", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/quotePdfTemplate")>();
  return {
    ...real,
    fetchQuotePdfTemplateById: async () => null,
    fetchDefaultQuotePdfTemplate: async () => real.normalizeQuotePdfTemplate({ id: "estr", footer_text: "Estrutural pt", sections: [], design_settings: {} } as never),
    resolveProposalBrandingTemplate: async (p: { template_snapshot?: unknown } | null) =>
      p?.template_snapshot ? real.normalizeQuotePdfTemplate(p.template_snapshot as never) : null,
  };
});

import { generateProposalPdfBlob } from "../generateProposalPdfBlob";

async function paginaVazia(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { arrayBuffer: async () => ab } as unknown as Blob;
}

const SNAPSHOT_COM_EN = {
  primary_color: "#112233",
  footer_text: "Rodapé pt",
  sections: [],
  design_settings: { versions: { en: { footer_text: "Footer en" } } },
};

const idiomasGerados = (): Array<string> =>
  gerarOrcamento.mock.calls.map(([, opts]) => (opts as any).documentContext.idioma ?? "pt");

beforeEach(() => {
  selecoes.length = 0;
  gerarOrcamento.mockReset();
  gerarOrcamento.mockImplementation(async () => ({ blob: await paginaVazia(), fileName: "x.pdf" }));
  linha.valor = {
    id: "p1", proposal_number: "P-1", title: "Remodelação", template_id: null, organization_id: "o1",
    template_snapshot: SNAPSHOT_COM_EN,
  };
});

describe("PDF no CRM: o idioma gravado na proposta", () => {
  it("o select da proposta pede a coluna language", async () => {
    await generateProposalPdfBlob("p1");
    expect(selecoes[0]).toMatch(/\blanguage\b/);
  });

  it("proposta com language 'pt+en': o PDF leva o português e depois o inglês", async () => {
    linha.valor = { ...linha.valor, language: "pt+en" };
    await generateProposalPdfBlob("p1");
    expect(idiomasGerados()).toEqual(["pt", "en"]);
  });

  it("proposta com language 'en': só inglês", async () => {
    linha.valor = { ...linha.valor, language: "en" };
    await generateProposalPdfBlob("p1");
    expect(idiomasGerados()).toEqual(["en"]);
  });

  it("proposta sem idioma gravado (language nulo ou em falta): um PDF em português, sem `idioma` no contexto", async () => {
    await generateProposalPdfBlob("p1");
    linha.valor = { ...linha.valor, language: null };
    await generateProposalPdfBlob("p1");
    const contextos = gerarOrcamento.mock.calls.map(([, opts]) => (opts as any).documentContext);
    expect(contextos).toHaveLength(2);
    for (const c of contextos) expect("idioma" in c).toBe(false);
  });

  it("a escolha explícita (opcoes.idiomas) continua a mandar sobre o gravado", async () => {
    linha.valor = { ...linha.valor, language: "pt+en" };
    await generateProposalPdfBlob("p1", undefined, { idiomas: ["pt"] });
    expect(idiomasGerados()).toEqual(["pt"]);
  });

  it("language gravado num idioma que o modelo não tem: cai no português", async () => {
    linha.valor = { ...linha.valor, language: "en", template_snapshot: { ...SNAPSHOT_COM_EN, design_settings: {} } };
    await generateProposalPdfBlob("p1");
    expect(idiomasGerados()).toEqual(["pt"]);
  });
});

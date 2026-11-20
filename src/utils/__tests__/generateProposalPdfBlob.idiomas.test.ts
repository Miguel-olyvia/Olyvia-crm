// generateProposalPdfBlob com versões de idioma: itera idiomas × orçamentos, aplica aplicarVersaoProposta ao
// modelo explícito e ao estrutural (o merge recebe modelos já resolvidos) e junta tudo com pdf-lib. Um só idioma
// (ou nenhum pedido) é igual a antes. O PDF real não se gera aqui: o gerador de cada orçamento está simulado e
// devolve uma página vazia, por isso o que se prova é a orquestração, não o aspeto das páginas.
// RH: o 3.º argumento é a obra (null aqui); as opções de idioma vêm em 4.º.
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { gerarOrcamento, fetchPorId, fetchPorOmissao } = vi.hoisted(() => ({
  gerarOrcamento: vi.fn(),
  fetchPorId: vi.fn(),
  fetchPorOmissao: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { throw new Error("sem rede"); } } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/generateQuotePdfBlob", () => ({ generateQuotePdfBlob: (...a: unknown[]) => gerarOrcamento(...a) }));
vi.mock("@/utils/quotePdfTemplate", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/quotePdfTemplate")>();
  return {
    ...real,
    fetchQuotePdfTemplateById: (...a: unknown[]) => fetchPorId(...a),
    fetchDefaultQuotePdfTemplate: (...a: unknown[]) => fetchPorOmissao(...a),
    resolveProposalBrandingTemplate: async (p: { template_snapshot?: unknown } | null) =>
      p?.template_snapshot ? real.normalizeQuotePdfTemplate(p.template_snapshot as never) : null,
  };
});

import { generateProposalPdfBlob, type ProposalPdfPrefetch } from "../generateProposalPdfBlob";
import { mergeProposalBranding, normalizeQuotePdfTemplate } from "../quotePdfTemplate";

async function paginaVazia(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // O Blob do jsdom não tem arrayBuffer(): o que o gerador lê é só isto.
  return { arrayBuffer: async () => ab } as unknown as Blob;
}

function lerBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}
const paginas = async (blob: Blob) => (await PDFDocument.load(await lerBytes(blob))).getPageCount();

const modeloProposta = (extra: Record<string, unknown> = {}) => ({
  primary_color: "#112233",
  footer_text: "Rodapé pt",
  terms_conditions: "Termos pt",
  thank_you_message: "Obrigado",
  sections: [
    { id: "h", type: "header", visible: true, settings: { customTitle: "PROPOSTA" } },
    { id: "t", type: "terms", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
  ],
  design_settings: {
    versions: {
      en: {
        footer_text: "Footer en",
        terms_conditions: "Terms en",
        thank_you_message: "Thank you",
        sections: { h: { customTitle: "PROPOSAL" }, t: { sectionLabel: "GENERAL TERMS" } },
      },
    },
  },
  ...extra,
});

const modeloEstrutural = (extra: Record<string, unknown> = {}) => ({
  id: "estr",
  primary_color: "#000000",
  footer_text: "Estrutural pt",
  sections: [
    { id: "h", type: "header", visible: true, settings: { customTitle: "ORÇAMENTO" } },
    { id: "qi", type: "quote_items", visible: true, settings: { sectionLabel: "DETALHES DO ORÇAMENTO" } },
  ],
  design_settings: {},
  ...extra,
});

function prefetch(snapshot: unknown, nQuotes = 2, extraProposta: Record<string, unknown> = {}): ProposalPdfPrefetch {
  return {
    proposal: { id: "p1", proposal_number: "P-1", title: "Remodelação", template_snapshot: snapshot, organization_id: "o1", ...extraProposta },
    quotes: Array.from({ length: nQuotes }, (_, i) => ({
      quote: { id: `q${i + 1}`, quote_number: `Q-${i + 1}`, template_id: null, created_at: `2026-03-0${i + 1}T10:00:00Z` },
      lines: [], fees: [],
    })),
  };
}

const chamadas = (): Array<Record<string, any>> =>
  gerarOrcamento.mock.calls.map(([id, opts]) => ({ id: id as string, ...(opts as Record<string, any>) }));

beforeEach(() => {
  gerarOrcamento.mockReset();
  gerarOrcamento.mockImplementation(async () => ({ blob: await paginaVazia(), fileName: "x.pdf" }));
  fetchPorId.mockReset();
  fetchPorId.mockResolvedValue(null);
  fetchPorOmissao.mockReset();
  fetchPorOmissao.mockResolvedValue(normalizeQuotePdfTemplate(modeloEstrutural() as never));
});

describe("um só idioma: igual a antes", () => {
  it("sem opções: um PDF por orçamento, sem `idioma` no contexto, com o modelo fundido como sempre", async () => {
    const snapshot = modeloProposta();
    const { blob, fileName } = await generateProposalPdfBlob("p1", prefetch(snapshot));
    const c = chamadas();
    expect(c.map((x) => x.id)).toEqual(["q1", "q2"]);
    const esperado = mergeProposalBranding(normalizeQuotePdfTemplate(modeloEstrutural() as never), normalizeQuotePdfTemplate(snapshot as never));
    for (const x of c) {
      expect(x.templateOverride).toEqual(esperado);
      expect(x.documentContext).toEqual({ kind: "proposal", number: "P-1", title: "Remodelação" });
      expect("idioma" in x.documentContext).toBe(false);
    }
    expect(c[0].hideTotals).toBe(true);
    expect(c[1].hideTotals).toBe(false);
    expect(c[1].totalsOverride).toBeTruthy();
    expect(await paginas(blob)).toBe(2);
    expect(fileName).toMatch(/^Proposta_P-1_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("idiomas ['pt'] é o mesmo que sem opções", async () => {
    await generateProposalPdfBlob("p1", prefetch(modeloProposta()), null, { idiomas: ["pt"] });
    const a = JSON.stringify(chamadas());
    gerarOrcamento.mockClear();
    await generateProposalPdfBlob("p1", prefetch(modeloProposta()));
    expect(JSON.stringify(chamadas())).toBe(a);
  });

  it("modelo sem versões: o pedido pt+en dá só o português (não há outra versão para gerar)", async () => {
    const { blob } = await generateProposalPdfBlob("p1", prefetch(modeloProposta({ design_settings: {} })), null, { idiomas: ["pt", "en"] });
    expect(chamadas().length).toBe(2);
    expect(await paginas(blob)).toBe(2);
  });

  it("sem modelo da proposta: usa o modelo de orçamento por omissão e só o português", async () => {
    await generateProposalPdfBlob("p1", prefetch(null, 1), null, { idiomas: ["en"] });
    const [x] = chamadas();
    expect(x.templateOverride.footer_text).toBe("Estrutural pt");
    expect("idioma" in x.documentContext).toBe(false);
  });
});

describe("pt + en", () => {
  it("itera idiomas × orçamentos: todo o português primeiro, depois todo o inglês", async () => {
    const { blob, fileName } = await generateProposalPdfBlob("p1", prefetch(modeloProposta()), null, { idiomas: ["pt", "en"] });
    const c = chamadas();
    expect(c.map((x) => [x.id, x.documentContext.idioma ?? "pt"])).toEqual([
      ["q1", "pt"], ["q2", "pt"], ["q1", "en"], ["q2", "en"],
    ]);
    expect(await paginas(blob)).toBe(4);
    expect(fileName).toMatch(/^Proposta_P-1_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("cada versão recebe o modelo resolvido: textos, título e rótulos de secção do idioma", async () => {
    await generateProposalPdfBlob("p1", prefetch(modeloProposta(), 1), null, { idiomas: ["pt", "en"] });
    const [pt, en] = chamadas();
    expect(pt.templateOverride.footer_text).toBe("Rodapé pt");
    expect(pt.templateOverride.sections.find((s: any) => s.type === "header").settings.customTitle).toBe("PROPOSTA");
    expect(en.templateOverride.footer_text).toBe("Footer en");
    expect(en.templateOverride.terms_conditions).toBe("Terms en");
    expect(en.templateOverride.thank_you_message).toBe("Thank you");
    expect(en.templateOverride.sections.find((s: any) => s.type === "header").settings.customTitle).toBe("PROPOSAL");
    expect(en.documentContext).toEqual({ kind: "proposal", number: "P-1", title: "Remodelação", idioma: "en" });
  });

  it("o modelo estrutural também ganha a sua versão", async () => {
    fetchPorId.mockResolvedValue(normalizeQuotePdfTemplate(modeloEstrutural({
      design_settings: { versions: { en: { sections: { qi: { sectionLabel: "QUOTE ITEMS" } } } } },
    }) as never));
    const p = prefetch(modeloProposta(), 1);
    p.quotes[0].quote.template_id = "estr";
    await generateProposalPdfBlob("p1", p, null, { idiomas: ["pt", "en"] });
    const [pt, en] = chamadas();
    const rotulo = (x: any) => x.templateOverride.sections.find((s: any) => s.type === "quote_items").settings.sectionLabel;
    expect(rotulo(pt)).toBe("DETALHES DO ORÇAMENTO");
    expect(rotulo(en)).toBe("QUOTE ITEMS");
  });

  it("os totais agregados saem em cada versão, no último orçamento dessa versão", async () => {
    await generateProposalPdfBlob("p1", prefetch(modeloProposta()), null, { idiomas: ["pt", "en"] });
    expect(chamadas().map((x) => [x.hideTotals, Boolean(x.totalsOverride)])).toEqual([
      [true, false], [false, true], [true, false], [false, true],
    ]);
  });

  it("só inglês: um PDF por orçamento, em inglês", async () => {
    const { blob } = await generateProposalPdfBlob("p1", prefetch(modeloProposta()), null, { idiomas: ["en"] });
    expect(chamadas().map((x) => x.documentContext.idioma)).toEqual(["en", "en"]);
    expect(await paginas(blob)).toBe(2);
  });

  it("não altera os modelos recebidos (imutável)", async () => {
    const snapshot = modeloProposta();
    const antes = JSON.stringify(snapshot);
    await generateProposalPdfBlob("p1", prefetch(snapshot), null, { idiomas: ["pt", "en"] });
    expect(JSON.stringify(snapshot)).toBe(antes);
  });

  it("sem opções, a escolha gravada na proposta (prompt_values.__idiomas) é lida pela porta única", async () => {
    await generateProposalPdfBlob("p1", prefetch(modeloProposta(), 1, { prompt_values: { __idiomas: "pt+en" } }));
    expect(chamadas().map((x) => x.documentContext.idioma ?? "pt")).toEqual(["pt", "en"]);
  });

  it("um só idioma: um orçamento que falha não leva os outros atrás (como sempre)", async () => {
    gerarOrcamento.mockImplementation(async (id: string) => {
      if (id === "q2") throw new Error("falhou");
      return { blob: await paginaVazia(), fileName: "x.pdf" };
    });
    const { blob } = await generateProposalPdfBlob("p1", prefetch(modeloProposta(), 2), null, { idiomas: ["pt"] });
    expect(await paginas(blob)).toBe(1);
  });

  it("pt + en: se a passagem inglesa falha por completo, não sai um PDF só em português: erro claro", async () => {
    gerarOrcamento.mockImplementation(async (_id: string, opts: any) => {
      if (opts.documentContext.idioma === "en") throw new Error("falhou");
      return { blob: await paginaVazia(), fileName: "x.pdf" };
    });
    await expect(generateProposalPdfBlob("p1", prefetch(modeloProposta(), 2), null, { idiomas: ["pt", "en"] })).rejects.toThrow(
      /versão em English/,
    );
  });

  it("pt + en: a passagem portuguesa a falhar também não passa em silêncio", async () => {
    gerarOrcamento.mockImplementation(async (_id: string, opts: any) => {
      if (!opts.documentContext.idioma) throw new Error("falhou");
      return { blob: await paginaVazia(), fileName: "x.pdf" };
    });
    await expect(generateProposalPdfBlob("p1", prefetch(modeloProposta(), 1), null, { idiomas: ["pt", "en"] })).rejects.toThrow(
      /versão em Português/,
    );
  });

  it("pt + en: um orçamento que falha só numa das passagens também dá erro (a versão ficaria incompleta)", async () => {
    gerarOrcamento.mockImplementation(async (id: string, opts: any) => {
      if (id === "q2" && opts.documentContext.idioma === "en") throw new Error("falhou");
      return { blob: await paginaVazia(), fileName: "x.pdf" };
    });
    await expect(generateProposalPdfBlob("p1", prefetch(modeloProposta(), 2), null, { idiomas: ["pt", "en"] })).rejects.toThrow(
      /versão em English/,
    );
  });

  it("pt + en: se a falha foi carregar o gerador (página desatualizada), a mensagem é a de recarregar", async () => {
    gerarOrcamento.mockImplementation(async (_id: string, opts: any) => {
      if (opts.documentContext.idioma === "en") throw new Error("Failed to fetch dynamically imported module: x");
      return { blob: await paginaVazia(), fileName: "x.pdf" };
    });
    await expect(generateProposalPdfBlob("p1", prefetch(modeloProposta(), 1), null, { idiomas: ["pt", "en"] })).rejects.toThrow(
      "Há uma versão nova da aplicação.",
    );
  });

  it("o modelo do orçamento é lido uma só vez por modelo, e não por orçamento e por idioma", async () => {
    fetchPorId.mockResolvedValue(normalizeQuotePdfTemplate(modeloEstrutural() as never));
    const p = prefetch(modeloProposta(), 3);
    p.quotes[0].quote.template_id = "estr";
    p.quotes[1].quote.template_id = "estr";
    p.quotes[2].quote.template_id = "outro";
    await generateProposalPdfBlob("p1", p, null, { idiomas: ["pt", "en"] });
    expect(gerarOrcamento).toHaveBeenCalledTimes(6);
    expect(fetchPorId.mock.calls.map((c) => c[0]).sort()).toEqual(["estr", "outro"]);
  });

  it("sem modelos próprios nos orçamentos não se consulta nada", async () => {
    await generateProposalPdfBlob("p1", prefetch(modeloProposta(), 2), null, { idiomas: ["pt", "en"] });
    expect(fetchPorId).not.toHaveBeenCalled();
  });

  it("se nada foi produzido, o erro de sempre", async () => {
    gerarOrcamento.mockRejectedValue(new Error("falhou"));
    await expect(generateProposalPdfBlob("p1", prefetch(modeloProposta(), 1), null, { idiomas: ["pt", "en"] })).rejects.toThrow(
      "Não foi possível produzir o documento desta proposta.",
    );
  });
});

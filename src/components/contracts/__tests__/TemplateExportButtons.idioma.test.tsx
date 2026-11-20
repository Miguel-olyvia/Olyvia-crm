import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useDocumentSettings", () => ({ useDocumentSettings: () => ({ settings: null }) }));

import { buildPdfRenderContainer, textoDePaginaDoPdf } from "../TemplateExportButtons";

const DADOS = {
  empresa_nome: "Mudelar",
  empresa_nif: "514234567",
  contrato_numero: "CC-2026-0003",
  contrato_data_inicio: "2026-03-13",
  cliente_nome: "Ana Silva",
};
const CORPO = "<p>Início: {{contrato_data_inicio}} — {{cliente_nome}} — {{cliente_nif}}</p>";
const DS = { header_style: "split" };

describe("exportação do template: idioma", () => {
  it("em português é o de sempre (sem idioma e com «pt» dá o mesmo)", () => {
    const sem = buildPdfRenderContainer({ bodyHtml: CORPO, ds: DS, sampleData: DADOS });
    const pt = buildPdfRenderContainer({ bodyHtml: CORPO, ds: DS, sampleData: DADOS, idioma: "pt" });
    expect(sem.innerHTML).toBe(pt.innerHTML);
    expect(pt.innerHTML).toContain("13 de Março de 2026");
    expect(pt.innerHTML).toContain(">CONTRATO<");
    expect(pt.innerHTML).toContain("NIF: 514234567");
  });

  it("com «en» o cabeçalho, as datas e os campos em falta saem em inglês; os valores não mudam", () => {
    const en = buildPdfRenderContainer({ bodyHtml: CORPO, ds: DS, sampleData: DADOS, idioma: "en" });
    expect(en.innerHTML).toContain(">CONTRACT<");
    expect(en.innerHTML).toContain(">CONTRACT No.<");
    expect(en.innerHTML).toContain("Tax ID: 514234567");
    expect(en.innerHTML).toContain("13 March 2026");
    expect(en.innerHTML).toContain("Ana Silva");
    expect(en.innerHTML).toContain("CC-2026-0003");
    expect(en.innerHTML).not.toContain("CONTRATO");
    expect(en.innerHTML).not.toContain("de Março");
    expect(en.innerHTML).not.toContain("NIF:");
  });

  it("a numeração das páginas segue o idioma: «Página 1 de 3» / «Page 1 of 3»", () => {
    expect(textoDePaginaDoPdf(undefined, 1, 3)).toBe("Página 1 de 3");
    expect(textoDePaginaDoPdf("pt", 2, 3)).toBe("Página 2 de 3");
    expect(textoDePaginaDoPdf("en", 1, 3)).toBe("Page 1 of 3");
    expect(textoDePaginaDoPdf("en", 3, 3)).toBe("Page 3 of 3");
  });
});

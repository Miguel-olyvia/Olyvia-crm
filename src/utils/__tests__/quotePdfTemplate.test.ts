import { describe, it, expect, vi, beforeEach } from "vitest";

// O cliente é simulado: estes testes não tocam na base. O que interessa medir é
// QUANDO é que o modelo vivo chega a ser consultado — e o duplo `maybeSingle`
// conta isso.
const maybeSingle = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  },
}));

import { resolveProposalBrandingTemplate, normalizeQuotePdfTemplate } from "@/utils/quotePdfTemplate";

const MODELO_VIVO = {
  id: "tpl-vivo",
  primary_color: "#00FF00",
  footer_text: "rodapé de hoje",
  sections: [],
  design_settings: {},
};

const COPIA_CONGELADA = {
  id: "tpl-vivo",
  primary_color: "#FF0000",
  footer_text: "rodapé de quando foi enviada",
  sections: [],
  design_settings: {},
};

describe("resolveProposalBrandingTemplate", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: MODELO_VIVO, error: null });
  });

  it("uma proposta com o desenho congelado sai sempre igual, mesmo depois de o modelo ser editado", async () => {
    const resolvido = await resolveProposalBrandingTemplate({
      template_id: "tpl-vivo",
      template_snapshot: COPIA_CONGELADA,
    });

    expect(resolvido?.footer_text).toBe("rodapé de quando foi enviada");
    expect(resolvido?.primary_color).toBe("#FF0000");
  });

  it("havendo cópia congelada, o modelo partilhado nem chega a ser lido", async () => {
    await resolveProposalBrandingTemplate({
      template_id: "tpl-vivo",
      template_snapshot: COPIA_CONGELADA,
    });

    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("sem cópia congelada cai no modelo vivo — as propostas anteriores ao congelamento continuam a sair", async () => {
    const resolvido = await resolveProposalBrandingTemplate({
      template_id: "tpl-vivo",
      template_snapshot: null,
    });

    expect(maybeSingle).toHaveBeenCalled();
    expect(resolvido?.footer_text).toBe("rodapé de hoje");
  });

  it("sem modelo nenhum não devolve modelo nenhum, e não vai à base", async () => {
    const resolvido = await resolveProposalBrandingTemplate({
      template_id: null,
      template_snapshot: null,
    });

    expect(resolvido).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("a cópia congelada passa pela mesma normalização do modelo vivo", async () => {
    // design_settings sobrepõe-se às colunas, e sections tem de sair sempre
    // como lista — é o que o resto do gerador do PDF assume.
    const resolvido = await resolveProposalBrandingTemplate({
      template_id: "tpl-vivo",
      template_snapshot: {
        ...COPIA_CONGELADA,
        sections: null,
        design_settings: { primary_color: "#0000FF" },
      },
    });

    expect(resolvido?.primary_color).toBe("#0000FF");
    expect(resolvido?.sections).toEqual([]);
  });

  it("uma proposta sem linha nenhuma não rebenta", async () => {
    await expect(resolveProposalBrandingTemplate(null)).resolves.toBeNull();
    await expect(resolveProposalBrandingTemplate(undefined)).resolves.toBeNull();
  });
});

describe("normalizeQuotePdfTemplate", () => {
  it("não inventa um modelo quando não há nenhum", () => {
    expect(normalizeQuotePdfTemplate(null)).toBeNull();
  });
});

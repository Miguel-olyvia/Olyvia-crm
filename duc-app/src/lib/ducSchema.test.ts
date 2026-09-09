import { describe, it, expect } from "vitest";
import {
  variantForOrgName,
  fieldsForVariant,
  sectionsForVariant,
  stageAppliesToVariant,
  missingRequiredFields,
  DUC_STAGES,
  VARIANT_LABELS,
  STATUS_LABELS,
  CHANGE_LOG_COLUMNS,
  type DucStage,
  type DucField,
} from "./ducSchema";
import type { DucVariant } from "./types";

describe("variantForOrgName", () => {
  it("mapeia nomes com 'mudelar' para mudelar_obra", () => {
    expect(variantForOrgName("Mudelar")).toBe("mudelar_obra");
    expect(variantForOrgName("Grupo MUDELAR Lda")).toBe("mudelar_obra");
    expect(variantForOrgName("mudelar")).toBe("mudelar_obra");
  });

  it("mapeia nomes com 'bmg' para bmg_contrato", () => {
    expect(variantForOrgName("BMG")).toBe("bmg_contrato");
    expect(variantForOrgName("bmg contrato")).toBe("bmg_contrato");
    expect(variantForOrgName("Something BMG Group")).toBe("bmg_contrato");
  });

  it("é case-insensitive", () => {
    expect(variantForOrgName("MuDeLaR")).toBe("mudelar_obra");
    expect(variantForOrgName("bMg")).toBe("bmg_contrato");
  });

  it("devolve universal para nomes não reconhecidos", () => {
    expect(variantForOrgName("Acme")).toBe("universal");
    expect(variantForOrgName("Olyvia")).toBe("universal");
    expect(variantForOrgName("")).toBe("universal");
  });

  it("é null-safe (null / undefined → universal)", () => {
    expect(variantForOrgName(null)).toBe("universal");
    expect(variantForOrgName(undefined)).toBe("universal");
  });

  it("dá prioridade a mudelar quando ambos os tokens estão presentes", () => {
    // mudelar é verificado antes de bmg na implementação
    expect(variantForOrgName("mudelar bmg")).toBe("mudelar_obra");
  });
});

describe("fieldsForVariant", () => {
  const fields: DucField[] = [
    { key: "universal_field", label: "U", type: "text" },
    { key: "mudelar_field", label: "M", type: "text", variants: ["mudelar_obra"] },
    { key: "bmg_field", label: "B", type: "text", variants: ["bmg_contrato"] },
    {
      key: "shared_mb",
      label: "MB",
      type: "text",
      variants: ["mudelar_obra", "bmg_contrato"],
    },
    { key: "empty_variants", label: "E", type: "text", variants: [] },
  ];

  it("mantém campos sem variants (universais) para qualquer variante", () => {
    for (const v of ["universal", "mudelar_obra", "bmg_contrato"] as DucVariant[]) {
      const keys = fieldsForVariant(fields, v).map((f) => f.key);
      expect(keys).toContain("universal_field");
    }
  });

  it("filtra campos por variante mudelar_obra", () => {
    const keys = fieldsForVariant(fields, "mudelar_obra").map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(["universal_field", "mudelar_field", "shared_mb"])
    );
    expect(keys).not.toContain("bmg_field");
    expect(keys).not.toContain("empty_variants");
  });

  it("filtra campos por variante bmg_contrato", () => {
    const keys = fieldsForVariant(fields, "bmg_contrato").map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(["universal_field", "bmg_field", "shared_mb"])
    );
    expect(keys).not.toContain("mudelar_field");
  });

  it("para universal só devolve campos sem variants", () => {
    const keys = fieldsForVariant(fields, "universal").map((f) => f.key);
    expect(keys).toEqual(["universal_field"]);
  });

  it("um array de variants vazio exclui o campo (nenhuma variante o inclui)", () => {
    // variants: [] é truthy → passa pelo !f.variants=false e includes()=false
    expect(fieldsForVariant(fields, "mudelar_obra").map((f) => f.key)).not.toContain(
      "empty_variants"
    );
  });

  it("devolve array vazio quando a entrada é vazia", () => {
    expect(fieldsForVariant([], "universal")).toEqual([]);
  });

  it("não muta o array de entrada", () => {
    const copy = [...fields];
    fieldsForVariant(fields, "mudelar_obra");
    expect(fields).toEqual(copy);
  });
});

describe("sectionsForVariant", () => {
  it("devolve todas as secções sem variants para qualquer variante", () => {
    const stage: DucStage = {
      no: 99,
      key: "s",
      title: "S",
      responsible: "R",
      fields: [],
      itemSections: [
        { section: "scope", title: "Scope", columns: [] },
        { section: "material", title: "Material", columns: [], variants: ["bmg_contrato"] },
      ],
    };
    expect(sectionsForVariant(stage, "universal").map((s) => s.section)).toEqual(["scope"]);
    expect(sectionsForVariant(stage, "bmg_contrato").map((s) => s.section)).toEqual([
      "scope",
      "material",
    ]);
  });

  it("devolve array vazio quando não há itemSections", () => {
    const stage: DucStage = {
      no: 1,
      key: "x",
      title: "X",
      responsible: "R",
      fields: [],
    };
    expect(sectionsForVariant(stage, "universal")).toEqual([]);
  });

  it("service_map (variante B) só aparece em bmg_contrato", () => {
    const operacao = DUC_STAGES.find((s) => s.key === "operacao")!;
    expect(sectionsForVariant(operacao, "bmg_contrato").map((s) => s.section)).toContain(
      "service_map"
    );
    expect(sectionsForVariant(operacao, "mudelar_obra").map((s) => s.section)).not.toContain(
      "service_map"
    );
    expect(sectionsForVariant(operacao, "universal").map((s) => s.section)).not.toContain(
      "service_map"
    );
  });
});

describe("stageAppliesToVariant", () => {
  it("é falso quando stage.variants exclui a variante", () => {
    const stage: DucStage = {
      no: 1,
      key: "only-m",
      title: "M",
      responsible: "R",
      variants: ["mudelar_obra"],
      fields: [{ key: "a", label: "A", type: "text" }],
    };
    expect(stageAppliesToVariant(stage, "mudelar_obra")).toBe(true);
    expect(stageAppliesToVariant(stage, "bmg_contrato")).toBe(false);
    expect(stageAppliesToVariant(stage, "universal")).toBe(false);
  });

  it("é verdadeiro quando há campos aplicáveis", () => {
    const stage: DucStage = {
      no: 1,
      key: "with-fields",
      title: "F",
      responsible: "R",
      fields: [{ key: "a", label: "A", type: "text" }],
    };
    expect(stageAppliesToVariant(stage, "universal")).toBe(true);
  });

  it("é verdadeiro quando não há campos mas há secções aplicáveis", () => {
    const stage: DucStage = {
      no: 1,
      key: "sections-only",
      title: "S",
      responsible: "R",
      fields: [],
      itemSections: [{ section: "material", title: "Mat", columns: [] }],
    };
    expect(stageAppliesToVariant(stage, "universal")).toBe(true);
  });

  it("é falso quando não há campos nem secções aplicáveis à variante", () => {
    const stage: DucStage = {
      no: 1,
      key: "b-only",
      title: "B",
      responsible: "R",
      fields: [{ key: "b", label: "B", type: "text", variants: ["bmg_contrato"] }],
      itemSections: [
        { section: "material", title: "Mat", columns: [], variants: ["bmg_contrato"] },
      ],
    };
    expect(stageAppliesToVariant(stage, "bmg_contrato")).toBe(true);
    expect(stageAppliesToVariant(stage, "universal")).toBe(false);
    expect(stageAppliesToVariant(stage, "mudelar_obra")).toBe(false);
  });

  it("a etapa 'armazem' (só secções universais, sem campos) aplica-se a todas as variantes", () => {
    const armazem = DUC_STAGES.find((s) => s.key === "armazem")!;
    expect(armazem.fields).toEqual([]);
    for (const v of ["universal", "mudelar_obra", "bmg_contrato"] as DucVariant[]) {
      expect(stageAppliesToVariant(armazem, v)).toBe(true);
    }
  });

  it("a etapa 'posvenda' não se aplica a universal (todos os campos têm variante)", () => {
    const posvenda = DUC_STAGES.find((s) => s.key === "posvenda")!;
    expect(stageAppliesToVariant(posvenda, "universal")).toBe(false);
    expect(stageAppliesToVariant(posvenda, "mudelar_obra")).toBe(true);
    expect(stageAppliesToVariant(posvenda, "bmg_contrato")).toBe(true);
  });
});

describe("constantes exportadas", () => {
  it("DUC_STAGES tem 9 etapas com números sequenciais 1..9", () => {
    expect(DUC_STAGES).toHaveLength(9);
    expect(DUC_STAGES.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("DUC_STAGES tem chaves únicas", () => {
    const keys = DUC_STAGES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("VARIANT_LABELS cobre as três variantes", () => {
    expect(VARIANT_LABELS.universal).toBe("Universal");
    expect(VARIANT_LABELS.mudelar_obra).toBe("MUDELAR · obra");
    expect(VARIANT_LABELS.bmg_contrato).toBe("BMG · contrato");
  });

  it("STATUS_LABELS mapeia os estados conhecidos", () => {
    expect(STATUS_LABELS.draft).toBe("Rascunho");
    expect(STATUS_LABELS.in_progress).toBe("Em curso");
    expect(STATUS_LABELS.delivered).toBe("Entregue");
    expect(STATUS_LABELS.closed).toBe("Fechado");
  });

  it("CHANGE_LOG_COLUMNS é a secção change_log com colunas esperadas", () => {
    expect(CHANGE_LOG_COLUMNS.section).toBe("change_log");
    const fields = CHANGE_LOG_COLUMNS.columns.map((c) => c.field);
    expect(fields).toEqual(["data", "detetado_por", "description", "impacto", "included"]);
    // description e included são colunas próprias
    const own = CHANGE_LOG_COLUMNS.columns.filter((c) => c.own).map((c) => c.field);
    expect(own).toEqual(["description", "included"]);
  });
});

describe("missingRequiredFields", () => {
  // Helper: constrói uma etapa mínima com os campos dados.
  const stageWith = (fields: DucField[]): DucStage => ({
    no: 1,
    key: "test",
    title: "Test",
    responsible: "R",
    fields,
  });

  const variant: DucVariant = "universal";

  it("campo obrigatório de texto vazio ('' ou ausente) aparece; preenchido não aparece", () => {
    const stage = stageWith([
      { key: "nome", label: "Nome", type: "text", required: true },
    ]);

    // string vazia
    expect(missingRequiredFields(stage, variant, { nome: "" }).map((f) => f.key)).toEqual([
      "nome",
    ]);
    // ausente (chave não presente)
    expect(missingRequiredFields(stage, variant, {}).map((f) => f.key)).toEqual(["nome"]);
    // preenchido
    expect(missingRequiredFields(stage, variant, { nome: "Ana" })).toEqual([]);
  });

  it("campo obrigatório só com espaços ('   ') conta como vazio", () => {
    const stage = stageWith([
      { key: "nome", label: "Nome", type: "text", required: true },
    ]);
    expect(missingRequiredFields(stage, variant, { nome: "   " }).map((f) => f.key)).toEqual([
      "nome",
    ]);
    // com conteúdo rodeado de espaços já não está vazio
    expect(missingRequiredFields(stage, variant, { nome: "  Ana  " })).toEqual([]);
  });

  it("checkbox obrigatório: false/ausente falta; true ok", () => {
    const stage = stageWith([
      { key: "aceito", label: "Aceito", type: "checkbox", required: true },
    ]);
    expect(missingRequiredFields(stage, variant, { aceito: false }).map((f) => f.key)).toEqual([
      "aceito",
    ]);
    expect(missingRequiredFields(stage, variant, {}).map((f) => f.key)).toEqual(["aceito"]);
    expect(missingRequiredFields(stage, variant, { aceito: true })).toEqual([]);
  });

  it("phases obrigatório: undefined/[] falta; [{...}] ok", () => {
    const stage = stageWith([
      { key: "fases", label: "Fases", type: "phases", required: true },
    ]);
    expect(missingRequiredFields(stage, variant, {}).map((f) => f.key)).toEqual(["fases"]);
    expect(missingRequiredFields(stage, variant, { fases: [] }).map((f) => f.key)).toEqual([
      "fases",
    ]);
    expect(
      missingRequiredFields(stage, variant, {
        fases: [{ label: "1", percent: "50", amount: "", due: "", note: "" }],
      })
    ).toEqual([]);
  });

  it("campo NÃO obrigatório vazio nunca aparece", () => {
    const stage = stageWith([
      { key: "opcional", label: "Opcional", type: "text" },
      { key: "opcional_cb", label: "OpcionalCB", type: "checkbox" },
    ]);
    expect(missingRequiredFields(stage, variant, {})).toEqual([]);
    expect(missingRequiredFields(stage, variant, { opcional: "", opcional_cb: false })).toEqual(
      []
    );
  });

  it("campo obrigatório de outra variante é ignorado quando a variante é universal", () => {
    const stage = stageWith([
      {
        key: "so_mudelar",
        label: "Só Mudelar",
        type: "text",
        required: true,
        variants: ["mudelar_obra"],
      },
    ]);
    // universal não vê o campo → nada em falta
    expect(missingRequiredFields(stage, "universal", {})).toEqual([]);
    // mudelar_obra vê o campo → em falta
    expect(missingRequiredFields(stage, "mudelar_obra", {}).map((f) => f.key)).toEqual([
      "so_mudelar",
    ]);
  });

  it("vários campos obrigatórios em falta devolve todos", () => {
    const stage = stageWith([
      { key: "a", label: "A", type: "text", required: true },
      { key: "b", label: "B", type: "checkbox", required: true },
      { key: "c", label: "C", type: "phases", required: true },
      { key: "d", label: "D", type: "text" }, // não obrigatório
      { key: "e", label: "E", type: "text", required: true },
    ]);
    // e preenchido, os restantes obrigatórios em falta
    const missing = missingRequiredFields(stage, variant, { e: "ok" }).map((f) => f.key);
    expect(missing).toEqual(["a", "b", "c"]);
  });

  it("block undefined: todos os obrigatórios contam como em falta", () => {
    const stage = stageWith([
      { key: "a", label: "A", type: "text", required: true },
      { key: "b", label: "B", type: "checkbox", required: true },
      { key: "c", label: "C", type: "phases", required: true },
      { key: "d", label: "D", type: "text" }, // não obrigatório → não conta
    ]);
    expect(missingRequiredFields(stage, variant, undefined).map((f) => f.key)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

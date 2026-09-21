import { describe, expect, it } from "vitest";
import { isStageUnreachable } from "../LeadWorkflowConfig";
import { isEmptyRule, normalizeRule } from "../workflow/conditionCatalog";

/**
 * Cobre as duas correcções do editor de regras de estágio:
 *  1. o entulho legado em `reached_when` é descartado ao carregar e ao gravar
 *     (normalizeRule), em vez de ser preservado por um Guardar;
 *  2. um estágio sem status literal nem condições é sinalizado como
 *     inatingível — o caso real dos estágios criados com matching_statuses = {}.
 */
describe("normalizeRule", () => {
  it("descarta strings soltas e devolve null quando não sobra nada", () => {
    expect(normalizeRule({ all: ["has_assignee"], any: ["has_source"] })).toBeNull();
  });

  it("descarta elementos não-objecto mas mantém as condições válidas", () => {
    expect(
      normalizeRule({
        all: ["has_assignee", { type: "has_contact_logged" }, null, 42, [{ type: "has_source" }]],
        any: [],
      })
    ).toEqual({ all: [{ type: "has_contact_logged" }], any: [] });
  });

  it("normaliza regras vazias, nulas e mal formadas para null", () => {
    expect(normalizeRule(null)).toBeNull();
    expect(normalizeRule(undefined)).toBeNull();
    expect(normalizeRule({ all: [], any: [] })).toBeNull();
    expect(normalizeRule({})).toBeNull();
    expect(normalizeRule("has_assignee")).toBeNull();
    expect(normalizeRule([{ type: "has_assignee" }])).toBeNull();
    // `all`/`any` que não são arrays são tratados como listas vazias, tal como
    // em public.stage_reached.
    expect(normalizeRule({ all: "has_assignee", any: 3 })).toBeNull();
  });

  it("preserva condições parametrizadas intactas", () => {
    const rule = { all: [{ type: "days_since_created_gt", value: 14 }], any: [] };
    expect(normalizeRule(rule)).toEqual(rule);
  });

  it("o resultado de normalizeRule concorda sempre com isEmptyRule", () => {
    expect(isEmptyRule(normalizeRule({ all: ["lixo"], any: [] }))).toBe(true);
    expect(isEmptyRule(normalizeRule({ all: [{ type: "has_assignee" }], any: [] }))).toBe(false);
  });
});

describe("isStageUnreachable", () => {
  const stage = (over: Partial<Parameters<typeof isStageUnreachable>[0]>) => ({
    name: "reuniao_1",
    matching_statuses: null,
    reached_when: null,
    ...over,
  });

  it("sinaliza o caso real: matching_statuses vazio e sem condições", () => {
    expect(isStageUnreachable(stage({ matching_statuses: [] }))).toBe(true);
  });

  it("sinaliza matching_statuses nulo quando o nome não é um status do catálogo", () => {
    expect(isStageUnreachable(stage({ matching_statuses: null }))).toBe(true);
  });

  it("não sinaliza quando o nome do estágio é ele próprio um status do catálogo", () => {
    // toStagePayload grava [name] quando matching_statuses é nulo, logo o
    // fallback do motor resolve — e o badge correspondente aparece aceso.
    expect(isStageUnreachable(stage({ name: "qualified", matching_statuses: null }))).toBe(false);
  });

  it("não sinaliza quando há um status literal associado", () => {
    expect(isStageUnreachable(stage({ matching_statuses: ["contacted"] }))).toBe(false);
  });

  it("não sinaliza quando há condições avançadas utilizáveis", () => {
    expect(
      isStageUnreachable(
        stage({ matching_statuses: [], reached_when: { all: [{ type: "has_assignee" }], any: [] } })
      )
    ).toBe(false);
  });

  it("sinaliza quando as condições avançadas são só entulho legado", () => {
    expect(
      isStageUnreachable(
        stage({ matching_statuses: [], reached_when: { all: ["has_assignee"], any: [] } as never })
      )
    ).toBe(true);
  });

  it("sinaliza quando os status associados não existem no catálogo", () => {
    expect(isStageUnreachable(stage({ matching_statuses: ["pedido_de_dados"] }))).toBe(true);
  });
});

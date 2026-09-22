import { describe, expect, it } from "vitest";
import { findUnreachableStages, isStageUnreachable } from "../LeadWorkflowConfig";
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

  /**
   * Caso BMGest, confirmado ao vivo: "Reunião 2/3/4" ficaram com
   * matching_statuses = {} (array_length 0) e reached_when sem nenhuma condição
   * utilizável. `stage_reached` devolve false em qualquer circunstância e, como
   * a organização tem o fluxo sequencial ligado e estas etapas estão no caminho
   * das setas, o funil trava na "Visita Agendada".
   */
  describe("caso BMGest — sem regra E sem estado é SEMPRE inatingível", () => {
    const emptyRuleShapes: Array<[string, unknown]> = [
      ["reached_when null", null],
      ["reached_when undefined", undefined],
      ["reached_when {}", {}],
      ["reached_when {all:[],any:[]}", { all: [], any: [] }],
      ["reached_when só com entulho legado", { all: ["has_assignee"], any: ["has_source"] }],
      ["reached_when com all/any que não são arrays", { all: "has_assignee", any: 3 }],
    ];

    for (const [label, reachedWhen] of emptyRuleShapes) {
      it(`matching_statuses vazio + ${label}`, () => {
        expect(
          isStageUnreachable(
            stage({ name: "reuniao_2", matching_statuses: [], reached_when: reachedWhen as never })
          )
        ).toBe(true);
      });
    }

    it("um array vazio não recai no default [name], mesmo que o nome fosse um status válido", () => {
      // Com matching_statuses = [] o motor não tem nada para comparar: o
      // fallback `?? [stage.name]` só vale para nulo/indefinido.
      expect(isStageUnreachable(stage({ name: "qualified", matching_statuses: [] }))).toBe(true);
    });
  });
});

describe("findUnreachableStages", () => {
  const stage = (over: Partial<Parameters<typeof isStageUnreachable>[0]> & { label: string }) => ({
    name: "etapa",
    matching_statuses: null as string[] | null,
    reached_when: null,
    ...over,
  });

  it("devolve só as etapas inatingíveis, pela ordem recebida", () => {
    const stages = [
      stage({ label: "Visita Agendada", name: "visit_scheduled", matching_statuses: ["visit_scheduled"] }),
      stage({ label: "Reunião 2", name: "reuniao_2", matching_statuses: [] }),
      stage({ label: "Reunião 3", name: "reuniao_3", matching_statuses: [] }),
      stage({
        label: "Reunião 4",
        name: "reuniao_4",
        matching_statuses: [],
        reached_when: { all: [{ type: "has_assignee" }], any: [] } as never,
      }),
      stage({ label: "Convertida", name: "converted", matching_statuses: ["converted"] }),
    ];

    expect(findUnreachableStages(stages).map(s => s.label)).toEqual(["Reunião 2", "Reunião 3"]);
  });

  it("devolve vazio quando todas as etapas são alcançáveis", () => {
    expect(
      findUnreachableStages([
        stage({ label: "Nova", name: "new", matching_statuses: ["new"] }),
        stage({ label: "Contactada", name: "contacted", matching_statuses: null }),
      ])
    ).toEqual([]);
  });

  it("aguenta uma lista vazia", () => {
    expect(findUnreachableStages([])).toEqual([]);
  });
});

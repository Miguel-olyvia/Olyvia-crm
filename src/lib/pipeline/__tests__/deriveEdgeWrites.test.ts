import { describe, it, expect } from "vitest";
import { deriveEdgeWrites, isNoOp, nextEnabledModule, type StageActionRule } from "../deriveEdgeWrites";

const M = (id: string, enabled = true) => ({ id, enabled });

/** A ordem que nike e Mudelar têm guardada (lida na base a 2026-08-31). */
const ORDEM = [M("pedido"), M("orcamento"), M("proposta"), M("contrato"), M("cliente")];

/**
 * A FORMA de uma organização com a cadeia inteira configurada e activa — a
 * mesma da Mudelar (lida na base a 2026-08-31), com identificadores fictícios.
 *
 * O que este teste prova é a forma, não os UUIDs: dois disparos no Pedido,
 * um em cada um dos restantes, tudo activo. Se a derivação mexer nisto, o
 * desenho está errado e não se avança — e a prova faz-se aqui, em memória,
 * sem tocar em base de dados nenhuma.
 */
const CADEIA_COMPLETA: StageActionRule[] = [
  { id: "d1", module: "pedido",   stage_id: "fase-pedido-1", action_type: "create_quote",       is_active: true },
  { id: "d2", module: "pedido",   stage_id: "fase-pedido-2", action_type: "create_quote",       is_active: true },
  { id: "q1", module: "orcamento", stage_id: "fase-orcamento-aceite", action_type: "create_proposal",   is_active: true },
  { id: "p1", module: "proposta", stage_id: "fase-proposta-aceite", action_type: "create_contract",    is_active: true },
  { id: "c1", module: "contrato", stage_id: "assinado",                             action_type: "convert_to_client", is_active: true },
];

describe("garantia de que uma cadeia ja configurada nao muda", () => {
  it("a ordem actual de uma cadeia completa produz ZERO escritas", () => {
    const w = deriveEdgeWrites(CADEIA_COMPLETA, ORDEM);
    expect(w.deactivate).toEqual([]);
    expect(w.insert).toEqual([]);
    expect(w.reactivate).toEqual([]);
    expect(isNoOp(w)).toBe(true);
  });

  it("as duas fases de disparo do Pedido sobrevivem -- nenhuma é colapsada", () => {
    const w = deriveEdgeWrites(CADEIA_COMPLETA, ORDEM);
    expect(w.needsTriggerStage).toEqual([]);
    expect(isNoOp(w)).toBe(true);
  });
});

describe("reordenar reescreve as arestas", () => {
  it("trocar Orçamento e Proposta troca o que cada um cria, mantendo as fases", () => {
    const trocada = [M("pedido"), M("proposta"), M("orcamento"), M("contrato"), M("cliente")];
    const w = deriveEdgeWrites(CADEIA_COMPLETA, trocada);

    // Pedido passa a criar Proposta
    expect(w.insert).toContainEqual({ module: "pedido", stage_id: CADEIA_COMPLETA[0].stage_id, action_type: "create_proposal" });
    expect(w.insert).toContainEqual({ module: "pedido", stage_id: CADEIA_COMPLETA[1].stage_id, action_type: "create_proposal" });
    // Proposta passa a criar Orçamento; Orçamento passa a criar Contrato
    expect(w.insert).toContainEqual({ module: "proposta",  stage_id: CADEIA_COMPLETA[3].stage_id, action_type: "create_quote" });
    expect(w.insert).toContainEqual({ module: "orcamento", stage_id: CADEIA_COMPLETA[2].stage_id, action_type: "create_contract" });

    // O que ficou para trás é desactivado, nunca apagado
    expect(w.deactivate.map((r) => r.id).sort()).toEqual(["d1", "d2", "p1", "q1"]);
    // O Contrato não muda: continua a criar o Cliente
    expect(w.deactivate.map((r) => r.id)).not.toContain("c1");
  });
});

describe("módulos desactivados", () => {
  it("desligar o Orçamento faz o Pedido criar a Proposta directamente", () => {
    const semOrcamento = [M("pedido"), M("orcamento", false), M("proposta"), M("contrato"), M("cliente")];
    const w = deriveEdgeWrites(CADEIA_COMPLETA, semOrcamento);

    expect(w.insert).toContainEqual({ module: "pedido", stage_id: CADEIA_COMPLETA[0].stage_id, action_type: "create_proposal" });

    // A regra do módulo DESLIGADO também é desactivada (`q1`).
    //
    // Este teste afirmava o contrário até 2026-08-31 — "a regra do módulo
    // desligado não é tocada, volta a valer ao reactivar" — e a afirmação
    // estava errada. A varredura exaustiva apanhou-o: o motor não lê
    // `organization_pipeline_config`, só as tabelas de acções. Uma regra que
    // ficasse activa continuava a ser executada com o módulo desligado no ecrã,
    // que é exactamente o defeito que esta reescrita existe para corrigir.
    //
    // Nada se perde ao desactivar: a linha fica lá, com a fase de disparo
    // original, e volta a ser ligada (`reactivate`) quando o módulo for
    // reactivado.
    expect(w.deactivate.map((r) => r.id).sort()).toEqual(["d1", "d2", "q1"]);
  });
});

describe("acções que não são arestas", () => {
  it("create_task e send_email sobrevivem a qualquer reordenação", () => {
    const comTarefa: StageActionRule[] = [
      ...CADEIA_COMPLETA,
      { id: "t1", module: "proposta", stage_id: "outra-fase", action_type: "create_task", is_active: true },
      { id: "e1", module: "orcamento", stage_id: "outra-fase", action_type: "send_email", is_active: true },
    ];
    const trocada = [M("pedido"), M("proposta"), M("orcamento"), M("contrato"), M("cliente")];
    const w = deriveEdgeWrites(comTarefa, trocada);
    const mexidos = [...w.deactivate, ...w.reactivate].map((r) => r.id);
    expect(mexidos).not.toContain("t1");
    expect(mexidos).not.toContain("e1");
  });
});

describe("o terminal", () => {
  it("o Cliente nunca emite aresta nenhuma", () => {
    const w = deriveEdgeWrites(CADEIA_COMPLETA, ORDEM);
    expect(w.insert.some((i) => i.module === "cliente")).toBe(false);
    expect(w.needsTriggerStage).not.toContain("cliente");
  });

  it("nextEnabledModule salta os desactivados", () => {
    const mods = [M("pedido"), M("orcamento", false), M("proposta")];
    expect(nextEnabledModule(mods, "pedido")?.id).toBe("proposta");
    expect(nextEnabledModule(mods, "proposta")).toBeNull();
  });
});

describe("regras desactivadas voltam a ficar activas quando a ordem as justifica", () => {
  it("uma regra desligada e proposta para reactivacao se a ordem a exigir", () => {
    const desligada: StageActionRule[] = [
      { id: "n1", module: "proposta", stage_id: "fase-proposta-aceite", action_type: "create_contract", is_active: false },
    ];
    const w = deriveEdgeWrites(desligada, ORDEM);
    expect(w.reactivate.map((r) => r.id)).toEqual(["n1"]);
  });
});

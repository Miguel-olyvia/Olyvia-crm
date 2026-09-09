/**
 * Varredura exaustiva da derivação: TODAS as ordens possíveis dos módulos,
 * combinadas com TODAS as combinações de activo/desactivado.
 *
 * Os testes escolhidos à mão (deriveEdgeWrites.test.ts) cobrem os casos de que
 * alguém se lembrou. Este cobre o espaço todo — 24 ordens × 16 combinações de
 * activação — e verifica invariantes em vez de resultados concretos, que é a
 * única forma de dizer "funciona em qualquer configuração" sem adivinhar.
 */
import { describe, it, expect } from "vitest";
import {
  deriveEdgeWrites,
  isNoOp,
  nextEnabledModule,
  ACTION_THAT_CREATES,
  isEdgeAction,
  type StageActionRule,
  type EdgeWrites,
} from "../deriveEdgeWrites";
import { normalizeModuleOrder, isTerminal } from "../moduleOrder";

const NAO_TERMINAIS = ["pedido", "orcamento", "proposta", "contrato"];

function permutacoes<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    const resto = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutacoes(resto)) out.push([x, ...p]);
  });
  return out;
}

function combinacoesDeActivacao(): boolean[][] {
  const out: boolean[][] = [];
  for (let mask = 0; mask < 16; mask++) {
    out.push([0, 1, 2, 3].map((b) => Boolean(mask & (1 << b))));
  }
  return out;
}

const modulo = (id: string, enabled: boolean) => ({ id, enabled });

/** Cadeia canónica, tudo activo, uma fase de disparo por módulo. */
const REGRAS_BASE: StageActionRule[] = [
  { id: "r-pedido", module: "pedido", stage_id: "fase-pedido", action_type: "create_quote", is_active: true },
  { id: "r-orcamento", module: "orcamento", stage_id: "fase-orcamento", action_type: "create_proposal", is_active: true },
  { id: "r-proposta", module: "proposta", stage_id: "fase-proposta", action_type: "create_contract", is_active: true },
  { id: "r-contrato", module: "contrato", stage_id: "fase-contrato", action_type: "convert_to_client", is_active: true },
];

function aplicar(regras: StageActionRule[], w: EdgeWrites): StageActionRule[] {
  const desligar = new Set(w.deactivate.map((r) => r.id));
  const ligar = new Set(w.reactivate.map((r) => r.id));
  const out = regras.map((r) =>
    desligar.has(r.id) ? { ...r, is_active: false } : ligar.has(r.id) ? { ...r, is_active: true } : r,
  );
  w.insert.forEach((i, k) =>
    out.push({
      id: `novo-${i.module}-${i.action_type}-${k}`,
      module: i.module,
      stage_id: i.stage_id,
      action_type: i.action_type,
      is_active: true,
    }),
  );
  return out;
}

const ordens = permutacoes(NAO_TERMINAIS);
const activacoes = combinacoesDeActivacao();

function montar(ordem: string[], act: boolean[]) {
  return normalizeModuleOrder([
    ...ordem.map((id) => modulo(id, act[NAO_TERMINAIS.indexOf(id)])),
    modulo("cliente", true),
  ]);
}

const activasDe = (regras: StageActionRule[], m: string) =>
  [...new Set(regras.filter((r) => r.module === m && r.is_active && isEdgeAction(r.action_type)).map((r) => r.action_type))];

describe("varredura exaustiva: 24 ordens x 16 combinações de activação", () => {
  it("cobre mesmo o espaço todo", () => {
    expect(ordens).toHaveLength(24);
    expect(activacoes).toHaveLength(16);
  });

  it("o Cliente fica sempre em último, em qualquer ordem e activação", () => {
    for (const ordem of ordens)
      for (const act of activacoes) {
        const mods = montar(ordem, act);
        expect(isTerminal(mods[mods.length - 1])).toBe(true);
      }
  });

  it("cada módulo activo passa a criar o módulo activo seguinte, e mais nada", () => {
    for (const ordem of ordens)
      for (const act of activacoes) {
        const mods = montar(ordem, act);
        const w = deriveEdgeWrites(REGRAS_BASE, mods);
        const depois = aplicar(REGRAS_BASE, w);
        const activos = mods.filter((x) => x.enabled);

        for (const m of activos.filter((x) => !isTerminal(x))) {
          const seguinte = nextEnabledModule(activos, m.id);
          const esperada = seguinte ? ACTION_THAT_CREATES[seguinte.id] : null;
          const tipos = activasDe(depois, m.id);
          if (!esperada) {
            expect(tipos).toEqual([]);
          } else if (!w.needsTriggerStage.includes(m.id)) {
            expect(tipos).toEqual([esperada]);
          }
        }
      }
  });

  it("nunca fica mais do que UM tipo de aresta activo por módulo", () => {
    for (const ordem of ordens)
      for (const act of activacoes) {
        const depois = aplicar(REGRAS_BASE, deriveEdgeWrites(REGRAS_BASE, montar(ordem, act)));
        for (const m of NAO_TERMINAIS) expect(activasDe(depois, m).length).toBeLessThanOrEqual(1);
      }
  });

  it("converge: derivar outra vez por cima do resultado não muda mais nada", () => {
    for (const ordem of ordens)
      for (const act of activacoes) {
        const mods = montar(ordem, act);
        const depois = aplicar(REGRAS_BASE, deriveEdgeWrites(REGRAS_BASE, mods));
        expect(isNoOp(deriveEdgeWrites(depois, mods))).toBe(true);
      }
  });

  it("nunca toca em acções que não são arestas", () => {
    const comExtras: StageActionRule[] = [
      ...REGRAS_BASE,
      { id: "t1", module: "proposta", stage_id: "outra", action_type: "create_task", is_active: true },
      { id: "t2", module: "pedido", stage_id: "outra", action_type: "send_email", is_active: false },
      { id: "t3", module: "contrato", stage_id: "outra", action_type: "propagate_rejection", is_active: true },
    ];
    for (const ordem of ordens)
      for (const act of activacoes) {
        const w = deriveEdgeWrites(comExtras, montar(ordem, act));
        const mexidos = [...w.deactivate, ...w.reactivate].map((r) => r.id);
        expect(mexidos).not.toContain("t1");
        expect(mexidos).not.toContain("t2");
        expect(mexidos).not.toContain("t3");
      }
  });

  it("o módulo terminal nunca emite aresta, em ordem nenhuma", () => {
    for (const ordem of ordens) {
      const w = deriveEdgeWrites(REGRAS_BASE, montar(ordem, [true, true, true, true]));
      expect(w.insert.some((i) => i.module === "cliente")).toBe(false);
      expect(w.needsTriggerStage).not.toContain("cliente");
    }
  });

  it("ida e volta: reordenar e voltar à ordem original repõe as arestas de partida", () => {
    const original = montar(NAO_TERMINAIS, [true, true, true, true]);
    for (const ordem of ordens) {
      const outra = montar(ordem, [true, true, true, true]);
      const ida = aplicar(REGRAS_BASE, deriveEdgeWrites(REGRAS_BASE, outra));
      const volta = aplicar(ida, deriveEdgeWrites(ida, original));
      for (const m of NAO_TERMINAIS) {
        expect(activasDe(volta, m).sort()).toEqual(activasDe(REGRAS_BASE, m).sort());
      }
    }
  });

  it("o caso perguntado: Orçamento primeiro, depois Proposta, e o resto desligado", () => {
    const mods = normalizeModuleOrder([
      modulo("orcamento", true),
      modulo("proposta", true),
      modulo("pedido", false),
      modulo("contrato", false),
      modulo("cliente", true),
    ]);
    const depois = aplicar(REGRAS_BASE, deriveEdgeWrites(REGRAS_BASE, mods));
    expect(activasDe(depois, "orcamento")).toEqual(["create_proposal"]);
    expect(activasDe(depois, "proposta")).toEqual(["convert_to_client"]);
    expect(activasDe(depois, "pedido")).toEqual([]);
    expect(activasDe(depois, "contrato")).toEqual([]);
  });
});

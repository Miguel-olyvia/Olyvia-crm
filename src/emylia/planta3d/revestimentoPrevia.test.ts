// 24/11: o desenho dos revestimentos como superfície na pré-visualização 3D do produto: o planeamento das peças (puro), a medida em mm e cm, a vista
// por omissão (chão ou parede) e a cena com a câmara de cada caso.
import { describe, expect, it } from "vitest";
import {
  AMOSTRA_MAX_M, MAX_PECAS, VARIACAO_TOM, aplicacaoDosAtributos, cenaDoRevestimento, corDaJunta, medidaDoRevestimento, planearRevestimento, superficieDaPrevia,
  type PlanoRevestimento,
} from "./revestimentoPrevia";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";

const EPS = 1e-9;
/** Todas as peças dentro da amostra, sem se sobreporem, e com a junta entre vizinhas. */
function conferir(p: PlanoRevestimento) {
  const [w, h] = p.amostraM;
  for (const q of p.pecas) {
    expect(q.x).toBeGreaterThanOrEqual(-EPS);
    expect(q.y).toBeGreaterThanOrEqual(-EPS);
    expect(q.x + q.w).toBeLessThanOrEqual(w + EPS);
    expect(q.y + q.h).toBeLessThanOrEqual(h + EPS);
    expect(q.w).toBeGreaterThan(0);
    expect(q.h).toBeGreaterThan(0);
  }
  // duas peças da mesma fila, seguidas: a junta entre elas é a do plano
  const fila0 = p.pecas.filter((q) => q.fila === 0).sort((a, b) => a.x - b.x);
  for (let i = 1; i < fila0.length; i++) expect(fila0[i].x - (fila0[i - 1].x + fila0[i - 1].w)).toBeCloseTo(p.juntaM, 6);
  const col0 = p.pecas.filter((q) => q.coluna === 0).sort((a, b) => a.y - b.y);
  for (let i = 1; i < col0.length; i++) expect(col0[i].y - (col0[i - 1].y + col0[i - 1].h)).toBeCloseTo(p.juntaM, 6);
}

describe("planearRevestimento: a grelha de peças da amostra", () => {
  it("60×60 no chão: 1,2 × 1,2 m, 2 × 2 peças inteiras (a 2.ª cortada pela junta), junta de 2 mm, espessura 1 cm por omissão", () => {
    const p = planearRevestimento({ ladoPecaCm: [60, 60], superficie: "chao" });
    expect(p.amostraM).toEqual([1.2, 1.2]);
    expect(p.juntaM).toBeCloseTo(0.002, 9);
    expect(p.espessuraM).toBeCloseTo(0.01, 9);
    expect(p.pecaM).toEqual([0.6, 0.6]);
    expect(p.pecas).toHaveLength(4);
    expect(p.pecas.filter((q) => q.cortada)).toHaveLength(3);
    expect(p.aviso).toBeNull();
    conferir(p);
  });

  it("Sajonia 19,5×120 no chão: o lado maior no eixo X, a amostra cresce para mostrar 2 peças no comprimento", () => {
    const p = planearRevestimento({ ladoPecaCm: [19.5, 120], superficie: "chao" });
    expect(p.pecaM[0]).toBeCloseTo(1.2, 9);
    expect(p.pecaM[1]).toBeCloseTo(0.195, 9);
    expect(p.amostraM[0]).toBeGreaterThanOrEqual(2 * 1.2);
    expect(p.amostraM[1]).toBeCloseTo(1.2, 9);
    // 2 peças inteiras no comprimento por fila; 1,2 m / (0,195 + 0,002) = 6,1 → 7 filas
    const fila0 = p.pecas.filter((q) => q.fila === 0);
    expect(fila0.filter((q) => !q.cortada || q.w > 1.19)).toHaveLength(2);
    expect(new Set(p.pecas.map((q) => q.fila)).size).toBe(7);
    for (const q of p.pecas) expect(q.w).toBeGreaterThan(q.h * 0.5); // nunca de pé
    conferir(p);
  });

  it("Sajonia 19,5×120 na parede: 1,2 × 1,6 m de amostra (a largura cresce), o lado maior na horizontal", () => {
    const p = planearRevestimento({ ladoPecaCm: [120, 19.5], superficie: "parede" });
    expect(p.pecaM[0]).toBeCloseTo(1.2, 9);
    expect(p.amostraM[0]).toBeGreaterThanOrEqual(2.4);
    expect(p.amostraM[1]).toBeCloseTo(1.6, 9);
    // 1,6 / 0,197 = 8,1 → 9 filas
    expect(new Set(p.pecas.map((q) => q.fila)).size).toBe(9);
    conferir(p);
  });

  it("laminado de 1000×3000 mm: a amostra cresce até ao máximo, sem passar dele, e mostra pelo menos 2 peças na largura", () => {
    const p = planearRevestimento({ ladoPecaCm: [100, 300], superficie: "chao" });
    expect(p.pecaM).toEqual([3, 1]);
    expect(p.amostraM[0]).toBe(AMOSTRA_MAX_M);
    expect(p.amostraM[1]).toBeGreaterThanOrEqual(2 * 1);
    expect(p.amostraM[1]).toBeLessThanOrEqual(AMOSTRA_MAX_M);
    expect(p.pecas.length).toBeGreaterThanOrEqual(4);
    conferir(p);
  });

  it("laminado de 1000×1000 mm: 2 × 2 peças inteiras", () => {
    const p = planearRevestimento({ ladoPecaCm: [100, 100], superficie: "chao" });
    expect(p.pecas.filter((q) => !q.cortada)).toHaveLength(4);
    conferir(p);
  });

  it("medida em falta: 60×60 e diz que a medida faltou", () => {
    for (const lado of [null, undefined, [0, 60] as const, [Number.NaN, 30] as const]) {
      const p = planearRevestimento({ ladoPecaCm: lado as never, superficie: "chao" });
      expect(p.pecaRealCm).toEqual([60, 60]);
      expect(p.medidaEmFalta).toBe(true);
    }
  });

  it("a espessura da medida (3,5 mm) e a junta limitada a 2 a 3 mm", () => {
    const p = planearRevestimento({ ladoPecaCm: [60, 60], superficie: "chao", espessuraCm: 0.35, juntaMm: 10 });
    expect(p.espessuraM).toBeCloseTo(0.0035, 9);
    expect(p.juntaM).toBeCloseTo(0.003, 9);
    expect(planearRevestimento({ ladoPecaCm: [60, 60], superficie: "chao", juntaMm: 0 }).juntaM).toBeCloseTo(0.002, 9);
  });

  it("peças muito pequenas (mosaico 2,5×2,5): nunca mais de 600 peças, e diz o que fez", () => {
    const p = planearRevestimento({ ladoPecaCm: [2.5, 2.5], superficie: "parede" });
    expect(p.pecas.length).toBeLessThanOrEqual(MAX_PECAS);
    expect(p.aviso).toMatch(/peças pequenas/i);
    conferir(p);
  });

  it("peças minúsculas (1×1 cm): reduz a área até ao mínimo e depois aumenta a peça mostrada, e di-lo", () => {
    const p = planearRevestimento({ ladoPecaCm: [1, 1], superficie: "chao" });
    expect(p.pecas.length).toBeLessThanOrEqual(MAX_PECAS);
    expect(p.escala).toBeGreaterThan(1);
    expect(p.aviso).toMatch(/maior/);
    conferir(p);
  });

  it("o tom de cada peça varia pouco (1 − VARIACAO_TOM a 1) e é sempre o mesmo para a mesma peça", () => {
    const a = planearRevestimento({ ladoPecaCm: [30, 60], superficie: "chao" }), b = planearRevestimento({ ladoPecaCm: [30, 60], superficie: "chao" });
    expect(VARIACAO_TOM).toBeLessThanOrEqual(0.15);
    for (const q of a.pecas) { expect(q.tom).toBeGreaterThanOrEqual(1 - VARIACAO_TOM); expect(q.tom).toBeLessThanOrEqual(1); }
    expect(a.pecas.map((q) => q.tom)).toEqual(b.pecas.map((q) => q.tom));
  });
});

describe("medidaDoRevestimento: a Medida do produto, em mm ou cm", () => {
  const M = (medida: AtributoProduto["medida"]): AtributoProduto[] => [{ atributoId: "m", medida }];
  it("cm: 19,5 × 120, sem espessura", () => {
    expect(medidaDoRevestimento(M({ tipo: "2D", largura: 19.5, comprimento: 120, espessura: null, unidade: "cm" }))).toEqual({ ladoCm: [19.5, 120] });
  });
  it("mm: 1000 × 3000 × 3,5 → 100 × 300 cm e 0,35 cm de espessura (que a medida do modelo 3D deitava fora por ser < 5 cm)", () => {
    expect(medidaDoRevestimento(M({ tipo: "3D", largura: 1000, comprimento: 3000, espessura: 3.5, unidade: "mm" }))).toEqual({ ladoCm: [100, 300], espessuraCm: 0.35 });
  });
  it("intervalo: o limite superior; sem medida, 1D ou ilegível: null", () => {
    expect(medidaDoRevestimento(M({ tipo: "2D", largura: { de: 59, ate: 60 }, comprimento: 60, espessura: null, unidade: "cm" }))?.ladoCm).toEqual([60, 60]);
    expect(medidaDoRevestimento([])).toBeNull();
    expect(medidaDoRevestimento(M({ tipo: "1D", dimensao: "largura", valor: 60, unidade: "cm" }))).toBeNull();
    expect(medidaDoRevestimento(M({ tipo: "2D", largura: 0, comprimento: 0, espessura: null, unidade: "cm" }))).toBeNull();
  });
});

describe("aplicacaoDosAtributos: o atributo «Aplicação» do produto", () => {
  const defs: AtributoDef[] = [{ id: "ap", codigo: "aplicacao", nome: "Aplicação", tipo: "lista", temHex: false, ordem: 1, opcoes: [
    { id: "o1", valor: "PAVIMENTO", nome: "Pavimento", hex: null, ordem: 1 }, { id: "o2", valor: "PAREDE", nome: "Parede", hex: null, ordem: 2 }] }];
  it("o nome da opção escolhida; sem atributo ou sem escolha: null", () => {
    expect(aplicacaoDosAtributos([{ atributoId: "ap", opcaoId: "o2" }], defs)).toBe("Parede");
    expect(aplicacaoDosAtributos([], defs)).toBeNull();
    expect(aplicacaoDosAtributos([{ atributoId: "ap", opcaoId: "o1" }], [])).toBeNull();
  });
});

describe("superficieDaPrevia: a vista por omissão", () => {
  it("o modelo resolvido manda: revestimento_chao → chão, revestimento_parede → parede (mesmo contra a subcategoria e a Aplicação)", () => {
    expect(superficieDaPrevia({ modelo: "revestimento_chao", categoria: "Revestimentos", subcategoria: "Cerâmico", aplicacao: "Parede" })).toBe("chao");
    expect(superficieDaPrevia({ modelo: "revestimento_parede", categoria: "Revestimentos", subcategoria: "SPC", aplicacao: "Pavimento" })).toBe("parede");
    expect(superficieDaPrevia({ modelo: "revestimento_parede" })).toBe("parede");
  });
  it("outro modelo escolhido (genérico, caixa): não é a vista de revestimento", () => {
    expect(superficieDaPrevia({ modelo: "caixa", categoria: "Revestimentos", subcategoria: "SPC" })).toBeNull();
    expect(superficieDaPrevia({ modelo: "sanita", categoria: "Revestimentos" })).toBeNull();
  });
  it("automático num Revestimento: pela subcategoria (SPC, Porcelânico e Cerâmico Laminado → chão; Cerâmico → parede)", () => {
    const auto = (subcategoria: string) => superficieDaPrevia({ modelo: null, categoria: "Revestimentos", subcategoria });
    expect(auto("SPC")).toBe("chao");
    expect(auto("Porcelânico")).toBe("chao");
    expect(auto("Cerâmico Laminado")).toBe("chao");
    expect(auto("Cerâmico")).toBe("parede");
    expect(auto("Azulejo")).toBe("parede");
    expect(auto("Outra coisa")).toBe("chao");
  });
  it("a Aplicação manda sobre a subcategoria; uma Aplicação que diz as duas não decide", () => {
    expect(superficieDaPrevia({ modelo: null, categoria: "Revestimentos", subcategoria: "Cerâmico", aplicacao: "Pavimento" })).toBe("chao");
    expect(superficieDaPrevia({ modelo: null, categoria: "Revestimentos", subcategoria: "SPC", aplicacao: "Parede" })).toBe("parede");
    expect(superficieDaPrevia({ modelo: null, categoria: "Revestimentos", subcategoria: "Cerâmico", aplicacao: "Pavimento e Parede" })).toBe("parede");
  });
  it("automático e não é um Revestimento: null (fica como hoje)", () => {
    expect(superficieDaPrevia({ modelo: null, categoria: "Casa de banho", subcategoria: "Sanitas" })).toBeNull();
    expect(superficieDaPrevia({ modelo: null })).toBeNull();
    expect(superficieDaPrevia({ modelo: null, categoria: null, subcategoria: "Cerâmico", aplicacao: "Parede" })).toBeNull();
  });
});

describe("cenaDoRevestimento: a divisão, a origem da amostra e a câmara", () => {
  it("no chão: a amostra ao centro do chão e a câmara a ¾, de cima", () => {
    const plano = planearRevestimento({ ladoPecaCm: [60, 60], superficie: "chao" });
    const c = cenaDoRevestimento(plano, "Peça");
    const xs = c.espaco.paredes.map((p) => p.a.x), lado = Math.max(...xs);
    expect(c.amostra.origem[1]).toBe(0);
    expect(c.amostra.origem[0] + plano.amostraM[0] / 2).toBeCloseTo(lado / 2, 9);
    expect(c.amostra.origem[2] + plano.amostraM[1] / 2).toBeCloseTo(lado / 2, 9);
    expect(c.espaco.pecas).toHaveLength(0);
    const [px, py, pz] = c.camara.pos, [ax, ay, az] = c.camara.alvo;
    expect(py - ay).toBeGreaterThan(Math.hypot(px - ax, pz - az) * 0.6); // bem por cima
    expect(c.camara.distMin).toBeLessThan(c.camara.distMax);
  });
  it("na parede: a amostra encostada à parede do fundo (z = 0), a partir do chão, e a câmara de frente, ligeiramente em ângulo", () => {
    const plano = planearRevestimento({ ladoPecaCm: [120, 19.5], superficie: "parede" });
    const c = cenaDoRevestimento(plano, "Peça");
    expect(c.amostra.origem[2]).toBe(0);
    expect(c.amostra.origem[1]).toBe(0);
    expect(c.espaco.peDireito).toBeGreaterThanOrEqual(plano.amostraM[1]);
    const [px, py, pz] = c.camara.pos, [ax, ay, az] = c.camara.alvo;
    expect(pz - az).toBeGreaterThan(Math.abs(px - ax) * 2); // de frente
    expect(Math.abs(px - ax)).toBeGreaterThan(0); // em ângulo
    expect(Math.abs(py - ay)).toBeLessThan(pz - az);
    expect(c.camara.chave).not.toBe(cenaDoRevestimento(planearRevestimento({ ladoPecaCm: [120, 19.5], superficie: "chao" }), "Peça").camara.chave);
  });
});

describe("cenaDoRevestimento: a câmara nunca fica dentro da espessura de uma parede (via-se só cinzento: 60×60 no chão, visto ao vivo)", () => {
  it("a câmara de partida fica dentro da divisão, a pelo menos 25 cm de cada parede, em todos os casos", () => {
    const casos = [[60, 60], [19.5, 120], [100, 300], [100, 100], [2.5, 2.5], [30, 60]] as const;
    for (const superficie of ["chao", "parede"] as const) for (const lados of casos) {
      const c = cenaDoRevestimento(planearRevestimento({ ladoPecaCm: lados, superficie }), "x");
      const lado = Math.max(...c.espaco.paredes.map((p) => p.a.x)), [x, , z] = c.camara.pos;
      for (const v of [x, z]) { expect(v).toBeGreaterThan(0.25); expect(v).toBeLessThan(lado - 0.25); }
    }
  });
});

describe("corDaJunta: a argamassa, cinzenta e um pouco mais escura do que a peça", () => {
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  it("mais escura do que a peça e quase cinzenta", () => {
    for (const cor of ["#d9d6cf", "#8b5a2b", "#f4f4f2", "#5b5f66"]) {
      const j = corDaJunta(cor);
      expect(j).toMatch(/^#[0-9a-f]{6}$/);
      expect(lum(j)).toBeLessThan(lum(cor));
    }
  });
  it("uma cor inválida dá o cinzento de omissão", () => {
    expect(corDaJunta("azul")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// 24/11 (fase 1, só ecrã): os eixos da Medida. A Medida de um produto (largura, comprimento, espessura) reparte-se por largura, altura e profundidade da peça conforme o TIPO
// (como o classificador faz com o nome). `eixosPorOmissao` é essa regra de hoje, como dados; `dimensoesDaMedida` aceita eixos escolhidos e, sem eles, dá EXACTAMENTE o que dava.
import { describe, expect, it } from "vitest";
import { COMPRIMENTO_NA_ALTURA, ESPEC, type TipoMockup } from "./catalogo3d";
import { CAMPOS_MEDIDA, eixosPorOmissao, textoDasMedidas, trocarEixo, validarEixos, type Eixos } from "./eixosMedida";
import { dimensoesDaMedida, type MedidaCm, type MedidasParciais } from "./previaProduto3d";

/** A regra de ANTES (cópia do dimensoesDaMedida sem eixos): a referência da regressão. Não importa nada do código novo. */
function dimensoesDeAntes(tipo: TipoMockup, m: MedidaCm): MedidasParciais | null {
  const { largura: l, comprimento: c, espessura: e, altura: a } = m;
  let r: MedidasParciais;
  if (tipo === "base_duche" || tipo === "banheira") {
    const lados = [l, c].filter((x): x is number => x !== undefined);
    r = { larguraCm: lados.length ? Math.max(...lados) : undefined, profundidadeCm: lados.length === 2 ? Math.min(...lados) : undefined, alturaCm: e ?? a };
  } else if (COMPRIMENTO_NA_ALTURA.includes(tipo)) r = { larguraCm: l, alturaCm: c ?? a, profundidadeCm: e };
  else r = { larguraCm: l, profundidadeCm: c, alturaCm: e ?? a };
  const dito = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as MedidasParciais;
  return Object.keys(dito).length ? dito : null;
}

const TIPOS = Object.keys(ESPEC) as TipoMockup[];
const MEDIDAS: MedidaCm[] = [
  { largura: 40, comprimento: 160, espessura: 25 },
  { largura: 170, comprimento: 70, espessura: 55 },
  { largura: 70, comprimento: 170 },
  { largura: 80 },
  { comprimento: 120 },
  { espessura: 8 },
  { altura: 200 },
  { largura: 60, altura: 90 },
  { largura: 60, comprimento: 60, espessura: 60 },
  { largura: 50, comprimento: 120, espessura: 4, altura: 77 },
];

describe("eixosPorOmissao: a regra de hoje, por tipo, como dados", () => {
  it("os tipos de COMPRIMENTO_NA_ALTURA: o comprimento é a altura e a espessura a profundidade", () => {
    for (const t of COMPRIMENTO_NA_ALTURA) expect(eixosPorOmissao(t)).toEqual({ largura: "largura", altura: "comprimento", profundidade: "espessura" });
  });
  it("os restantes tipos: o comprimento é a profundidade e a espessura a altura", () => {
    for (const t of TIPOS.filter((x) => !COMPRIMENTO_NA_ALTURA.includes(x) && x !== "base_duche" && x !== "banheira")) {
      expect(eixosPorOmissao(t)).toEqual({ largura: "largura", altura: "espessura", profundidade: "comprimento" });
    }
  });
  it("base de duche e banheira: o MAIOR lado é a largura e o menor a profundidade (decide-se pela medida), a espessura é a altura", () => {
    for (const t of ["base_duche", "banheira"] as const) {
      expect(eixosPorOmissao(t, { largura: 70, comprimento: 170, espessura: 55 })).toEqual({ largura: "comprimento", altura: "espessura", profundidade: "largura" });
      expect(eixosPorOmissao(t, { largura: 170, comprimento: 70 })).toEqual({ largura: "largura", altura: "espessura", profundidade: "comprimento" });
      // só um lado: esse é a largura
      expect(eixosPorOmissao(t, { comprimento: 120 })).toEqual({ largura: "comprimento", altura: "espessura", profundidade: "largura" });
      // sem medida: a omissão é a do tipo «de pé» (largura = largura)
      expect(validarEixos(eixosPorOmissao(t))).not.toBeNull();
    }
  });
  it("é sempre uma permutação válida dos três campos", () => {
    for (const t of TIPOS) for (const m of MEDIDAS) expect(validarEixos(eixosPorOmissao(t, m))).not.toBeNull();
  });
});

describe("validarEixos: só passa uma permutação dos três campos", () => {
  it("aceita uma permutação", () => {
    const e: Eixos = { largura: "espessura", altura: "largura", profundidade: "comprimento" };
    expect(validarEixos(e)).toEqual(e);
  });
  it("recusa campos repetidos, campos desconhecidos, em falta ou lixo", () => {
    expect(validarEixos({ largura: "largura", altura: "largura", profundidade: "comprimento" })).toBeNull();
    expect(validarEixos({ largura: "largura", altura: "altura", profundidade: "comprimento" })).toBeNull();
    expect(validarEixos({ largura: "largura", altura: "espessura" })).toBeNull();
    expect(validarEixos(null)).toBeNull();
    expect(validarEixos("largura")).toBeNull();
    expect(validarEixos(undefined)).toBeNull();
  });
  it("os campos são exactamente largura, comprimento e espessura", () => {
    expect([...CAMPOS_MEDIDA]).toEqual(["largura", "comprimento", "espessura"]);
  });
});

describe("trocarEixo: escolher um campo já usado TROCA os dois", () => {
  const base: Eixos = { largura: "largura", altura: "comprimento", profundidade: "espessura" };
  it("a altura passa a espessura: a profundidade fica com o comprimento", () => {
    expect(trocarEixo(base, "altura", "espessura")).toEqual({ largura: "largura", altura: "espessura", profundidade: "comprimento" });
  });
  it("a largura passa a comprimento: a altura fica com a largura", () => {
    expect(trocarEixo(base, "largura", "comprimento")).toEqual({ largura: "comprimento", altura: "largura", profundidade: "espessura" });
  });
  it("escolher o campo que o eixo já tem não muda nada", () => {
    expect(trocarEixo(base, "altura", "comprimento")).toEqual(base);
  });
  it("o resultado é sempre uma permutação válida e não muda o original", () => {
    for (const eixo of ["largura", "altura", "profundidade"] as const) for (const campo of CAMPOS_MEDIDA) {
      const novo = trocarEixo(base, eixo, campo);
      expect(validarEixos(novo)).not.toBeNull();
      expect(novo[eixo]).toBe(campo);
    }
    expect(base).toEqual({ largura: "largura", altura: "comprimento", profundidade: "espessura" });
  });
});

describe("dimensoesDaMedida: REGRESSÃO, sem eixos dá exactamente o que dava, para todos os tipos", () => {
  it("todos os tipos × várias medidas: igual à regra de antes", () => {
    expect(TIPOS.length).toBeGreaterThan(30);
    for (const t of TIPOS) for (const m of MEDIDAS) expect(dimensoesDaMedida(t, m), `${t} ${JSON.stringify(m)}`).toEqual(dimensoesDeAntes(t, m));
  });
  it("com os eixos de omissão explícitos dá o mesmo que sem eixos", () => {
    for (const t of TIPOS) for (const m of MEDIDAS) expect(dimensoesDaMedida(t, m, undefined, eixosPorOmissao(t, m)), `${t} ${JSON.stringify(m)}`).toEqual(dimensoesDaMedida(t, m));
  });
  it("sem medida legível, null", () => {
    expect(dimensoesDaMedida("coluna", {})).toBeNull();
    expect(dimensoesDaMedida("coluna", {}, undefined, { largura: "largura", altura: "comprimento", profundidade: "espessura" })).toBeNull();
  });
  it("a sanita com depósito continua a ganhar os 78 cm de altura mínimos com o nome (e eixos escolhidos)", () => {
    expect(dimensoesDaMedida("sanita", { largura: 37, comprimento: 65, espessura: 45 }, "Sanita Roca")).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 78 });
    expect(dimensoesDaMedida("sanita", { largura: 37, comprimento: 65, espessura: 45 }, "Sanita Roca", { largura: "largura", altura: "espessura", profundidade: "comprimento" })).toEqual({ larguraCm: 37, profundidadeCm: 65, alturaCm: 78 });
  });
});

describe("dimensoesDaMedida com eixos escolhidos: a peça deita-se e levanta-se", () => {
  const coluna: MedidaCm = { largura: 40, comprimento: 160, espessura: 25 };
  it("a coluna AXIS 40×160×25 de hoje: 40 de largura, 160 de altura, 25 de profundidade", () => {
    expect(dimensoesDaMedida("coluna", coluna)).toEqual({ larguraCm: 40, alturaCm: 160, profundidadeCm: 25 });
  });
  it("altura = espessura (e profundidade = comprimento): a peça deita-se, fica com 25 de altura e 160 de profundidade", () => {
    expect(dimensoesDaMedida("coluna", coluna, undefined, { largura: "largura", altura: "espessura", profundidade: "comprimento" })).toEqual({ larguraCm: 40, alturaCm: 25, profundidadeCm: 160 });
  });
  it("largura = comprimento: a peça fica com 160 de largura", () => {
    expect(dimensoesDaMedida("coluna", coluna, undefined, { largura: "comprimento", altura: "largura", profundidade: "espessura" })).toEqual({ larguraCm: 160, alturaCm: 40, profundidadeCm: 25 });
  });
  it("num tipo «de chão» (tampo), levantar: altura = comprimento", () => {
    expect(dimensoesDaMedida("tampo", coluna)).toEqual({ larguraCm: 40, profundidadeCm: 160, alturaCm: 25 });
    expect(dimensoesDaMedida("tampo", coluna, undefined, { largura: "largura", altura: "comprimento", profundidade: "espessura" })).toEqual({ larguraCm: 40, alturaCm: 160, profundidadeCm: 25 });
  });
  it("um campo sem valor (2D, sem espessura) deixa a dimensão por dizer: vem do nome ou das omissões do tipo", () => {
    expect(dimensoesDaMedida("coluna", { largura: 40, comprimento: 160 }, undefined, { largura: "largura", altura: "espessura", profundidade: "comprimento" })).toEqual({ larguraCm: 40, profundidadeCm: 160 });
  });
  it("a altura 1D (o atributo «altura») serve de reserva quando o campo escolhido para a altura não tem valor", () => {
    expect(dimensoesDaMedida("roupeiro", { altura: 200 }, undefined, { largura: "largura", altura: "comprimento", profundidade: "espessura" })).toEqual({ alturaCm: 200 });
  });
  it("eixos inválidos são ignorados (valem os de omissão)", () => {
    const lixo = { largura: "largura", altura: "largura", profundidade: "largura" } as unknown as Eixos;
    expect(dimensoesDaMedida("coluna", coluna, undefined, lixo)).toEqual(dimensoesDaMedida("coluna", coluna));
  });
});

describe("textoDasMedidas: a linha de texto equivalente às cotas (para leitores de ecrã)", () => {
  it("«L 40 · A 160 · P 25 cm»", () => {
    expect(textoDasMedidas({ larguraCm: 40, alturaCm: 160, profundidadeCm: 25 })).toBe("L 40 · A 160 · P 25 cm");
  });
  it("uma casa decimal só quando existe, com vírgula", () => {
    expect(textoDasMedidas({ larguraCm: 40.04, alturaCm: 87.5, profundidadeCm: 25 })).toBe("L 40 · A 87,5 · P 25 cm");
  });
});

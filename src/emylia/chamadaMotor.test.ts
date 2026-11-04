// 4/11: a transcrição em direto preenche os campos da Lead e do Contacto: o que o motor devolve passa ao formato do formulário.
// Os grupos são locais ao teste: os campos reais (campos.ts) mudam com as decisões do Rúben e isto não depende deles.
import { describe, expect, it } from "vitest";
import type { Def, Grupo } from "./campos";
import { aAplicar, camposParaMotor, juntarVarios, propostas, valorParaCampo, type CampoExtraido, type Extracao } from "./chamadaMotor";

const GRUPOS: Grupo[] = [
  { titulo: "Qualificação", campos: [
    { k: "imovel", l: "Tipo de imóvel", t: "escolha", op: ["Apartamento", "Moradia"], se: { k: "x", v: ["y"] } },
    { k: "posse", l: "O cliente é", t: "escolha", op: ["Proprietário", "Inquilino"] },
    { k: "outros_orc", l: "Pediu outros orçamentos", t: "sim_nao" },
    { k: "pedido", l: "O que o cliente pediu", t: "texto_longo" },
    { k: "divisoes", l: "Divisões", t: "varios", op: ["A", "B", "C"] },
    { k: "andar", l: "Andar", t: "contador", min: 0, max: 30 },
  ] },
  { titulo: "Escondido", oculto: true, campos: [{ k: "secreto", l: "Secreto", t: "texto" }] },
];
const x = (chave: string, valor: CampoExtraido["valor"], estado: CampoExtraido["estado"] = "preenchido", confianca = 1): CampoExtraido =>
  ({ chave, rotulo: chave, tipo: "x", valor, valor_rotulo: null, confianca, excerto: "Cliente: …", estado });
const def = (k: string): Def => GRUPOS.flatMap((g) => g.campos).find((c) => c.k === k)!;

describe("chamada em direto · do motor ao formulário (4/11)", () => {
  it("manda ao motor só k, l, t, op, ajuda e un dos campos, sem os grupos ocultos", () => {
    const lista = camposParaMotor(GRUPOS);
    expect(lista.map((c) => c.k)).toEqual(["imovel", "posse", "outros_orc", "pedido", "divisoes", "andar"]);
    expect(lista[0]).toEqual({ k: "imovel", l: "Tipo de imóvel", t: "escolha", op: ["Apartamento", "Moradia"], ajuda: undefined, un: undefined });
    expect(Object.keys(lista[0])).not.toContain("se");
  });
  it("sim/não vem como booleano e grava-se «Sim»/«Não»; uma escolha só entra se for uma das opções (sem acentos a contar)", () => {
    expect(valorParaCampo(def("outros_orc"), x("outros_orc", true))).toBe("Sim");
    expect(valorParaCampo(def("outros_orc"), x("outros_orc", false))).toBe("Não");
    expect(valorParaCampo(def("imovel"), x("imovel", "apartamento"))).toBe("Apartamento");
    expect(valorParaCampo(def("imovel"), x("imovel", "Quinta"))).toBeNull();
    expect(valorParaCampo(def("andar"), x("andar", "3"))).toBe("3");
    expect(valorParaCampo(def("andar"), x("andar", 45))).toBeNull();
  });
  it("o que o motor não ouviu (em_falta ou null) não entra", () => {
    expect(valorParaCampo(def("imovel"), x("imovel", null))).toBeNull();
    expect(valorParaCampo(def("imovel"), x("imovel", "Moradia", "em_falta", 0))).toBeNull();
  });
  it("as propostas trazem o que o campo já tinha, e por defeito só se escrevem as vazias", () => {
    const ext: Extracao = { resumo: "", motor: "ollama", fichas: [{ campos: [x("imovel", "Moradia"), x("posse", "Proprietário", "rever", 0.5), x("pedido", "Casa de banho nova"), x("secreto", "não")] }] };
    const p = propostas(ext, GRUPOS, { imovel: "Apartamento" });
    expect(p.map((q) => q.k)).toEqual(["imovel", "posse", "pedido"]);
    expect(p[0].jaTinha).toBe("Apartamento");
    expect(aAplicar(p, false).map((q) => q.k)).toEqual(["posse", "pedido"]);
    expect(aAplicar(p, true).map((q) => q.k)).toEqual(["imovel", "posse", "pedido"]);
  });
  it("num campo de várias opções cada opção conta se for dita inteira, e junta-se ao que já estava marcado", () => {
    const c = def("divisoes");
    expect(valorParaCampo(c, x("divisoes", "b, c e também d"))).toBe("B, C");
    expect(juntarVarios(c, "A", "B, C")).toBe("A, B, C");
    expect(juntarVarios(c, "", "B")).toBe("B");
  });
});

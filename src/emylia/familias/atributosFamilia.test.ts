// O adaptador dos atributos ESTRUTURADOS do catálogo (Produto.attrs + AtributoDef) para o que o núcleo das famílias lê,
// e a leitura/ordenação do texto das medidas reais (1D, 2D, 3D, intervalos, mm).
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto, MedidaAtributo } from "../v2/catalogoModelo";
import { atributosDoItem, compararMedidas, lerMedidaTexto, medidaEmCm, tipoDaMedida } from "./atributosFamilia";

const A_MED = "a-medida", A_COR = "a-cor", A_TON = "a-ton", A_CUBAS = "a-cubas";
const DEFS: AtributoDef[] = [
  { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
  {
    id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2,
    opcoes: [
      { id: "o-branco", valor: "BRANCO", nome: "Branco", hex: "#F5F5F0", ordem: 1 },
      { id: "o-bp", valor: "BRANCO/PRETO", nome: "Branco/Preto", hex: "#ffffff, #000000", ordem: 2 },
      { id: "o-sem", valor: "PEDRA", nome: "Pedra", hex: null, ordem: 3 },
      { id: "o-mau", valor: "MAU", nome: "Cor mal gravada", hex: "azul", ordem: 4 },
      { id: "o-preto", valor: "PRETO", nome: "Preto", hex: "#000000", ordem: 5 },
    ],
  },
  { id: A_TON, codigo: "tonalidade", nome: "Tonalidade", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: "o-claro", valor: "CLARO", nome: "Claro", hex: "#EEEEEE", ordem: 1 }] },
  { id: A_CUBAS, codigo: "cubas", nome: "Nº de cubas", tipo: "lista", temHex: false, ordem: 4, opcoes: [{ id: "o-1", valor: "1", nome: "1 cuba", hex: null, ordem: 1 }] },
];
const med = (m: MedidaAtributo): AtributoProduto => ({ atributoId: A_MED, medida: m });
const opc = (atributoId: string, opcaoId: string): AtributoProduto => ({ atributoId, opcaoId });
const d2 = (largura: number | { de: number; ate: number }, comprimento: number | { de: number; ate: number }, unidade: "cm" | "mm" = "cm"): MedidaAtributo =>
  ({ tipo: "2D", largura, comprimento, espessura: null, unidade });

describe("atributosDoItem: texto dos atributos estruturados", () => {
  it("1D, 2D e 3D saem com o texto do catálogo (textoMedida), pelo nome do atributo", () => {
    expect(atributosDoItem({ attrs: [med({ tipo: "1D", dimensao: "largura", valor: 70, unidade: "cm" })] }, DEFS).atributos).toEqual({ Medida: "Largura 70 cm" });
    expect(atributosDoItem({ attrs: [med(d2(60, 60))] }, DEFS).atributos).toEqual({ Medida: "60×60 cm" });
    expect(atributosDoItem({ attrs: [med({ tipo: "3D", largura: 60, comprimento: 60, espessura: 1, unidade: "cm" })] }, DEFS).atributos).toEqual({ Medida: "60×60×1 cm" });
    expect(atributosDoItem({ attrs: [med(d2(12.5, 25, "mm"))] }, DEFS).atributos).toEqual({ Medida: "12,5×25 mm" });
  });

  it("a cor e os outros atributos de lista saem pelo nome da opção; o hex vem da OPÇÃO", () => {
    const r = atributosDoItem({ attrs: [med(d2(60, 60)), opc(A_COR, "o-branco"), opc(A_TON, "o-claro"), opc(A_CUBAS, "o-1")] }, DEFS);
    expect(r.atributos).toEqual({ Medida: "60×60 cm", Cor: "Branco", Tonalidade: "Claro", "Nº de cubas": "1 cuba" });
    expect(r.hex).toEqual({ Cor: ["#F5F5F0"] });
  });

  it("um atributo sem temHex nunca dá hex, mesmo que a opção traga um", () => {
    expect(atributosDoItem({ attrs: [opc(A_TON, "o-claro")] }, DEFS).hex).toEqual({});
  });

  it("cor dupla: uma opção com dois hex dá uma lista, pela ordem, normalizada em maiúsculas", () => {
    const r = atributosDoItem({ attrs: [opc(A_COR, "o-bp")] }, DEFS);
    expect(r.atributos.Cor).toBe("Branco/Preto");
    expect(r.hex.Cor).toEqual(["#FFFFFF", "#000000"]);
  });

  it("cor dupla por dois valores do mesmo atributo: nomes juntos com «/» e hex em lista", () => {
    const r = atributosDoItem({ attrs: [opc(A_COR, "o-branco"), opc(A_COR, "o-preto")] }, DEFS);
    expect(r.atributos.Cor).toBe("Branco/Preto");
    expect(r.hex.Cor).toEqual(["#F5F5F0", "#000000"]);
  });

  it("opção sem hex: a cor existe pelo nome e não há hex; hex inválido ignora-se e deixa um aviso", () => {
    const sem = atributosDoItem({ attrs: [opc(A_COR, "o-sem")] }, DEFS);
    expect(sem).toMatchObject({ atributos: { Cor: "Pedra" }, hex: {}, avisos: [] });
    const mau = atributosDoItem({ attrs: [opc(A_COR, "o-mau")] }, DEFS);
    expect(mau.atributos.Cor).toBe("Cor mal gravada");
    expect(mau.hex).toEqual({});
    expect(mau.avisos).toHaveLength(1);
    expect(mau.avisos[0]).toMatch(/Cor.*hex inválido/);
  });

  it("opção que a definição já não traz: usa o valor que veio com o produto, sem hex", () => {
    const r = atributosDoItem({ attrs: [{ atributoId: A_COR, opcaoId: "o-apagada", valor: "Antigo", inativa: true }] }, DEFS);
    expect(r.atributos).toEqual({ Cor: "Antigo" });
    expect(r.hex).toEqual({});
  });

  it("sem attrs, vazio, atributo desconhecido ou valor vazio: salta-se sem rebentar", () => {
    const vazio = { atributos: {}, hex: {}, intervalos: [], avisos: [] };
    expect(atributosDoItem({}, DEFS)).toEqual(vazio);
    expect(atributosDoItem({ attrs: [] }, DEFS)).toEqual(vazio);
    expect(atributosDoItem({ attrs: [opc(A_COR, "o-branco")] }, [])).toEqual(vazio);
    expect(atributosDoItem({ attrs: [opc(A_COR, "o-branco")] }, undefined)).toEqual(vazio);
    expect(atributosDoItem({ attrs: [{ atributoId: "desconhecido", valor: "x" }, { atributoId: A_TON, valor: "   " }] }, DEFS)).toEqual(vazio);
  });

  it("intervalos: a medida em intervalo fica assinalada pelo nome do atributo (e o texto mostra o intervalo)", () => {
    const r = atributosDoItem({ attrs: [med(d2({ de: 91, ate: 100 }, 90))] }, DEFS);
    expect(r.atributos.Medida).toBe("91–100 × 90 cm");
    expect(r.intervalos).toEqual(["Medida"]);
    expect(atributosDoItem({ attrs: [med({ tipo: "1D", dimensao: "largura", valor: { de: 100, ate: 105 }, unidade: "cm" })] }, DEFS))
      .toMatchObject({ atributos: { Medida: "Largura 100–105 cm" }, intervalos: ["Medida"] });
    expect(atributosDoItem({ attrs: [med(d2(60, 60))] }, DEFS).intervalos).toEqual([]);
  });

  it("não muta os argumentos", () => {
    const attrs = [opc(A_COR, "o-bp")], antes = JSON.stringify([attrs, DEFS]);
    atributosDoItem({ attrs }, DEFS);
    expect(JSON.stringify([attrs, DEFS])).toBe(antes);
  });
});

describe("lerMedidaTexto / tipoDaMedida: os formatos reais", () => {
  it("1D: «Largura 70 cm»", () => {
    expect(lerMedidaTexto("Largura 70 cm")).toMatchObject({ tipo: "1D", dimensao: "largura", intervalo: false, dims: [{ de: 70, ate: 70 }] });
    expect(tipoDaMedida("Espessura 9 mm")).toBe("1D");
  });
  it("2D e 3D, com × ou x, vírgula decimal e sem espaços", () => {
    expect(lerMedidaTexto("60×60 cm")).toMatchObject({ tipo: "2D", unidade: "cm" });
    expect(lerMedidaTexto("60x120 cm")?.dims).toEqual([{ de: 60, ate: 60 }, { de: 120, ate: 120 }]);
    expect(lerMedidaTexto("12,5×25×0,8 mm")).toMatchObject({ tipo: "3D", unidade: "mm", dims: [{ de: 12.5, ate: 12.5 }, { de: 25, ate: 25 }, { de: 0.8, ate: 0.8 }] });
  });
  it("intervalos em qualquer dimensão", () => {
    expect(lerMedidaTexto("91–100 × 90 cm")).toMatchObject({ tipo: "2D", intervalo: true, dims: [{ de: 91, ate: 100 }, { de: 90, ate: 90 }] });
    expect(lerMedidaTexto("Largura 100–105 cm")).toMatchObject({ tipo: "1D", intervalo: true });
    expect(tipoDaMedida("91-100 × 90 cm")).toBe("2D");
  });
  it("o que não é medida: undefined (e «texto»)", () => {
    for (const t of ["", "  ", "Grande", "1 cuba", "60", "60× cm", "Largura cm", "Peso 70 cm"]) expect(lerMedidaTexto(t)).toBeUndefined();
    expect(tipoDaMedida("Grande")).toBe("texto");
    expect(tipoDaMedida("")).toBe("texto");
  });
  it("medidaEmCm converte mm para cm e devolve o limite inferior dos intervalos", () => {
    expect(medidaEmCm("600×300 mm")).toMatchObject({ largura: 60, comprimento: 30, area: 1800 });
    expect(medidaEmCm("91–100 × 90 cm")).toMatchObject({ largura: 91, comprimento: 90 });
    expect(medidaEmCm("Largura 70 cm")).toBeUndefined();
    expect(medidaEmCm("Grande")).toBeUndefined();
  });
});

describe("compararMedidas: ordem estável com os formatos reais", () => {
  const ordenar = (l: string[]) => [...l].sort(compararMedidas);

  it("2D por área (não por texto): 30×60 < 60×60 < 60×120", () => {
    expect(ordenar(["60×120 cm", "30×60 cm", "60×60 cm"])).toEqual(["30×60 cm", "60×60 cm", "60×120 cm"]);
  });
  it("mm e cm comparam-se em cm; o número com vírgula conta como decimal", () => {
    expect(ordenar(["600×600 mm", "30×30 cm", "12,5×25 cm"])).toEqual(["12,5×25 cm", "30×30 cm", "600×600 mm"]);
  });
  it("3D: a espessura desempata duas medidas iguais em largura e comprimento", () => {
    expect(ordenar(["60×60×2 cm", "60×60×1 cm", "60×60 cm"])).toEqual(["60×60 cm", "60×60×1 cm", "60×60×2 cm"]);
  });
  it("1D: pelo valor (70 antes de 100, não por texto) e, entre dimensões, largura antes de altura antes de comprimento antes de espessura", () => {
    expect(ordenar(["Largura 100 cm", "Largura 70 cm", "Largura 9 cm"])).toEqual(["Largura 9 cm", "Largura 70 cm", "Largura 100 cm"]);
    expect(ordenar(["Espessura 1 cm", "Comprimento 1 cm", "Altura 1 cm", "Largura 1 cm"])).toEqual(["Largura 1 cm", "Altura 1 cm", "Comprimento 1 cm", "Espessura 1 cm"]);
  });
  it("intervalos ordenam-se pelo limite inferior e depois pelo superior", () => {
    expect(ordenar(["100×90 cm", "91–100 × 90 cm", "60×90 cm", "91–95 × 90 cm"])).toEqual(["60×90 cm", "91–95 × 90 cm", "91–100 × 90 cm", "100×90 cm"]);
  });
  it("mistura: 2D/3D primeiro, depois 1D, depois o texto (com números por valor)", () => {
    expect(ordenar(["Grande", "Largura 70 cm", "10 cubas", "60×60 cm", "2 cubas", "Cabe"]))
      .toEqual(["60×60 cm", "Largura 70 cm", "2 cubas", "10 cubas", "Cabe", "Grande"]);
  });
  it("texto: ordem natural em português (acentos) e determinística", () => {
    expect(ordenar(["Único", "Padrão", "Ótimo"])).toEqual(["Ótimo", "Padrão", "Único"]);
  });
  it("o resultado não depende da ordem de entrada nem de valores iguais com texto diferente (600×600 mm vs 60×60 cm)", () => {
    const base = ["60×60 cm", "600×600 mm", "Largura 70 cm", "Grande", "91–100 × 90 cm", "30×60 cm", "", "Largura 70 cm"];
    const esperado = ordenar(base);
    for (let i = 0; i < 10; i++) {
      const baralhada = [...base].sort((a, b) => ((a.length * (i + 3)) % 7) - ((b.length * (i + 3)) % 7) || a.localeCompare(b, "en"));
      expect(ordenar(baralhada)).toEqual(esperado);
    }
  });
  it("é antissimétrica e reflexiva para todos os formatos", () => {
    const amostra = ["60×60 cm", "600×600 mm", "Largura 70 cm", "Altura 70 cm", "Grande", "91–100 × 90 cm", "", "60×60×1 cm", "2 cubas"];
    const sinal = (n: number) => Math.sign(n);
    for (const a of amostra) {
      expect(compararMedidas(a, a)).toBe(0);
      for (const b of amostra) expect(sinal(compararMedidas(a, b))).toBe(-sinal(compararMedidas(b, a)) || 0);
    }
  });
});

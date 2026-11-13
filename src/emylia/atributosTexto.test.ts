// 13/11: os atributos do produto (Medida, Cor, Tonalidade…): as contas e os textos puros (atributosProduto.ts).
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";
import { hexValido, mesmosAtributos, normalizarHex, resumoAtributos, textoMedida, textoPesquisaAtributos, valoresParaGravar } from "./atributosTexto";
import { pesquisarProdutos } from "./fichaServico";

const A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_BRI = "aaaaaaaa-0000-4000-a000-000000000003";
const O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001", O_FOSCO = "bbbbbbbb-0000-4000-a000-000000000002";
const DEFS: AtributoDef[] = [
  { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
  { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: O_PRETO, valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1 }] },
  { id: A_BRI, codigo: "brilho", nome: "Brilho", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: O_FOSCO, valor: "FOSCO", nome: "Fosco", hex: null, ordem: 1 }] },
];
const MED = { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } as const;

describe("hex", () => {
  it("só #RRGGBB conta; sem o # acrescenta-se", () => {
    expect(hexValido("#1a2B3c")).toBe(true);
    for (const x of ["", "#12345", "#1234567", "#GGGGGG", "azul", "123456"]) expect(hexValido(x)).toBe(false);
    expect(normalizarHex(" 1a2b3c ")).toBe("#1A2B3C");
    expect(normalizarHex("#abcdef")).toBe("#ABCDEF");
    expect(normalizarHex("xyz")).toBeNull();
    expect(normalizarHex("")).toBeNull();
  });
});

describe("textoMedida", () => {
  it("2D e 3D, com a unidade e a vírgula portuguesa", () => {
    expect(textoMedida(MED)).toBe("60×60 cm");
    expect(textoMedida({ tipo: "3D", largura: 12.5, comprimento: 25, espessura: 0.8, unidade: "mm" })).toBe("12,5×25×0,8 mm");
  });
});

describe("resumoAtributos (a linha curta da lista)", () => {
  it("«Nome: valor» por ordem do atributo, separados por ·", () => {
    const attrs: AtributoProduto[] = [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }];
    expect(resumoAtributos(attrs, DEFS)).toBe("Medida: 60×60 cm · Cor: Preto");
  });
  it("sem atributos, sem definições, ou com um atributo que já não existe: vazio ou salta-o", () => {
    expect(resumoAtributos(undefined, DEFS)).toBe("");
    expect(resumoAtributos([], DEFS)).toBe("");
    expect(resumoAtributos([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }], undefined)).toBe("");
    expect(resumoAtributos([{ atributoId: "outro", opcaoId: "x", valor: "Y" }, { atributoId: A_BRI, opcaoId: O_FOSCO, valor: "Fosco" }], DEFS)).toBe("Brilho: Fosco");
  });
  it("mostra o nome da opção (Fosco), não o texto em maiúsculas que a base guarda (FOSCO); sem opção resolvida mostra o texto", () => {
    expect(resumoAtributos([{ atributoId: A_BRI, opcaoId: O_FOSCO, valor: "FOSCO" }], DEFS)).toBe("Brilho: Fosco");
    expect(resumoAtributos([{ atributoId: A_BRI, valor: "ACETINADO" }], DEFS)).toBe("Brilho: ACETINADO");
  });
  it("a opção que a base já não manda mostra o texto que veio com o produto", () => {
    expect(resumoAtributos([{ atributoId: A_COR, opcaoId: "apagada", valor: "Azul" }], DEFS)).toBe("Cor: Azul");
  });
});

describe("valoresParaGravar (o que a base recebe)", () => {
  it("lista → {atributo, opcao}; medida → {atributo, medida}", () => {
    expect(valoresParaGravar([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }])).toEqual([
      { atributo: A_COR, opcao: O_PRETO }, { atributo: A_MED, medida: MED },
    ]);
  });
  it("um atributo sem opção nem medida não vai", () => {
    expect(valoresParaGravar([{ atributoId: A_COR }])).toEqual([]);
  });
});

describe("mesmosAtributos", () => {
  it("compara pelo atributo e pelo valor, sem contar a ordem nem o texto", () => {
    const a: AtributoProduto[] = [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }];
    const b: AtributoProduto[] = [{ atributoId: A_MED, medida: { ...MED } }, { atributoId: A_COR, opcaoId: O_PRETO }];
    expect(mesmosAtributos(a, b)).toBe(true);
    expect(mesmosAtributos(a, [a[0]])).toBe(false);
    expect(mesmosAtributos([a[0]], [{ atributoId: A_COR, opcaoId: O_FOSCO }])).toBe(false);
    expect(mesmosAtributos(a, [a[0], { atributoId: A_MED, medida: { ...MED, largura: 30 } }])).toBe(false);
    expect(mesmosAtributos(undefined, [])).toBe(true);
  });
});

describe("a pesquisa de produtos acha pelos atributos", () => {
  const base = { custo: 1, un: "un", marca: "", fornecedor: "", data: "", no: null };
  const L = [
    { ...base, id: "1", n: "Mosaico", attrs: [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }, { atributoId: A_MED, medida: MED }] },
    { ...base, id: "2", n: "Lavatório" },
  ];
  it("pelo valor da opção e pela medida, sem acentos nem maiúsculas", () => {
    expect(textoPesquisaAtributos(L[0])).toContain("Preto");
    expect(textoPesquisaAtributos(L[1])).toBe("");
    expect(pesquisarProdutos(L, "preto").map((p) => p.id)).toEqual(["1"]);
    expect(pesquisarProdutos(L, "60×60").map((p) => p.id)).toEqual(["1"]);
    expect(pesquisarProdutos(L, "lavat").map((p) => p.id)).toEqual(["2"]);
  });
});
